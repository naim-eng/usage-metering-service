import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitizeDashboardResponse } from "./dashboard-response";

function fixture() {
  const allowances = {
    plan_id: "1",
    plan_name: "Starter",
    monthly_limit: "100",
    max_per_request: "20",
    units_used: "0",
    units_remaining: "100",
    month_start: "2026-11-01",
  };

  const report = {
    plan_name: "Starter",
    monthly_limit: "100",
    max_per_request: "20",
    historical_limits_available: true,
    units_used: "0",
    plan_changes: [],
  };

  return {
    account: {
      account: {
        id: "1",
        name: "Synthetic account",
        ...allowances,
      },
    },
    users: {
      users: [{
        user_id: "synthetic-user",
        ...allowances,
      }],
    },
    monthlyReport: {
      month: "2026-11",
      account: {
        name: "Synthetic account",
        ...report,
      },
      users: [{
        user_id: "synthetic-user",
        ...report,
      }],
    },
    usageHistory: {
      page: 1,
      limit: 10,
      hasMore: false,
      history: [],
    },
    notifications: {
      notifications: [],
    },
  };
}

test("preserves valid dashboard response contracts", () => {
  const input = fixture();

  assert.deepEqual(
    sanitizeDashboardResponse(input),
    input
  );
});

test("removes unexpected sensitive fields at nested levels", () => {
  const input = fixture();

  const contaminated = {
    ...input,
    adminKey: "synthetic-secret",
    account: {
      account: {
        ...input.account.account,
        api_key_hash: "synthetic-hash",
      },
    },
    users: {
      users: [{
        ...input.users.users[0],
        password: "synthetic-password",
      }],
    },
    monthlyReport: {
      ...input.monthlyReport,
      account: {
        ...input.monthlyReport.account,
        token: "synthetic-token",
      },
    },
  };

  assert.deepEqual(
    sanitizeDashboardResponse(contaminated),
    input
  );
});

test("rejects invalid dashboard root values", () => {
  for (const input of [null, undefined, [], "", 42]) {
    assert.throws(() =>
      sanitizeDashboardResponse(input)
    );
  }
});

test("rejects missing required dashboard sections", () => {
  const input = fixture();

  for (const key of Object.keys(input)) {
    const incomplete: Record<string, unknown> = {
      ...input,
    };

    delete incomplete[key];

    assert.throws(() =>
      sanitizeDashboardResponse(incomplete)
    );
  }
});

test("rejects incorrectly typed nested fields", () => {
  const input = fixture();

  assert.throws(() =>
    sanitizeDashboardResponse({
      ...input,
      account: {
        account: {
          ...input.account.account,
          id: 1,
        },
      },
    })
  );
});

test("rejects malformed collection records", () => {
  const input = fixture();

  for (const users of [null, {}, [null], [{}]]) {
    assert.throws(() =>
      sanitizeDashboardResponse({
        ...input,
        users: { users },
      })
    );
  }
});

test("rejects invalid pagination field types", () => {
  const input = fixture();

  for (const page of ["1", null, NaN, Infinity]) {
    assert.throws(() =>
      sanitizeDashboardResponse({
        ...input,
        usageHistory: {
          ...input.usageHistory,
          page,
        },
      })
    );
  }
});

test("preserves unavailable historical limits", () => {
  const input = fixture();

  const historical = {
    ...input,
    monthlyReport: {
      ...input.monthlyReport,
      account: {
        ...input.monthlyReport.account,
        plan_name: null,
        monthly_limit: null,
        max_per_request: null,
        historical_limits_available: false,
      },
    },
  };

  assert.deepEqual(
    sanitizeDashboardResponse(historical),
    historical
  );
});
