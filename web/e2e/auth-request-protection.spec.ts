import { test, expect } from "@playwright/test";

const cases = [
  {
    name: "rejects malformed authentication JSON",
    body: '{"email":}',
    contentType: "application/json",
    status: 400,
  },
  {
    name: "rejects oversized authentication JSON",
    body: JSON.stringify({
      email: "a".repeat(16384),
    }),
    contentType: "application/json",
    status: 413,
  },
  {
    name: "rejects unsupported authentication content types",
    body: "{}",
    contentType: "text/plain",
    status: 415,
  },
  {
    name: "rejects compressed authentication requests",
    body: "{}",
    contentType: "application/json",
    encoding: "gzip",
    status: 415,
  },
];

for (const item of cases) {
  test(item.name, async ({ request }) => {
    const headers: Record<string, string> = {
      "Content-Type": item.contentType,
    };

    if (item.encoding) {
      headers["Content-Encoding"] = item.encoding;
    }

    const response = await request.post(
      "/api/auth/sign-in/email",
      {
        headers,
        data: item.body,
      }
    );

    expect(response.status()).toBe(item.status);
    expect(response.headers()["cache-control"]).toContain(
      "no-store"
    );
  });
}
