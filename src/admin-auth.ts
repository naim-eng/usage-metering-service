import { createHash, timingSafeEqual } from "node:crypto";
import type { Request, Response, NextFunction } from "express";

function digest(value: string): Buffer {
    return createHash("sha256").update(value, "utf8").digest();
}

export function isValidAdminKey(
    supplied: string | undefined,
    expected: string | undefined
): boolean {
    if (
        !supplied ||
        !expected ||
        !/^[\x21-\x7E]+$/.test(supplied)
    ) {
        return false;
    }

    return timingSafeEqual(
        digest(supplied),
        digest(expected)
    );
}

export function authenticateAdmin(
    req: Request,
    res: Response,
    next: NextFunction
): void {
    res.setHeader("Cache-Control", "no-store");

    const values = req.headersDistinct["x-admin-key"];

    if (
        values?.length !== 1 ||
        !isValidAdminKey(values[0], process.env.ADMIN_API_KEY)
    ) {
        res.status(401).json({ error: "Unauthorized" });
        return;
    }

    next();
}
