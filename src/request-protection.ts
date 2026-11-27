import express from "express";
import type {
    RequestHandler,
    ErrorRequestHandler
} from "express";

export const JSON_BODY_LIMIT = 16 * 1024;

export const parseJsonBody = express.json({
    limit: JSON_BODY_LIMIT,
    strict: true,
    inflate: false
});

export const requireJsonContentType: RequestHandler = (
    req, res, next
) => {
    const hasBody =
        req.headers["transfer-encoding"] !== undefined ||
        Number(req.headers["content-length"] ?? 0) > 0;

    if (hasBody && !req.is("application/json")) {
        res.status(415).json({
            error: "Unsupported content type"
        });
        return;
    }

    next();
};

export const requireJsonObject: RequestHandler = (
    req, res, next
) => {
    if (
        req.body !== undefined &&
        (
            req.body === null ||
            typeof req.body !== "object" ||
            Array.isArray(req.body)
        )
    ) {
        res.status(400).json({
            error: "Invalid JSON object"
        });
        return;
    }

    next();
};

export const requestParsingErrorHandler: ErrorRequestHandler = (
    error, _req, res, next
) => {
    if (res.headersSent) {
        next(error);
        return;
    }

    switch (error?.type) {
        case "entity.too.large":
            res.status(413).json({
                error: "Request body too large"
            });
            return;

        case "entity.parse.failed":
        case "request.size.invalid":
        case "request.aborted":
            res.status(400).json({
                error: "Invalid request body"
            });
            return;

        case "encoding.unsupported":
        case "charset.unsupported":
            res.status(415).json({
                error: "Unsupported request encoding"
            });
            return;

        default:
            next(error);
    }
};
