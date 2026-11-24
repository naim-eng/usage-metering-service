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
        console.log(`Received ${signal}. Shutting down API.`);

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
            console.log("API shutdown completed.");
            onComplete(0);
        } catch (error) {
            console.error("API shutdown failed:", error);
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
