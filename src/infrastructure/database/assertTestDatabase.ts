
import type { PrismaClient } from "../../generated/prisma/client.js";

export async function assertTestDatabase(
    prisma: PrismaClient
): Promise<void> {
    const result = await prisma.$queryRaw<
        Array<{ database_name: string }>
    >`
        SELECT current_database() AS database_name
    `;

    if (result[0]?.database_name !== "usage_metering_test") {
        throw new Error(
            "Refusing to run integration tests outside usage_metering_test"
        );
    }
}
