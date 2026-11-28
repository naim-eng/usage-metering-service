export function isAllowedRequestOrigin(
  request: Request,
  allowedOrigins: readonly string[],
): boolean {
  const origin = request.headers.get("origin");

  if (!origin || origin === "null") {
    return false;
  }

  try {
    const parsed = new URL(origin);

    if (
      !["http:", "https:"].includes(parsed.protocol) ||
      parsed.origin !== origin
    ) {
      return false;
    }

    return allowedOrigins.includes(parsed.origin);
  } catch {
    return false;
  }
}
