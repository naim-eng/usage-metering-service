import type { ErrorRequestHandler } from "express";
import { logger } from "./logger.js";

export const errorHandler: ErrorRequestHandler = (
    _error,
    _req,
    res,
    next
) => {
    if (res.headersSent) {
        next(_error);
        return;
    }

    logger.error(
        { event: "unhandled_api_error" },
        "Unhandled API error"
    );

    res.status(500).json({
        error: "Internal server error"
    });
};
