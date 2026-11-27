import { test } from "node:test";
import assert from "node:assert/strict";
import {
  readLimitedJson,
  RequestJsonError,
  JSON_BODY_LIMIT,
} from "./request-json";

function request(
  body: string,
  headers: Record<string, string> = {}
) {
  return new Request("http://localhost/test", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    body,
  });
}

async function rejectsWith(
  input: Request,
  status: number
) {
  await assert.rejects(
    readLimitedJson(input),
    (error: unknown) =>
      error instanceof RequestJsonError &&
      error.status === status
  );
}

test("accepts valid JSON", async () => {
  assert.deepEqual(
    await readLimitedJson(request('{"name":"Project"}')),
    { name: "Project" }
  );
});

test("accepts JSON with UTF-8 charset", async () => {
  assert.deepEqual(
    await readLimitedJson(request(
      '{"name":"مشروع 🚀"}',
      { "Content-Type": "application/json; charset=utf-8" }
    )),
    { name: "مشروع 🚀" }
  );
});

test("rejects malformed and empty JSON", async () => {
  for (const body of ["", "{", '{"name":}', '{"x":1}x']) {
    await rejectsWith(request(body), 400);
  }
});

test("rejects unsupported content types", async () => {
  await rejectsWith(request("{}", {
    "Content-Type": "text/plain",
  }), 415);
});

test("rejects compressed request encodings", async () => {
  await rejectsWith(request("{}", {
    "Content-Encoding": "gzip",
  }), 415);
});

test("rejects invalid content length", async () => {
  await rejectsWith(request("{}", {
    "Content-Length": "-1",
  }), 400);
});

test("accepts the exact payload boundary", async () => {
  const body = JSON.stringify({
    value: "a".repeat(JSON_BODY_LIMIT - 12),
  });

  assert.equal(
    Buffer.byteLength(body),
    JSON_BODY_LIMIT
  );

  await readLimitedJson(request(body));
});

test("rejects excessive declared payload length", async () => {
  await rejectsWith(request("{}", {
    "Content-Length": String(JSON_BODY_LIMIT + 1),
  }), 413);
});

test("rejects excessive actual payload length", async () => {
  const body = JSON.stringify({
    value: "a".repeat(JSON_BODY_LIMIT),
  });

  await rejectsWith(request(body), 413);
});

test("rejects oversized multibyte payloads", async () => {
  const body = JSON.stringify({
    value: "🚀".repeat(JSON_BODY_LIMIT / 4),
  });

  await rejectsWith(request(body), 413);
});

test("rejects invalid UTF-8", async () => {
  const input = new Request("http://localhost/test", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: new Uint8Array([0xff, 0xfe]),
  });

  await rejectsWith(input, 400);
});


test("rejects mismatched content length", async () => {
  for (const length of ["0", "1", "3", "100"]) {
    await rejectsWith(request("{}", {
      "Content-Length": length,
    }), 400);
  }
});

test("accepts matching content length", async () => {
  assert.deepEqual(
    await readLimitedJson(request("{}", {
      "Content-Length": "2",
    })),
    {}
  );
});
