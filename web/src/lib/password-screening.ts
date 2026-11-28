import { createHash } from "node:crypto";
import { APIError } from "better-auth/api";

export const PASSWORD_SCREENING_TIMEOUT_MS = 5000;

export async function isPasswordCompromised(
  password: string
): Promise<boolean> {
  const digest = createHash("sha1")
    .update(password)
    .digest("hex")
    .toUpperCase();

  const prefix = digest.slice(0, 5);
  const suffix = digest.slice(5);

  try {
    const response = await fetch(
      `https://api.pwnedpasswords.com/range/${prefix}`,
      {
        method: "GET",
        headers: {
          "Add-Padding": "true",
          "User-Agent": "Usage Metering Password Checker",
        },
        signal: AbortSignal.timeout(
          PASSWORD_SCREENING_TIMEOUT_MS
        ),
        redirect: "error",
        cache: "no-store",
      }
    );

    if (!response.ok) {
      throw new Error("Password screening request failed");
    }

    const body = await response.text();

    const entries = body
      .split(/\r?\n/)
      .filter((line) => line.length > 0);

    if (entries.length === 0) {
      throw new Error("Empty password screening response");
    }

    let compromised = false;

    for (const entry of entries) {
      const match = /^([0-9A-Fa-f]{35}):(0|[1-9][0-9]*)$/
        .exec(entry);

      if (!match) {
        throw new Error("Invalid password screening response");
      }

      const count = Number(match[2]);

      if (!Number.isSafeInteger(count)) {
        throw new Error("Invalid password compromise count");
      }

      if (match[1].toUpperCase() === suffix && count > 0) {
        compromised = true;
      }
    }

    return compromised;
  } catch {
    throw new APIError("INTERNAL_SERVER_ERROR", {
      code: "PASSWORD_SCREENING_UNAVAILABLE",
      message:
        "Password security verification is temporarily unavailable. Please try again later.",
    });
  }
}

export async function enforcePasswordScreening(
  password: string
): Promise<void> {
  const normalized = password.normalize("NFKC");

  if (
    await isPasswordCompromised(password) ||
    (
      normalized !== password &&
      await isPasswordCompromised(normalized)
    )
  ) {
    throw new APIError("BAD_REQUEST", {
      code: "PASSWORD_COMPROMISED",
      message:
        "This password has appeared in a known data breach. Please choose a different password.",
    });
  }
}
