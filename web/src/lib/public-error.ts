const PUBLIC_ERROR_MESSAGES = new Set([
  "Authentication required",
  "Unauthorized",
  "Organization access denied",
  "No active organization",
  "Insufficient permissions",
  "Forbidden request origin",
  "Invalid project details",
  "Invalid project name",
  "Invalid project configuration",
  "A project with this name already exists",
  "Project not found",
  "Project or API key not found",
  "Invalid API key details",
  "Invalid API key name",
  "Invalid dashboard request",
  "Project metering account is not available",
  "Project service unavailable",
  "Unable to connect to project service",
  "Unable to retrieve projects",
  "Unable to retrieve API keys",
  "Unable to create API key",
  "Unable to revoke API key",
  "Unable to retrieve project dashboard",
]);

export function publicErrorMessage(
  value: unknown,
  fallback: string
): string {
  return typeof value === "string" &&
    PUBLIC_ERROR_MESSAGES.has(value)
    ? value
    : fallback;
}

export function publicExceptionMessage(
  error: unknown,
  fallback: string
): string {
  return publicErrorMessage(
    error instanceof Error ? error.message : undefined,
    fallback
  );
}
