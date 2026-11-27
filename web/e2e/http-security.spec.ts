import { expect, test } from "@playwright/test";

test("frontend enforces baseline security headers", async ({ request }) => {
  const response = await request.get("/sign-in");

  expect(response.status()).toBe(200);

  const headers = response.headers();

  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["referrer-policy"]).toBe("no-referrer");
  expect(headers["permissions-policy"]).toContain("camera=()");
  expect(headers["cross-origin-opener-policy"]).toBe("same-origin");
  expect(headers["x-powered-by"]).toBeUndefined();
  expect(headers["strict-transport-security"]).toBeUndefined();

  const csp = headers["content-security-policy"];

  expect(csp).toContain("default-src 'self'");
  expect(csp).toContain("object-src 'none'");
  expect(csp).toContain("frame-ancestors 'none'");
  expect(csp).not.toContain("'unsafe-eval'");
});

test("backend enforces HTTP security and cache protection", async ({
  request,
}) => {
  const response = await request.get("http://127.0.0.1:3003/ready");

  expect(response.status()).toBe(200);

  const headers = response.headers();

  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["referrer-policy"]).toBe("no-referrer");
  expect(headers["cache-control"]).toContain("no-store");
  expect(headers["permissions-policy"]).toContain("camera=()");
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["strict-transport-security"]).toBeUndefined();
  expect(headers["content-security-policy"]).toContain(
    "frame-ancestors 'none'"
  );
  expect(headers["content-security-policy"]).not.toContain(
    "upgrade-insecure-requests"
  );
  expect(headers["x-powered-by"]).toBeUndefined();
});

test("frontend API does not grant untrusted cross-origin access", async ({
  request,
}) => {
  const response = await request.fetch("/api/projects", {
    method: "OPTIONS",
    headers: {
      Origin: "https://untrusted.example",
      "Access-Control-Request-Method": "POST",
      "Access-Control-Request-Headers": "content-type",
    },
  });

  const headers = response.headers();

  expect(headers["access-control-allow-origin"]).toBeUndefined();
  expect(headers["access-control-allow-credentials"]).toBeUndefined();
});

test("backend API does not grant untrusted cross-origin access", async ({
  request,
}) => {
  const response = await request.fetch(
    "http://127.0.0.1:3003/consume",
    {
      method: "OPTIONS",
      headers: {
        Origin: "https://untrusted.example",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "content-type,x-api-key",
      },
    },
  );

  const headers = response.headers();

  expect(headers["access-control-allow-origin"]).toBeUndefined();
  expect(headers["access-control-allow-credentials"]).toBeUndefined();
});

const mutations = [
  { method: "POST", path: "/api/projects" },
  { method: "POST", path: "/api/projects/test-project/api-keys" },
  {
    method: "DELETE",
    path: "/api/projects/test-project/api-keys/test-key",
  },
];

for (const mutation of mutations) {
  test(`${mutation.method} ${mutation.path} rejects invalid origins`, async ({
    request,
  }) => {
    for (const origin of [
      undefined,
      "null",
      "https://untrusted.example",
      "http://127.0.0.1:9999",
    ]) {
      const response = await request.fetch(mutation.path, {
        method: mutation.method,
        headers: origin === undefined ? {} : { Origin: origin },
      });

      expect(response.status()).toBe(403);
      expect(await response.json()).toEqual({
        error: "Forbidden request origin",
      });
      expect(response.headers()["cache-control"]).toContain("no-store");
    }
  });

  test(`${mutation.method} ${mutation.path} preserves authentication`, async ({
    request,
    baseURL,
  }) => {
    expect(baseURL).toBeTruthy();

    const response = await request.fetch(mutation.path, {
      method: mutation.method,
      headers: {
        Origin: new URL(baseURL!).origin,
      },
    });

    expect(response.status()).toBe(401);
    expect(response.headers()["cache-control"]).toContain("no-store");
  });
}

test("sign-in page loads without CSP violations", async ({ page }) => {
  await page.addInitScript(() => {
    document.addEventListener("securitypolicyviolation", (event) => {
      console.error("CSP_VIOLATION:" + event.violatedDirective);
    });
  });

  const violations: string[] = [];

  page.on("console", (message) => {
    if (message.text().startsWith("CSP_VIOLATION:")) {
      violations.push(message.text());
    }
  });

  await page.goto("/sign-in");

  await expect(page.locator('input[type="email"]')).toBeVisible();
  await expect(page.locator('input[type="password"]')).toBeVisible();

  await page.locator('input[type="email"]').fill("security@example.test");

  await expect(page.locator('input[type="email"]')).toHaveValue(
    "security@example.test",
  );

  expect(violations).toEqual([]);
});
