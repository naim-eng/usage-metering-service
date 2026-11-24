import type { PrismaClient } from "../../generated/prisma/client.js";
import { logger } from "../logging/logger.js";
import type { Logger } from "pino";

interface ClaimedEvent {
    id: bigint;
    event_type: string;
    payload: unknown;
    attempts: number;
}

const MAX_ATTEMPTS = 5;
const LEASE_SECONDS = 60;

export class QuotaEventConsumer {
    constructor(
        private readonly prisma: PrismaClient,
        private readonly handleEvent: (
            event: ClaimedEvent
        ) => Promise<void> = async () => {},
        private readonly log: Logger = logger
    ) {}

    async processOne(eventId?: bigint): Promise<boolean> {
        const targetId = eventId ?? null;

        // Mark events whose final processing attempt expired.
        // Only expired leases are eligible, so active workers
        // completing their final attempt are not interrupted.
        await this.prisma.outbox_events.updateMany({
            where: {
                status: "processing",
                attempts: { gte: MAX_ATTEMPTS },
                available_at: { lte: new Date() }
            },
            data: {
                status: "failed",
                last_error: "Processing lease expired after maximum attempts"
            }
        });

        const events = await this.prisma.$transaction(async (tx) => {
            return tx.$queryRaw<ClaimedEvent[]>`
                WITH next_event AS (
                    SELECT id
                    FROM outbox_events
                    WHERE (
                        (status = 'pending' AND available_at <= NOW())
                        OR
                        (status = 'processing' AND available_at <= NOW())
                    )
                    AND attempts < ${MAX_ATTEMPTS}
                    AND (${targetId}::bigint IS NULL OR id = ${targetId}::bigint)
                    ORDER BY available_at, id
                    FOR UPDATE SKIP LOCKED
                    LIMIT 1
                )
                UPDATE outbox_events AS event
                SET status = 'processing',
                    attempts = event.attempts + 1,
                    available_at = NOW()
                        + (${LEASE_SECONDS} * INTERVAL '1 second')
                FROM next_event
                WHERE event.id = next_event.id
                RETURNING
                    event.id,
                    event.event_type,
                    event.payload,
                    event.attempts
            `;
        });

        if (events.length === 0) {
            return false;
        }

        const event = events[0];

        try {
            this.log.info(
                {
                    event: "consumer_event_processing",
                    eventId: event.id.toString(),
                    attempt: event.attempts
                },
                "Processing quota event"
            );

            await this.handleEvent(event);

            const result = await this.prisma.outbox_events.updateMany({
                where: {
                    id: event.id,
                    status: "processing",
                    attempts: event.attempts,
                    available_at: { gt: new Date() }
                },
                data: {
                    status: "completed",
                    processed_at: new Date(),
                    last_error: null
                }
            });

            if (result.count !== 1) {
                this.log.warn(
                    {
                        event: "consumer_lease_lost",
                        eventId: event.id.toString(),
                        attempt: event.attempts
                    },
                    "Event processing lease lost"
                );
                return false;
            }

            return true;
        } catch {
            // Never persist raw exception messages.
            // They may contain credentials or sensitive event data.
            const message = "Event handler failed";

            const exhausted = event.attempts >= MAX_ATTEMPTS;

            const retryDelaySeconds =
                Math.min(5 * 2 ** (event.attempts - 1), 300);

            const result = await this.prisma.outbox_events.updateMany({
                where: {
                    id: event.id,
                    status: "processing",
                    attempts: event.attempts,
                    available_at: { gt: new Date() }
                },
                data: {
                    status: exhausted ? "failed" : "pending",
                    available_at: new Date(
                        Date.now() + retryDelaySeconds * 1000
                    ),
                    last_error: message
                }
            });

            if (result.count !== 1) {
                this.log.warn(
                    {
                        event: "consumer_lease_lost",
                        eventId: event.id.toString(),
                        attempt: event.attempts
                    },
                    "Event processing lease lost"
                );
                return false;
            }

            this.log.error(
                {
                    event: "consumer_event_failed",
                    eventId: event.id.toString(),
                    attempt: event.attempts,
                    exhausted
                },
                "Event handler failed"
            );

            return false;
        }
    }
}
