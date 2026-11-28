
# Customer API Integration Guide

This guide explains how to integrate the Usage Metering and Quota Service into your application.

The service tracks credit consumption, enforces account and user quotas, prevents duplicate charges, and provides usage reporting.

## 1. Getting Started

### Create a project

1. Sign in to the customer dashboard.
2. Select your organization workspace and create a project. New projects receive the default Starter account plan.
3. Open the project's dashboard.
4. Navigate to **API Keys**.
5. Enter a descriptive key name and select **Generate API Key**.
6. Copy the generated API key immediately.

The complete API key is displayed only during creation.

For registration and workspace setup, see the [customer user guide](customer-user-guide.md).

### API base URL

For local development:

```text
http://localhost:3000
```

Replace this URL with your deployed API endpoint when running in another environment.

## 2. Authentication

Include your project API key in the `X-API-Key` header.

```http
X-API-Key: YOUR_PROJECT_API_KEY
```

Example:

```bash
curl http://localhost:3000/account \
  -H "X-API-Key: YOUR_PROJECT_API_KEY"
```

A successful request returns information about the authenticated project's metering account.

API keys are scoped to their associated project and resolve to that project's metering account.

Project API keys must be active and associated with an active project.

Administrative credentials are not customer API keys.
Legacy account credentials cannot authenticate project-linked accounts.

### Security recommendations

- Keep API keys on your application server.
- Never expose API keys in browser-side JavaScript.
- Never commit API keys to Git.
- Store credentials in environment variables or a secrets manager.
- Use HTTPS for deployed API requests.
- Revoke credentials that are no longer needed.

## 3. Available Plans

Retrieve predefined account and user plans:

```http
GET /plans
```

Example:

```bash
curl http://localhost:3000/plans
```

Plans specify a monthly credit limit and a maximum number of credits allowed per request.

When registering a user, select a plan with `plan_type` set to `user`.

## 4. Register a User

Create a metered user under the authenticated project:

```http
POST /users
Content-Type: application/json
X-API-Key: YOUR_PROJECT_API_KEY
```

Request body:

```json
{
  "userId": "customer-123",
  "planId": 3
}
```

`userId` is your application's identifier for the customer.

`planId` must identify an accessible user plan.

A successful registration returns HTTP `201 Created`.

If the user already exists in the account, the API returns HTTP `409 Conflict`.

## 5. Consume Credits

Record usage whenever your application performs a billable or quota-controlled operation.

```http
POST /consume
Content-Type: application/json
X-API-Key: YOUR_PROJECT_API_KEY
```

Request body:

```json
{
  "userId": "customer-123",
  "units": 2,
  "requestId": "operation-unique-001"
}
```

Fields:

| Field | Description |
|---|---|
| `userId` | Registered user identifier |
| `units` | Positive integer number of credits requested |
| `requestId` | Unique identifier for the logical operation |

Example accepted response for a new Starter account and Basic user with no previous monthly consumption:

```json
{
  "accepted": true,
  "scope": null,
  "rule": null,
  "replayed": false,
  "accountRemaining": "98",
  "userRemaining": "8"
}
```

The remaining-credit fields are returned as strings.

The API evaluates both account-level and user-level quota restrictions.

Accepted requests deduct credits atomically. Rejected consumption requests do not deduct credits.

### Understanding quota rejections

Quota violations return HTTP 200 with `accepted: false`. No credits are deducted.

| Scope | Rule | Meaning |
|---|---|---|
| `account` | `max_per_request` | Exceeds account per-request limit |
| `user` | `max_per_request` | Exceeds user per-request limit |
| `account` | `monthly_limit` | Insufficient account monthly credits |
| `user` | `monthly_limit` | Insufficient user monthly credits |

Inspect `accepted`, `scope`, and `rule` before proceeding. Do not automatically retry rejected operations without addressing the quota restriction.

## 6. Prevent Duplicate Charges

The API supports idempotent consumption requests.

If a request is retried with the same `requestId` and identical parameters, the service returns the original result without deducting credits again.

A successful replay includes:

```json
{
  "replayed": true
}
```

Use a unique `requestId` within the metering account for every new logical operation.

Reuse that identifier only when retrying the same operation.

If an existing request ID is reused with different parameters, the API returns HTTP `409 Conflict`.

## 7. Inspect Usage and Allowances

### Account allowance

```http
GET /account
X-API-Key: YOUR_PROJECT_API_KEY
```

### User allowances

```http
GET /users
X-API-Key: YOUR_PROJECT_API_KEY
```

### Usage history

```http
GET /usage/history?page=1&limit=50
X-API-Key: YOUR_PROJECT_API_KEY
```

Usage history is paginated and scoped to the authenticated account.

The maximum page size is 100.

### Monthly reporting

```http
GET /usage/monthly?month=2026-11
X-API-Key: YOUR_PROJECT_API_KEY
```

Monthly reporting includes consumption totals and available historical plan information.

### Low-credit notifications

```http
GET /notifications
X-API-Key: YOUR_PROJECT_API_KEY
```

Notifications are generated when accepted consumption reaches configured usage thresholds of 80%, 90%, or 100%.

## 8. Handle API Errors

Common HTTP status codes include:

| Status | Meaning |
|---|---|
| `200` | Request processed |
| `201` | Resource created |
| `400` | Invalid request parameters |
| `401` | Missing, invalid, or revoked API key |
| `404` | Requested user or resource not found |
| `409` | Duplicate resource or conflicting request ID |
| `413` | Request body exceeds the permitted size |
| `415` | Unsupported request content type or encoding |
| `429` | Request rate limit exceeded |
| `500` | Internal server error |

A consumption request may return HTTP `200` with `accepted: false` when quota rules reject the operation.

Always inspect the `accepted` field before treating a consumption request as authorized.

Do not automatically retry rejected quota decisions.

Send JSON request bodies using Content-Type: application/json.
The maximum JSON request body size is 16 KiB.

For HTTP 429 responses, use bounded exponential backoff.
Respect Retry-After when provided.

When retrying a consumption request after a transient failure,
reuse the original request ID and identical request parameters.

## 9. Revoke an API Key

To revoke a project API key:

1. Open the customer dashboard.
2. Select the relevant project.
3. Navigate to **API Keys**.
4. Find the credential you want to revoke.
5. Select **Revoke** and confirm.

Revocation takes effect immediately for subsequent authentication attempts.

To rotate credentials, generate a replacement key, update your application's configuration, verify the replacement works, and then revoke the previous key.

## 10. Integration Checklist

- [ ] Create a customer project
- [ ] Generate a project API key
- [ ] Store the API key securely
- [ ] Retrieve available user plans
- [ ] Register a metered user
- [ ] Submit a consumption request
- [ ] Check the `accepted` result
- [ ] Use unique request IDs
- [ ] Verify usage in the dashboard
- [ ] Handle authentication and quota errors
- [ ] Establish an API-key rotation process

## 11. API Endpoint Reference

### Public endpoints

| Method | Endpoint | Purpose |
|---|---|---|
| GET | /health | Service health |
| GET | /ready | Database readiness |
| GET | /plans | Predefined plans |

### Customer endpoints

These endpoints require a valid metering API key.

| Method | Endpoint | Purpose |
|---|---|---|
| POST | /users | Register a metered user |
| POST | /consume | Record credit consumption |
| GET | /account | Account allowances |
| GET | /users | User allowances |
| GET | /usage/history | Paginated usage history |
| GET | /usage/monthly | Monthly usage reporting |
| GET | /notifications | Low-credit notifications |
| GET | /plans/custom | List account-owned custom plans |
| POST | /plans | Create a custom plan |
| PATCH | /plans/:planId | Update a custom plan |
| PATCH | /accounts/plan | Change the account plan |
| PATCH | /users/plan | Change a user plan |

### Administrative endpoints

These endpoints require privileged server-side credentials.
They are not intended for direct customer integrations.

| Method | Endpoint | Purpose |
|---|---|---|
| POST | /accounts | Create a standalone account |
| POST | /accounts/:accountId/api-key/rotate | Rotate a standalone account key |
| GET | /projects | List organization projects |
| POST | /projects | Create a project |
| GET | /projects/:projectId/dashboard | Retrieve project dashboard |
| GET | /projects/:projectId/api-keys | List project keys |
| POST | /projects/:projectId/api-keys | Generate a project key |
| DELETE | /projects/:projectId/api-keys/:keyId | Revoke a project key |

Project management should be performed through the authenticated
customer dashboard. Administrative credentials must remain server-side.

Standalone account key rotation does not apply to project-linked accounts.
