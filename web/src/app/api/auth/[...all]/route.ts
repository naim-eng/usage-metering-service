import { NextResponse } from "next/server";
import {
  readLimitedJson,
  RequestJsonError,
} from "@/lib/request-json";
import { auth } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";

const handlers = toNextJsHandler(auth);

function preventCaching(response: Response): Response {
  const headers = new Headers(response.headers);

  headers.set("Cache-Control", "no-store");

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export async function GET(request: Request) {
  return preventCaching(await handlers.GET(request));
}

export async function POST(request: Request) {
  try {
    const contentLength = request.headers.get("content-length");
    const transferEncoding = request.headers.get("transfer-encoding");

    const hasBody =
      request.body !== null &&
      (contentLength !== "0" || transferEncoding !== null);

    if (hasBody) {
      const body = await readLimitedJson(request);
      const headers = new Headers(request.headers);

      headers.delete("content-length");
      headers.delete("transfer-encoding");

      request = new Request(request.url, {
        method: request.method,
        headers,
        body: JSON.stringify(body),
        signal: request.signal,
      });
    }
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

  return preventCaching(await handlers.POST(request));
}
