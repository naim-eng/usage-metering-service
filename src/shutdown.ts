import { logger } from "./infrastructure/logging/logger.js";
import type { Server } from "node:http";

export interface ShutdownDatabase {
    $disconnect(): Promise<void>;
}

export interface ShutdownOptions {
    timeoutMs?: number;
    onComplete?: (exitCode: number) => void;
}

export function registerGracefulShutdown(
    server: Server,
    database: ShutdownDatabase,
    options: ShutdownOptions = {}
): (signal: string) => Promise<void> {
    const timeoutMs = options.timeoutMs ?? 10_000;
    const onComplete = options.onComplete ?? ((code: number) => {
        process.exit(code);
    });

    let shuttingDown = false;

    async function shutdown(signal: string): Promise<void> {
        if (shuttingDown) {
            return;
        }

        shuttingDown = true;
        logger.info(
            { event: "api_shutdown_started" },
            "API shutdown started"
        );

        let timer: ReturnType<typeof setTimeout> | undefined;

        const deadline = new Promise<never>((_, reject) => {
            timer = setTimeout(() => {
                server.closeAllConnections();
                reject(new Error("Shutdown deadline exceeded"));
            }, timeoutMs);
        });

        const cleanup = async (): Promise<void> => {
            await new Promise<void>((resolve, reject) => {
                server.close(error => {
                    if (error) {
                        reject(error);
                    } else {
                        resolve();
                    }
                });
            });

            await database.$disconnect();
        };

        try {
            await Promise.race([cleanup(), deadline]);
            logger.info(
                { event: "api_shutdown_completed" },
                "API shutdown completed"
            );
            onComplete(0);
        } catch {
            logger.error(
                { event: "api_shutdown_failed" },
                "API shutdown failed"
            );
            onComplete(1);
        } finally {
            if (timer) {
                clearTimeout(timer);
            }
        }
    }

    return shutdown;
}

export function registerShutdownSignals(
    shutdown: (signal: string) => Promise<void>
): void {
    process.once("SIGTERM", () => {
        void shutdown("SIGTERM");
    });

    process.once("SIGINT", () => {
        void shutdown("SIGINT");
    });
}
