export const MAX_HISTORY_OFFSET = 100_000;

export function isSafeText(value: unknown): value is string {
    return (
        typeof value === "string" &&
        !/[\uD800-\uDFFF]/u.test(value) &&
        !/[\u0000-\u001f\u007f-\u009f]/u.test(value)
    );
}

export function parsePositiveInteger(
    value: unknown
): number {
    if (
        typeof value !== "string" ||
        !/^[1-9][0-9]*$/.test(value)
    ) {
        return NaN;
    }

    const result = Number(value);

    return Number.isSafeInteger(result)
        ? result
        : NaN;
}

export function isValidPagination(
    page: number,
    limit: number
): boolean {
    return (
        Number.isSafeInteger(page) &&
        page >= 1 &&
        Number.isSafeInteger(limit) &&
        limit >= 1 &&
        limit <= 100 &&
        (page - 1) * limit <= MAX_HISTORY_OFFSET
    );
}


export function isValidReportingMonth(
    value: unknown
): value is string {
    return (
        typeof value === "string" &&
        /^(?!0000)[0-9]{4}-(0[1-9]|1[0-2])$/.test(value)
    );
}
