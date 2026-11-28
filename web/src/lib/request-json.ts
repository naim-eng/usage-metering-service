export const JSON_BODY_LIMIT = 16 * 1024;

export class RequestJsonError extends Error {
  constructor(
    public readonly status: 400 | 413 | 415,
    message: string
  ) {
    super(message);
    this.name = "RequestJsonError";
  }
}

export async function readLimitedJson(
  request: Request
): Promise<unknown> {
  const contentType = request.headers
    .get("content-type")
    ?.split(";")[0]
    .trim()
    .toLowerCase();

  if (contentType !== "application/json") {
    throw new RequestJsonError(
      415,
      "Unsupported content type"
    );
  }

  const encoding = request.headers
    .get("content-encoding")
    ?.trim()
    .toLowerCase();

  if (encoding && encoding !== "identity") {
    throw new RequestJsonError(
      415,
      "Unsupported request encoding"
    );
  }

  const length = request.headers.get("content-length");

  if (length !== null) {
    if (!/^\d+$/.test(length)) {
      throw new RequestJsonError(
        400,
        "Invalid content length"
      );
    }

    if (Number(length) > JSON_BODY_LIMIT) {
      throw new RequestJsonError(
        413,
        "Request body too large"
      );
    }
  }

  if (!request.body) {
    throw new RequestJsonError(400, "Invalid JSON");
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) break;

      total += value.byteLength;

      if (total > JSON_BODY_LIMIT) {
        void reader.cancel().catch(() => {});
        throw new RequestJsonError(
          413,
          "Request body too large"
        );
      }

      chunks.push(value);
    }

    if (length !== null && Number(length) !== total) {
      throw new RequestJsonError(
        400,
        "Invalid content length"
      );
    }

    const bytes = new Uint8Array(total);
    let offset = 0;

    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }

    const text = new TextDecoder(
      "utf-8",
      { fatal: true }
    ).decode(bytes);

    return JSON.parse(text);
  } catch (error) {
    if (error instanceof RequestJsonError) {
      throw error;
    }

    throw new RequestJsonError(400, "Invalid JSON");
  } finally {
    reader.releaseLock();
  }
}


export async function readAuthenticationJson(
  request: Request
): Promise<string | null> {
  const length = request.headers.get("content-length");

  if (length !== null && !/^\d+$/.test(length)) {
    throw new RequestJsonError(400, "Invalid content length");
  }

  if (length !== null && Number(length) > JSON_BODY_LIMIT) {
    throw new RequestJsonError(413, "Request body too large");
  }

  if (!request.body) {
    if (length !== null && Number(length) !== 0) {
      throw new RequestJsonError(400, "Invalid content length");
    }

    return null;
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) break;

      total += value.byteLength;

      if (total > JSON_BODY_LIMIT) {
        void reader.cancel().catch(() => {});
        throw new RequestJsonError(413, "Request body too large");
      }

      chunks.push(value);
    }

    if (length !== null && Number(length) !== total) {
      throw new RequestJsonError(400, "Invalid content length");
    }

    if (total === 0) return null;

    const bytes = new Uint8Array(total);
    let offset = 0;

    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }

    const validated = await readLimitedJson(
      new Request(request.url, {
        method: "POST",
        headers: request.headers,
        body: bytes,
      })
    );

    if (
      validated === null ||
      typeof validated !== "object" ||
      Array.isArray(validated)
    ) {
      throw new RequestJsonError(400, "Invalid JSON object");
    }

    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch (error) {
    if (error instanceof RequestJsonError) throw error;

    throw new RequestJsonError(400, "Invalid JSON");
  } finally {
    reader.releaseLock();
  }
}
