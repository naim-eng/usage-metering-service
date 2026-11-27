import test from "node:test";
import assert from "node:assert/strict";
import {
  readAuthenticationJson,
  RequestJsonError,
  JSON_BODY_LIMIT,
} from "./request-json";

function request(
  body: BodyInit | null,
  headers: Record<string, string> = {}
) {
  return new Request("http://localhost/api/auth/test", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...headers,
    },
    body,
  });
}

test("authentication permits genuinely empty requests", async () => {
  assert.equal(await readAuthenticationJson(request(null)), null);
  assert.equal(await readAuthenticationJson(request("")), null);
  assert.equal(
    await readAuthenticationJson(
      request("", { "content-length": "0" })
    ),
    null
  );
});

test("authentication rejects false zero content length", async () => {
  await assert.rejects(
    readAuthenticationJson(
      request('{"name":"test"}', { "content-length": "0" })
    ),
    (error: unknown) =>
      error instanceof RequestJsonError && error.status === 400
  );
});

test("authentication rejects mismatched content length", async () => {
  for (const length of ["1", "100", "-1", "invalid"]) {
    await assert.rejects(
      readAuthenticationJson(
        request("{}", { "content-length": length })
      ),
      (error: unknown) =>
        error instanceof RequestJsonError && error.status === 400
    );
  }
});

test("authentication preserves validated JSON text", async () => {
  const body = '{ "value": 1e400, "name": "test" }';
  assert.equal(await readAuthenticationJson(request(body)), body);
});

test("authentication rejects malformed and non-object JSON", async () => {
  for (const body of ["{", "null", "[]", "123", '"text"', " "]) {
    await assert.rejects(
      readAuthenticationJson(request(body)),
      (error: unknown) =>
        error instanceof RequestJsonError && error.status === 400
    );
  }
});

test("authentication enforces actual body size", async () => {
  await assert.rejects(
    readAuthenticationJson(request("x".repeat(JSON_BODY_LIMIT + 1))),
    (error: unknown) =>
      error instanceof RequestJsonError && error.status === 413
  );
});

test("authentication rejects unsupported content types and encodings", async () => {
  const cases: Record<string, string>[] = [
    { "content-type": "text/plain" },
    { "content-encoding": "gzip" },
  ];

  for (const headers of cases) {
    await assert.rejects(
      readAuthenticationJson(request("{}", headers)),
      (error: unknown) =>
        error instanceof RequestJsonError && error.status === 415
    );
  }
});

test("authentication rejects invalid UTF-8", async () => {
  await assert.rejects(
    readAuthenticationJson(request(new Uint8Array([0xff, 0xfe]))),
    (error: unknown) =>
      error instanceof RequestJsonError && error.status === 400
  );
});
