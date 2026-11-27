import { isProductionDeployment } from "@/lib/deployment-config";
import { hasValidTrustedClientIp } from "@/lib/trusted-client-ip";
import { NextResponse } from "next/server";
import {
  readAuthenticationJson,
  RequestJsonError,
} from "@/lib/request-json";
import { auth } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";

const handlers = toNextJsHandler(auth);

function preventCaching(response: Response): Response {
  if (response.status >= 500) {
    void response.body?.cancel().catch(() => {});
    return authenticationFailure(response.status);
  }

  const headers = new Headers(response.headers);

  headers.set("Cache-Control", "no-store");

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function validateProductionIngress(
  request: Request
): Response | null {
  if (
    isProductionDeployment() &&
    !hasValidTrustedClientIp(request)
  ) {
    return NextResponse.json(
      { error: "Authentication service unavailable" },
      {
        status: 503,
        headers: { "Cache-Control": "no-store" },
      }
    );
  }

  return null;
}

function authenticationFailure(status = 500): Response {
  console.error("Authentication request failed");

  return NextResponse.json(
    { error: "Authentication service unavailable" },
    {
      status,
      headers: { "Cache-Control": "no-store" },
    }
  );
}

export async function GET(request: Request) {

  const ingressFailure = validateProductionIngress(request);

  if (ingressFailure) {
    return ingressFailure;
  }

  try {
    return preventCaching(await handlers.GET(request));
  } catch {
    return authenticationFailure();
  }
}

export async function POST(request: Request) {

  const ingressFailure = validateProductionIngress(request);

  if (ingressFailure) {
    return ingressFailure;
  }

  try {
    const body = await readAuthenticationJson(request);
    const headers = new Headers(request.headers);

    headers.delete("content-length");
    headers.delete("transfer-encoding");

    request = new Request(request.url, {
      method: request.method,
      headers,
      body,
      signal: request.signal,
    });
  } catch (error) {
    if (error instanceof RequestJsonError) {
      return NextResponse.json(
        { error: error.message },
        {
          status: error.status,
          headers: { "Cache-Control": "no-store" },
        }
      );
    }

    return NextResponse.json(
      { error: "Invalid request body" },
      {
        status: 400,
        headers: { "Cache-Control": "no-store" },
      }
    );
  }

  try {
    return preventCaching(await handlers.POST(request));
  } catch {
    return authenticationFailure();
  }
}
