import { isValidReportingMonth } from "./input-validation.js";
import { test } from "node:test";
import assert from "node:assert/strict";
import {
    isSafeText,
    parsePositiveInteger,
    isValidPagination
} from "./input-validation.js";

test("accepts valid international text", () => {
    for (const value of [
        "Project Alpha",
        "مشروع",
        "日本語",
        "Project 🚀",
        "Café"
    ]) {
        assert.equal(isSafeText(value), true);
    }
});

test("rejects control characters and malformed Unicode", () => {
    for (const value of [
        "a\u0000b",
        "a\nb",
        "a\rb",
        "a\tb",
        "a\u007fb",
        "a\u0085b",
        "\uD800",
        "\uDC00",
        null,
        123
    ]) {
        assert.equal(isSafeText(value), false);
    }
});

test("accepts canonical positive integers", () => {
    assert.equal(parsePositiveInteger("1"), 1);
    assert.equal(parsePositiveInteger("100"), 100);
    assert.equal(
        parsePositiveInteger("9007199254740991"),
        Number.MAX_SAFE_INTEGER
    );
});

test("rejects noncanonical and unsafe integers", () => {
    for (const value of [
        "0", "-1", "+1", "01", "1.0",
        "1e2", "0x10", " 1", "1 ",
        "", "Infinity", "9007199254740992",
        ["1", "2"], null, 1
    ]) {
        assert.equal(
            Number.isNaN(parsePositiveInteger(value)),
            true
        );
    }
});

test("accepts valid pagination boundaries", () => {
    assert.equal(isValidPagination(1, 1), true);
    assert.equal(isValidPagination(1, 100), true);
    assert.equal(isValidPagination(1001, 100), true);
});

test("rejects excessive or invalid pagination", () => {
    for (const [page, limit] of [
        [0, 10],
        [-1, 10],
        [1, 0],
        [1, 101],
        [1.5, 10],
        [1, 1.5],
        [1002, 100],
        [Infinity, 10],
        [NaN, 10],
        [Number.MAX_SAFE_INTEGER, 100]
    ]) {
        assert.equal(isValidPagination(page, limit), false);
    }
});


test("accepts valid reporting months", () => {
    for (const month of [
        "0001-01",
        "2026-01",
        "2026-12",
        "9999-12"
    ]) {
        assert.equal(isValidReportingMonth(month), true);
    }
});

test("rejects invalid reporting months", () => {
    for (const month of [
        "0000-01",
        "2026-00",
        "2026-13",
        "2026-1",
        "2026-01 ",
        "2026-01-01",
        "",
        null,
        ["2026-01"]
    ]) {
        assert.equal(isValidReportingMonth(month), false);
    }
});
