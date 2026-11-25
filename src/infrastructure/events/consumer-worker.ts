import { setTimeout as sleep } from "node:timers/promises";
import type { Logger } from "pino";
import { logger } from "../logging/logger.js";

const HEARTBEAT_INTERVAL_MS = 60_000;

export interface ConsumerProcessor {
    processOne(): Promise<boolean>;
}

export class ConsumerWorker {
    private readonly controller = new AbortController();

    constructor(
        private readonly consumer: ConsumerProcessor,
        private readonly pollIntervalMs = 2000,
        private readonly log: Logger = logger,
        private readonly now: () => number = () => performance.now()
    ) {
        if (
            !Number.isSafeInteger(pollIntervalMs) ||
            pollIntervalMs < 0
        ) {
            throw new Error("Invalid consumer polling interval");
        }
    }

    stop(): void {
        this.controller.abort();
    }

    async run(): Promise<void> {
        const startedAt = this.now();
        let lastHeartbeatAt = startedAt;
        let pollCount = 0;
        let processedCount = 0;

        while (!this.controller.signal.aborted) {
            const processed = await this.consumer.processOne();

            if (this.controller.signal.aborted) {
                break;
            }

            pollCount++;

            if (processed) {
                processedCount++;
            }

            const currentTime = this.now();

            if (
                currentTime - lastHeartbeatAt >= HEARTBEAT_INTERVAL_MS
            ) {
                this.log.info(
                    {
                        event: "consumer_worker_heartbeat",
                        pollCount,
                        processedCount,
                        uptimeSeconds: Math.floor(
                            (currentTime - startedAt) / 1000
                        )
                    },
                    "Event consumer worker heartbeat"
                );

                lastHeartbeatAt = currentTime;
                pollCount = 0;
                processedCount = 0;
            }

            if (!processed) {
                try {
                    await sleep(this.pollIntervalMs, undefined, {
                        signal: this.controller.signal
                    });
                } catch (error) {
                    if (
                        this.controller.signal.aborted &&
                        error instanceof Error &&
                        error.name === "AbortError"
                    ) {
                        break;
                    }

                    throw error;
                }
            }
        }
    }
}
