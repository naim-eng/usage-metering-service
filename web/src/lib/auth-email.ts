import nodemailer from "nodemailer";
import { loadEmailConfig } from "./email-config";

export type AuthEmailKind =
  | "verification"
  | "password-reset";

export async function sendAuthEmail({
  kind,
  recipient,
  url,
}: {
  kind: AuthEmailKind;
  recipient: string;
  url: string;
}): Promise<void> {
  const config = loadEmailConfig();

  if (
    !recipient ||
    recipient.length > 254 ||
    /[\r\n,;<>]/.test(recipient) ||
    !/^[^\s@]+@[^\s@]+$/.test(recipient)
  ) {
    throw new Error("Invalid email recipient");
  }

  let link: URL;

  try {
    link = new URL(url);

    const base = new URL(process.env.BETTER_AUTH_URL ?? "");

    if (
      link.origin !== base.origin ||
      link.username ||
      link.password ||
      (link.protocol !== "http:" && link.protocol !== "https:")
    ) {
      throw new Error();
    }

    if (
      process.env.DEPLOYMENT_ENV === "production" &&
      link.protocol !== "https:"
    ) {
      throw new Error();
    }
  } catch {
    throw new Error("Invalid authentication email URL");
  }

  const verification = kind === "verification";

  const subject = verification
    ? "Verify your Usage Metering email"
    : "Reset your Usage Metering password";

  const action = verification
    ? "Verify your email address"
    : "Reset your password";

  const text = [
    action,
    "",
    link.toString(),
    "",
    "If you did not request this action, ignore this email.",
    "",
    "Usage Metering",
  ].join("\n");

  const transport = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    requireTLS: config.requireTLS,
    auth: config.auth,
    connectionTimeout: 5000,
    greetingTimeout: 5000,
    socketTimeout: 10000,
    dnsTimeout: 5000,
    disableFileAccess: true,
    disableUrlAccess: true,
    tls: {
      rejectUnauthorized: true,
      minVersion: "TLSv1.2",
    },
    logger: false,
    debug: false,
  });

  try {
    const result = await transport.sendMail({
      from: config.from,
      to: recipient,
      subject,
      text,
    });

    if (result.accepted.length !== 1 || result.rejected.length > 0) {
      throw new Error();
    }
  } catch {
    throw new Error("Authentication email delivery failed");
  } finally {
    transport.close();
  }
}
