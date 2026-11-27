import assert from "node:assert/strict";
import { test } from "node:test";
import { isAllowedRequestOrigin } from "./request-origin";

const allowed = [
  "https://app.example.com",
  "http://127.0.0.1:3004",
];

function request(origin?: string): Request {
  return new Request("https://app.example.com/api/projects", {
    method: "POST",
    headers: origin === undefined ? {} : { Origin: origin },
  });
}

test("accepts explicitly trusted origins", () => {
  for (const origin of allowed) {
    assert.equal(isAllowedRequestOrigin(request(origin), allowed), true);
  }
});

test("rejects missing and opaque origins", () => {
  for (const origin of [undefined, "", "null"]) {
    assert.equal(isAllowedRequestOrigin(request(origin), allowed), false);
  }
});

test("rejects untrusted domains and subdomains", () => {
  for (const origin of [
    "https://evil.example.com",
    "https://app.example.com.evil.test",
    "https://sub.app.example.com",
  ]) {
    assert.equal(isAllowedRequestOrigin(request(origin), allowed), false);
  }
});

test("rejects incorrect schemes and ports", () => {
  for (const origin of [
    "http://app.example.com",
    "https://app.example.com:8443",
    "http://127.0.0.1:3005",
    "ftp://app.example.com",
  ]) {
    assert.equal(isAllowedRequestOrigin(request(origin), allowed), false);
  }
});

test("rejects malformed and multiple origins", () => {
  for (const origin of [
    "not-an-origin",
    "https://app.example.com/path",
    "https://app.example.com?query=1",
    "https://app.example.com#fragment",
    "https://user@app.example.com",
    "https://app.example.com, https://evil.test",
    "https://app.example.com https://evil.test",
  ]) {
    assert.equal(isAllowedRequestOrigin(request(origin), allowed), false);
  }
});

test("does not trust host or forwarded headers", () => {
  const req = new Request("https://app.example.com/api/projects", {
    method: "POST",
    headers: {
      Origin: "https://evil.test",
      Host: "evil.test",
      "X-Forwarded-Host": "evil.test",
      "X-Forwarded-Proto": "https",
      Referer: "https://app.example.com/",
    },
  });

  assert.equal(isAllowedRequestOrigin(req, allowed), false);
});
