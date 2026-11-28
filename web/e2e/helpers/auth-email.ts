import { expect, type APIRequestContext } from "@playwright/test";

const MAILPIT_URL = "http://127.0.0.1:8026";
const AUTH_ORIGIN = "http://localhost:3004";

function assertSyntheticEmail(email: string): void {
  if (
    !/^e2e-auth-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}@example\.test$/.test(email)
  ) {
    throw new Error("Email helper requires a synthetic E2E account");
  }
}

type MailpitMessage = {
  ID: string;
  Subject: string;
  To: { Address: string }[];
};

export async function findTestEmails(
  email: string
): Promise<MailpitMessage[]> {
  assertSyntheticEmail(email);

  const query = encodeURIComponent(`to:${email}`);

  const response = await fetch(
    `${MAILPIT_URL}/api/v1/search?query=${query}`,
    {
      signal: AbortSignal.timeout(5000),
      cache: "no-store",
      redirect: "error",
    }
  );

  if (!response.ok) {
    throw new Error("Unable to search E2E email inbox");
  }

  const result = await response.json();

  return (result.messages ?? []).filter(
    (message: MailpitMessage) =>
      message.To.length === 1 &&
      message.To[0].Address === email
  );
}

export async function readTestEmailLink(
  email: string,
  kind: "verification" | "password-reset"
): Promise<{ id: string; url: string }> {
  assertSyntheticEmail(email);

  const subject =
    kind === "verification"
      ? "Verify your Usage Metering email"
      : "Reset your Usage Metering password";

  let messageId = "";

  await expect.poll(
    async () => {
      const messages = await findTestEmails(email);
      const match = messages.find(
        (message) => message.Subject === subject
      );

      messageId = match?.ID ?? "";
      return Boolean(messageId);
    },
    {
      timeout: 15000,
      intervals: [250, 500, 1000],
      message: "Expected authentication email was not delivered",
    }
  ).toBe(true);

  const response = await fetch(
    `${MAILPIT_URL}/api/v1/message/${encodeURIComponent(messageId)}`,
    {
      signal: AbortSignal.timeout(5000),
      redirect: "error",
    }
  );

  if (!response.ok) {
    throw new Error("Unable to retrieve E2E email");
  }

  const message = await response.json();

  if (
    message.Subject !== subject ||
    message.To?.length !== 1 ||
    message.To[0].Address !== email
  ) {
    throw new Error("Unexpected authentication email");
  }

  const links = String(message.Text ?? "")
    .match(/https?:\/\/[^\s<>]+/g) ?? [];

  if (links.length !== 1) {
    throw new Error("Expected exactly one authentication link");
  }

  const url = new URL(links[0]);

  if (
    url.origin !== AUTH_ORIGIN ||
    url.username ||
    url.password ||
    url.hash
  ) {
    throw new Error("Unsafe E2E authentication URL");
  }

  if (kind === "verification") {
    if (
      url.pathname !== "/api/auth/verify-email" ||
      !url.searchParams.get("token")
    ) {
      throw new Error("Invalid verification email URL");
    }
  } else if (
    !/^\/api\/auth\/reset-password\/[^/]+$/.test(url.pathname)
  ) {
    throw new Error("Invalid password reset email URL");
  }

  return { id: messageId, url: url.toString() };
}

export async function cleanupTestEmails(
  email: string
): Promise<void> {
  const messages = await findTestEmails(email);

  if (messages.length === 0) return;

  const response = await fetch(
    `${MAILPIT_URL}/api/v1/messages`,
    {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        IDs: messages.map((message) => message.ID),
      }),
      signal: AbortSignal.timeout(5000),
      redirect: "error",
    }
  );

  if (!response.ok) {
    throw new Error("Unable to clean up E2E emails");
  }

  if ((await findTestEmails(email)).length !== 0) {
    throw new Error("E2E email cleanup incomplete");
  }
}

export async function verifyTestAccountEmail(
  request: APIRequestContext,
  email: string
): Promise<void> {
  const { url } = await readTestEmailLink(
    email,
    "verification"
  );

  const response = await request.get(url, {
    maxRedirects: 0,
  });

  if (response.status() === 200) {
    const result = await response.json();

    if (result.status !== true) {
      throw new Error("E2E email verification failed");
    }
  } else if (
    response.status() >= 300 &&
    response.status() < 400
  ) {
    const location = response.headers()["location"];

    if (!location) {
      throw new Error("Missing verification redirect");
    }

    const destination = new URL(location, AUTH_ORIGIN);

    if (
      destination.origin !== AUTH_ORIGIN ||
      destination.searchParams.has("error")
    ) {
      throw new Error("Email verification redirect failed");
    }
  } else {
    throw new Error(
      `Email verification failed with HTTP ${response.status()}`
    );
  }

  await cleanupTestEmails(email);
}


export async function establishTestAccountPassword(
  request: APIRequestContext,
  email: string,
  password: string
): Promise<void> {
  assertSyntheticEmail(email);

  const requested = await request.post(
    `${AUTH_ORIGIN}/api/auth/request-password-reset`,
    {
      headers: { origin: AUTH_ORIGIN },
      data: {
        email,
        redirectTo: "/reset-password",
      },
    }
  );

  expect(requested.status()).toBe(200);

  const { url } = await readTestEmailLink(
    email,
    "password-reset"
  );

  const callback = await request.get(url, {
    maxRedirects: 0,
  });

  expect(callback.status()).toBeGreaterThanOrEqual(300);
  expect(callback.status()).toBeLessThan(400);

  const location = callback.headers()["location"];

  expect(location).toBeTruthy();

  const destination = new URL(location, AUTH_ORIGIN);

  expect(destination.origin).toBe(AUTH_ORIGIN);
  expect(destination.pathname).toBe("/reset-password");
  expect(destination.searchParams.has("error")).toBe(false);

  const token = destination.searchParams.get("token");

  expect(token).toBeTruthy();

  const reset = await request.post(
    `${AUTH_ORIGIN}/api/auth/reset-password`,
    {
      headers: { origin: AUTH_ORIGIN },
      data: {
        token,
        newPassword: password,
      },
    }
  );

  expect(reset.status()).toBe(200);

  await cleanupTestEmails(email);
}
