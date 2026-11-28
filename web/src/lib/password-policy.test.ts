import assert from "node:assert/strict";
import { test } from "node:test";
import {
  MIN_PASSWORD_LENGTH,
  MAX_PASSWORD_LENGTH,
  validateNewPassword,
} from "./password-policy";

test("password policy defines the expected boundaries", () => {
  assert.equal(MIN_PASSWORD_LENGTH, 15);
  assert.equal(MAX_PASSWORD_LENGTH, 128);
});

test("rejects an empty password", () => {
  assert.notEqual(validateNewPassword(""), null);
});

test("rejects a password below the minimum length", () => {
  assert.equal(
    validateNewPassword("a".repeat(14)),
    "Password must contain at least 15 characters."
  );
});

test("accepts a password at the minimum length", () => {
  assert.equal(validateNewPassword("a".repeat(15)), null);
});

test("accepts a password at the maximum length", () => {
  assert.equal(validateNewPassword("a".repeat(128)), null);
});

test("rejects a password above the maximum length", () => {
  assert.equal(
    validateNewPassword("a".repeat(129)),
    "Password must contain no more than 128 characters."
  );
});

test("does not require uppercase numbers or symbols", () => {
  assert.equal(
    validateNewPassword("long lowercase passphrase"),
    null
  );
});

test("allows spaces within passwords", () => {
  assert.equal(
    validateNewPassword("synthetic passphrase with spaces"),
    null
  );
});

test("does not trim password whitespace", () => {
  assert.equal(
    validateNewPassword(" " + "a".repeat(13) + " "),
    null
  );
});

test("rejects oversized passwords including whitespace", () => {
  assert.notEqual(
    validateNewPassword("a".repeat(128) + " "),
    null
  );
});

test("rejects eight supplementary Unicode characters", () => {
  const password = "\u{1F600}".repeat(8);

  assert.equal(password.length, 16);
  assert.notEqual(validateNewPassword(password), null);
});

test("rejects fourteen supplementary Unicode characters", () => {
  const password = "\u{1F600}".repeat(14);

  assert.notEqual(validateNewPassword(password), null);
});

test("accepts fifteen supplementary Unicode characters", () => {
  const password = "\u{1F600}".repeat(15);

  assert.equal(validateNewPassword(password), null);
});

test("rejects passwords that normalize below the minimum", () => {
  const password = "e\u0301".repeat(8);

  assert.equal(password.length, 16);
  assert.notEqual(validateNewPassword(password), null);
});

test("accepts fifteen normalized Unicode characters", () => {
  const password = "e\u0301".repeat(15);

  assert.equal(validateNewPassword(password), null);
});

test("preserves the existing upper UTF-16 length boundary", () => {
  assert.equal(
    validateNewPassword("\u{1F600}".repeat(64)),
    null
  );

  assert.notEqual(
    validateNewPassword("\u{1F600}".repeat(65)),
    null
  );
});
