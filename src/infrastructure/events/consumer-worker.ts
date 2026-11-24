import { setTimeout as sleep } from "node:timers/promises";

export interface ConsumerProcessor {
    processOne(): Promise<boolean>;
}

export class ConsumerWorker {
    private readonly controller = new AbortController();

    constructor(
        private readonly consumer: ConsumerProcessor,
        private readonly pollIntervalMs = 2000
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
        while (!this.controller.signal.aborted) {
            const processed = await this.consumer.processOne();

            if (this.controller.signal.aborted) {
                break;
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
