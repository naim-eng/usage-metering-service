import { isIP } from "node:net";

export const TRUSTED_CLIENT_IP_HEADER = "x-metering-client-ip";

export function hasValidTrustedClientIp(
  request: Request
): boolean {
  const value = request.headers.get(TRUSTED_CLIENT_IP_HEADER);

  return (
    value !== null &&
    value === value.trim() &&
    !value.includes(",") &&
    !value.includes("%") &&
    isIP(value) !== 0
  );
}
