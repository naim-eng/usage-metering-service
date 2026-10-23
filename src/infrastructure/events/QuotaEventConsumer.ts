import type { PrismaClient } from "../../generated/prisma/client.js";

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
        ) => Promise<void> = async (event) => {
            console.log(
                `[Event Consumer] Processing ${event.event_type}`,
                event.payload
            );
        }
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
                console.warn(
                    `[Event Consumer] Event ${event.id} lost its processing lease`
                );
                return false;
            }

            return true;
        } catch (error) {
            const message =
                error instanceof Error ? error.message : String(error);

            const exhausted = event.attempts >= MAX_ATTEMPTS;

            const retryDelaySeconds =
                Math.min(5 * 2 ** (event.attempts - 1), 300);

            await this.prisma.outbox_events.updateMany({
                where: {
                    id: event.id,
                    status: "processing",
                    attempts: event.attempts
                },
                data: {
                    status: exhausted ? "failed" : "pending",
                    available_at: new Date(
                        Date.now() + retryDelaySeconds * 1000
                    ),
                    last_error: message
                }
            });

            console.error(
                `[Event Consumer] Failed event ${event.id}: ${message}`
            );

            return false;
        }
    }
}
