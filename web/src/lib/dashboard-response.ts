type Schema =
  | "string"
  | "number"
  | "boolean"
  | "nullable-string"
  | readonly [Schema]
  | { readonly [key: string]: Schema };

function projectFields(
  value: unknown,
  schema: Schema
): unknown {
  if (typeof schema === "string") {
    if (schema === "nullable-string") {
      if (value === null || typeof value === "string") {
        return value;
      }
    } else if (
      typeof value === schema &&
      (schema !== "number" || Number.isFinite(value))
    ) {
      return value;
    }

    throw new Error("Invalid dashboard field");
  }

  if (Array.isArray(schema)) {
    if (!Array.isArray(value)) {
      throw new Error("Invalid dashboard collection");
    }

    return value.map((item) =>
      projectFields(item, schema[0])
    );
  }

  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    throw new Error("Invalid dashboard record");
  }

  const record = value as Record<string, unknown>;
  const fields = schema as Record<string, Schema>;

  return Object.fromEntries(
    Object.entries(fields).map(([key, field]) => [
      key,
      projectFields(record[key], field),
    ])
  );
}

const allowanceFields = {
  plan_id: "string",
  plan_name: "string",
  monthly_limit: "string",
  max_per_request: "string",
  units_used: "string",
  units_remaining: "string",
  month_start: "string",
} as const;

const reportFields = {
  plan_name: "nullable-string",
  monthly_limit: "nullable-string",
  max_per_request: "nullable-string",
  historical_limits_available: "boolean",
  units_used: "string",
  plan_changes: [{
    plan_name: "string",
    monthly_limit: "string",
    max_per_request: "string",
    change_type: "string",
    effective_at: "string",
  }],
} as const;

const dashboardSchema = {
  account: {
    account: {
      id: "string",
      name: "string",
      ...allowanceFields,
    },
  },
  users: {
    users: [{
      user_id: "string",
      ...allowanceFields,
    }],
  },
  monthlyReport: {
    month: "string",
    account: {
      name: "string",
      ...reportFields,
    },
    users: [{
      user_id: "string",
      ...reportFields,
    }],
  },
  usageHistory: {
    page: "number",
    limit: "number",
    hasMore: "boolean",
    history: [{
      request_id: "string",
      user_id: "string",
      units_requested: "string",
      accepted: "boolean",
      rejection_scope: "nullable-string",
      rejection_rule: "nullable-string",
      created_at: "string",
    }],
  },
  notifications: {
    notifications: [{
      id: "string",
      scope: "string",
      userId: "nullable-string",
      month: "string",
      thresholdPercent: "number",
      monthlyLimit: "string",
      unitsUsed: "string",
      remainingCredits: "string",
      createdAt: "string",
    }],
  },
} as const satisfies Schema;

export function sanitizeDashboardResponse(
  value: unknown
): Record<string, unknown> {
  return projectFields(
    value,
    dashboardSchema
  ) as Record<string, unknown>;
}
