import assert from "node:assert/strict";
import { test } from "node:test";
import {
  publicErrorMessage,
  publicExceptionMessage,
} from "./public-error";

const fallback = "Operation failed";

test("preserves approved customer-facing errors", () => {
  for (const message of [
    "A project with this name already exists",
    "Project not found",
    "Organization access denied",
    "Insufficient permissions",
  ]) {
    assert.equal(publicErrorMessage(message, fallback), message);
    assert.equal(
      publicExceptionMessage(new Error(message), fallback),
      message
    );
  }
});

test("rejects arbitrary sensitive error messages", () => {
  for (const message of [
    "DATABASE_PASSWORD_SYNTHETIC",
    "postgresql://user:synthetic@localhost/database",
    "SELECT * FROM auth.session",
    "/internal/server/private-file.ts",
    "API_KEY_SYNTHETIC",
    "Project not found: PRIVATE_IDENTIFIER",
  ]) {
    assert.equal(publicErrorMessage(message, fallback), fallback);
    assert.equal(
      publicExceptionMessage(new Error(message), fallback),
      fallback
    );
  }
});

test("rejects non-string and unexpected error values", () => {
  for (const value of [
    undefined,
    null,
    500,
    {},
    [],
    { message: "Project not found" },
  ]) {
    assert.equal(publicErrorMessage(value, fallback), fallback);
    assert.equal(publicExceptionMessage(value, fallback), fallback);
  }
});

test("requires an exact approved message", () => {
  for (const value of [
    "Project not found ",
    "project not found",
    "Project not found\\nSECRET",
    "",
  ]) {
    assert.equal(publicErrorMessage(value, fallback), fallback);
  }
});
