import {
  APIError,
  createAuthMiddleware,
  freshSessionMiddleware,
} from "better-auth/api";
import { isProductionDeployment } from "./deployment-config";
import { enforcePasswordScreening } from "./password-screening";
import {
  MIN_PASSWORD_LENGTH,
  MAX_PASSWORD_LENGTH,
} from "./password-policy";

export const enforceNewPasswordPolicy =
  createAuthMiddleware(async (ctx) => {
    let password: unknown;

    switch (ctx.path) {
      case "/sign-up/email":
        password = ctx.body?.password;
        break;

      case "/change-password":
        await freshSessionMiddleware(ctx);
        password = ctx.body?.newPassword;
        break;

      case "/reset-password":
        password = ctx.body?.newPassword;
        break;

      default:
        return;
    }

    if (typeof password !== "string") {
      return;
    }

    if (password.length > MAX_PASSWORD_LENGTH) {
      throw new APIError("BAD_REQUEST", {
        code: "PASSWORD_TOO_LONG",
        message:
          `Password must contain no more than ${MAX_PASSWORD_LENGTH} characters.`,
      });
    }

    if (
      password.length < MIN_PASSWORD_LENGTH ||
      Array.from(password.normalize("NFKC")).length <
        MIN_PASSWORD_LENGTH
    ) {
      throw new APIError("BAD_REQUEST", {
        code: "PASSWORD_TOO_SHORT",
        message:
          `Password must contain at least ${MIN_PASSWORD_LENGTH} characters.`,
      });
    }

    if (isProductionDeployment()) {
      await enforcePasswordScreening(password);
    }
  });
