# Customer User Guide

## Getting Started

1. Open the customer dashboard.
2. Register using your email address and password.
3. Verify your email using the verification message.
4. Select **Forgot password** and follow the recovery email to establish your password. Then sign in.
5. Select an existing workspace or use **Create organization**.
6. Create a project within your workspace.

## Organizations and Projects

Organizations separate customer workspaces.
Projects contain metering accounts, usage records and API keys.

Organization owners and administrators can manage projects
and their API credentials.

## API Keys

1. Open your project dashboard.
2. Navigate to API Keys.
3. Select **Generate API Key**.
4. Copy and securely store the displayed secret.
5. Configure your application to use the key.

Never expose API keys in public repositories or browser code.

See the [API integration guide](customer-api-guide.md)
for instructions on connecting your application.

## Monitoring Usage

Open your project dashboard to review:

- Account and user credit allowances.
- Consumed and remaining credits.
- Usage request history.
- Historical monthly usage.
- Low-credit notifications.

Monthly reporting uses UTC calendar months.

## Quota Enforcement

Requests exceeding applicable quota limits are rejected.
Rejected consumption requests do not deduct credits.

Low-credit notifications are recorded at 80%, 90%
and 100% usage thresholds. External notification
delivery is not currently supported.

## Rotating API Keys

1. Generate a replacement API key.
2. Update your application configuration.
3. Verify requests using the replacement key.
4. Select **Revoke** for the old key. Revocation takes effect immediately.

## Account Recovery

Use the password recovery option on the sign-in page.
Follow the instructions in the recovery email.

Password recovery invalidates existing sessions.

## Troubleshooting

- Check your active workspace and project.
- Verify that your API key has not been revoked.
- Review remaining credits and request limits.
- Check your spam folder for authentication emails.
