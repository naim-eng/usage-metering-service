import assert from "node:assert/strict";
import { test } from "node:test";
import {
  hasValidTrustedClientIp,
  TRUSTED_CLIENT_IP_HEADER,
} from "./trusted-client-ip";

function requestWithIp(value?: string): Request {
  return new Request("https://app.example.com/api/auth/get-session", {
    headers: value === undefined
      ? {}
      : { [TRUSTED_CLIENT_IP_HEADER]: value },
  });
}

test("accepts valid IPv4 addresses", () => {
  assert.equal(
    hasValidTrustedClientIp(requestWithIp("192.0.2.10")),
    true
  );
});

test("accepts valid IPv6 addresses", () => {
  assert.equal(
    hasValidTrustedClientIp(requestWithIp("2001:db8::10")),
    true
  );
});

test("rejects missing and empty client IP headers", () => {
  for (const value of [undefined, ""]) {
    assert.equal(
      hasValidTrustedClientIp(requestWithIp(value)),
      false
    );
  }
});

test("rejects malformed client IP addresses", () => {
  for (const value of [
    "unknown",
    "localhost",
    "999.0.0.1",
    "192.0.2.10:443",
    "[2001:db8::10]",
    "fe80::1%eth0",
  ]) {
    assert.equal(
      hasValidTrustedClientIp(requestWithIp(value)),
      false
    );
  }
});

test("rejects multiple client IP addresses", () => {
  assert.equal(
    hasValidTrustedClientIp(
      requestWithIp("192.0.2.10, 192.0.2.20")
    ),
    false
  );
});

test("does not trust alternative forwarded IP headers", () => {
  const request = new Request("https://app.example.com/api/auth/get-session", {
    headers: {
      "x-forwarded-for": "192.0.2.10",
      "x-real-ip": "192.0.2.20",
      "cf-connecting-ip": "192.0.2.30",
    },
  });

  assert.equal(hasValidTrustedClientIp(request), false);
});
