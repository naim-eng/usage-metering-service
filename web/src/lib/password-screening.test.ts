import assert from "node:assert/strict";
import { test } from "node:test";
import { createHash } from "node:crypto";
import {
  isPasswordCompromised,
  enforcePasswordScreening,
  PASSWORD_SCREENING_TIMEOUT_MS,
} from "./password-screening";
import { isProductionDeployment } from "./deployment-config";

const password = "Synthetic compromised password test";
const digest = createHash("sha1")
  .update(password)
  .digest("hex")
  .toUpperCase();

const prefix = digest.slice(0, 5);
const suffix = digest.slice(5);

function mockPasswordResponse(
  body: string,
  status = 200
) {
  return async (
    input: RequestInfo | URL,
    init?: RequestInit
  ): Promise<Response> => {
    const request = new Request(input, init);

    assert.equal(
      request.url,
      `https://api.pwnedpasswords.com/range/${prefix}`
    );

    assert.equal(request.method, "GET");
    assert.equal(request.headers.get("Add-Padding"), "true");
    assert.equal(request.url.includes(password), false);
    assert.equal(request.url.includes(digest), false);

    return new Response(body, {
      status,
      headers: {
        "Content-Type": "text/plain",
      },
    });
  };
}

test("detects a compromised password", async (t) => {
  t.mock.method(
    globalThis,
    "fetch",
    mockPasswordResponse(`${suffix}:42\r\n`)
  );

  assert.equal(
    await isPasswordCompromised(password),
    true
  );
});

test("accepts a password absent from the breach response", async (t) => {
  const unrelatedSuffix =
    (suffix[0] === "A" ? "B" : "A") + suffix.slice(1);

  t.mock.method(
    globalThis,
    "fetch",
    mockPasswordResponse(`${unrelatedSuffix}:42\r\n`)
  );

  assert.equal(
    await isPasswordCompromised(password),
    false
  );
});

test("ignores zero-count padding entries", async (t) => {
  t.mock.method(
    globalThis,
    "fetch",
    mockPasswordResponse(`${suffix}:0\r\n`)
  );

  assert.equal(
    await isPasswordCompromised(password),
    false
  );
});

test("rejects malformed compromise counts", async (t) => {
  t.mock.method(
    globalThis,
    "fetch",
    mockPasswordResponse(`${suffix}:invalid\r\n`)
  );

  await assert.rejects(
    () => isPasswordCompromised(password)
  );
});

test("fails closed when the external service returns an error", async (t) => {
  t.mock.method(
    globalThis,
    "fetch",
    mockPasswordResponse("Service unavailable", 503)
  );

  await assert.rejects(
    () => isPasswordCompromised(password)
  );
});

test("fails closed when the network request fails", async (t) => {
  t.mock.method(
    globalThis,
    "fetch",
    async () => {
      throw new Error("Synthetic network failure");
    }
  );

  await assert.rejects(
    () => isPasswordCompromised(password)
  );
});

test("production deployment enables screening policy", () => {
  assert.equal(
    isProductionDeployment({
      DEPLOYMENT_ENV: "production",
      NODE_ENV: "production",
    }),
    true
  );
});

test("local deployment disables external screening policy", () => {
  assert.equal(
    isProductionDeployment({
      DEPLOYMENT_ENV: "local",
      NODE_ENV: "production",
    }),
    false
  );
});

test("production deployment rejects E2E overrides", () => {
  assert.throws(() =>
    isProductionDeployment({
      DEPLOYMENT_ENV: "production",
      NODE_ENV: "production",
      E2E_AUTH_RATE_LIMIT: "1",
    })
  );
});

test("configures a five-second screening timeout", () => {
  assert.equal(PASSWORD_SCREENING_TIMEOUT_MS, 5000);
});

test("disables redirects and response caching", async (t) => {
  t.mock.method(
    globalThis,
    "fetch",
    async (_input: RequestInfo | URL, init?: RequestInit) => {
      assert.equal(init?.redirect, "error");
      assert.equal(init?.cache, "no-store");
      assert.ok(init?.signal);
      assert.equal(init.signal.aborted, false);

      return new Response(`${suffix}:0\r\n`);
    }
  );

  assert.equal(await isPasswordCompromised(password), false);
});

test("rejects an empty screening response", async (t) => {
  t.mock.method(
    globalThis,
    "fetch",
    mockPasswordResponse("")
  );

  await assert.rejects(
    () => isPasswordCompromised(password)
  );
});

test("rejects an unexpected HTML screening response", async (t) => {
  t.mock.method(
    globalThis,
    "fetch",
    mockPasswordResponse("<html>Service unavailable</html>")
  );

  await assert.rejects(
    () => isPasswordCompromised(password)
  );
});

test("rejects unsafe integer compromise counts", async (t) => {
  t.mock.method(
    globalThis,
    "fetch",
    mockPasswordResponse(`${suffix}:9007199254740992\r\n`)
  );

  await assert.rejects(
    () => isPasswordCompromised(password)
  );
});

test("rejects malformed unrelated response entries", async (t) => {
  t.mock.method(
    globalThis,
    "fetch",
    mockPasswordResponse(
      `${suffix}:0\r\ninvalid-entry\r\n`
    )
  );

  await assert.rejects(
    () => isPasswordCompromised(password)
  );
});

test("rejects a compromised password through enforcement", async (t) => {
  t.mock.method(
    globalThis,
    "fetch",
    mockPasswordResponse(`${suffix}:42\r\n`)
  );

  await assert.rejects(
    () => enforcePasswordScreening(password),
    (error: unknown) => {
      const result = error as {
        body?: { code?: string };
      };

      return result.body?.code === "PASSWORD_COMPROMISED";
    }
  );
});

test("screens the normalized password representation", async (t) => {
  const original = "e\u0301".repeat(15);
  const normalized = original.normalize("NFKC");

  const originalDigest = createHash("sha1")
    .update(original)
    .digest("hex")
    .toUpperCase();

  const normalizedDigest = createHash("sha1")
    .update(normalized)
    .digest("hex")
    .toUpperCase();

  const requests: string[] = [];

  t.mock.method(
    globalThis,
    "fetch",
    async (input: RequestInfo | URL) => {
      const url = String(input);

      requests.push(url);

      if (url.endsWith(originalDigest.slice(0, 5))) {
        return new Response(
          `${originalDigest.slice(5)}:0\r\n`
        );
      }

      if (url.endsWith(normalizedDigest.slice(0, 5))) {
        return new Response(
          `${normalizedDigest.slice(5)}:42\r\n`
        );
      }

      throw new Error("Unexpected screening request");
    }
  );

  await assert.rejects(
    () => enforcePasswordScreening(original),
    (error: unknown) => {
      const result = error as {
        body?: { code?: string };
      };

      return result.body?.code === "PASSWORD_COMPROMISED";
    }
  );

  assert.deepEqual(requests, [
    `https://api.pwnedpasswords.com/range/${originalDigest.slice(0, 5)}`,
    `https://api.pwnedpasswords.com/range/${normalizedDigest.slice(0, 5)}`,
  ]);
});

test("does not repeat screening for an unchanged normalized password", async (t) => {
  const mockedFetch = t.mock.method(
    globalThis,
    "fetch",
    mockPasswordResponse(`${suffix}:0\r\n`)
  );

  await enforcePasswordScreening(password);

  assert.equal(mockedFetch.mock.callCount(), 1);
});

test("aborts a stalled screening request", {
  timeout: 10000,
}, async (t) => {
  let aborted = false;

  const keepAlive = setInterval(() => {}, 1000);

  try {
    t.mock.method(
      globalThis,
      "fetch",
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        assert.ok(init?.signal);

        const signal = init.signal;

        return new Promise<Response>((_resolve, reject) => {
          signal.addEventListener(
            "abort",
            () => {
              aborted = true;
              reject(signal.reason);
            },
            { once: true }
          );
        });
      }
    );

    await assert.rejects(
      () => isPasswordCompromised(password),
      (error: unknown) => {
        const result = error as {
          body?: { code?: string };
        };

        return result.body?.code ===
          "PASSWORD_SCREENING_UNAVAILABLE";
      }
    );

    assert.equal(aborted, true);
  } finally {
    clearInterval(keepAlive);
  }
});

test("aborts a stalled screening response body", {
  timeout: 10000,
}, async (t) => {
  let aborted = false;

  const keepAlive = setInterval(() => {}, 1000);

  try {
    t.mock.method(
      globalThis,
      "fetch",
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        assert.ok(init?.signal);

        const signal = init.signal;

        const stream = new ReadableStream<Uint8Array>({
          start(controller) {
            signal.addEventListener(
              "abort",
              () => {
                aborted = true;
                controller.error(signal.reason);
              },
              { once: true }
            );
          },
        });

        return new Response(stream);
      }
    );

    await assert.rejects(
      () => isPasswordCompromised(password),
      (error: unknown) => {
        const result = error as {
          body?: { code?: string };
        };

        return result.body?.code ===
          "PASSWORD_SCREENING_UNAVAILABLE";
      }
    );

    assert.equal(aborted, true);
  } finally {
    clearInterval(keepAlive);
  }
});
