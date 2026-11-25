interface ProxyOptions {
  fetcher?: typeof fetch;
  getTrustedToken?: () => Promise<string>;
  upstream: string | undefined;
}

const bearer = /^Bearer [^\s]+$/i;
const safePath = /^\/v1\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+$/;
const maxBody = 1_048_576;
const jsonContentType = /^application\/(?:json|[a-z0-9.+-]+\+json)(?:;|$)/i;

function failure(error: string, status: number) {
  return Response.json(
    { error },
    { headers: { "Cache-Control": "no-store" }, status }
  );
}

async function readBoundedBody(
  request: Request
): Promise<Uint8Array<ArrayBuffer> | null> {
  if (!request.body) {
    return new Uint8Array(0);
  }
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      // biome-ignore lint/performance/noAwaitInLoops: consume bounded stream in order
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      size += value.byteLength;
      if (size > maxBody) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return bytes;
  } finally {
    reader.releaseLock();
  }
}

function resolveDestination(
  requestUrl: URL,
  upstream: string | undefined
): URL | null {
  try {
    const configured = new URL(upstream ?? "");
    if (
      configured.protocol !== "https:" ||
      configured.username ||
      configured.password ||
      configured.pathname !== "/" ||
      configured.search ||
      configured.hash ||
      configured.origin === requestUrl.origin
    ) {
      return null;
    }
    return new URL(requestUrl.pathname + requestUrl.search, configured.origin);
  } catch {
    return null;
  }
}

async function upstreamHeaders(
  request: Request,
  authorization: string,
  options: ProxyOptions
): Promise<Headers | null> {
  const headers = new Headers({ authorization });
  for (const name of ["accept", "content-type", "idempotency-key"]) {
    const value = request.headers.get(name);
    if (value) {
      headers.set(name, value);
    }
  }
  if (options.getTrustedToken) {
    try {
      const token = await options.getTrustedToken();
      if (!token) {
        return null;
      }
      headers.set("x-vercel-trusted-oidc-idp-token", token);
    } catch {
      return null;
    }
  }

  return headers;
}

/** The browser user token stays authoritative. Server OIDC is only transport identity. */
export async function proxyStudioApi(
  request: Request,
  options: ProxyOptions
): Promise<Response> {
  const authorization = request.headers.get("authorization");
  if (!(authorization && bearer.test(authorization))) {
    return failure("unauthorized", 401);
  }
  const requestUrl = new URL(request.url);
  if (!safePath.test(requestUrl.pathname)) {
    return failure("invalid_resource_id", 400);
  }
  if (!["GET", "POST"].includes(request.method)) {
    return failure("method_not_allowed", 405);
  }
  if (request.method === "POST") {
    const origin = request.headers.get("origin");
    if (origin && origin !== requestUrl.origin) {
      return failure("forbidden", 403);
    }
  }
  const destination = resolveDestination(requestUrl, options.upstream);
  if (!destination) {
    return failure("temporarily_unavailable", 503);
  }

  const headers = await upstreamHeaders(request, authorization, options);
  if (!headers) {
    return failure("temporarily_unavailable", 503);
  }

  try {
    const body =
      request.method === "POST" ? await readBoundedBody(request) : undefined;
    if (body === null) {
      return failure("payload_too_large", 413);
    }
    const upstream = await (options.fetcher ?? fetch)(destination, {
      body,
      cache: "no-store",
      headers,
      method: request.method,
      redirect: "manual",
      signal: AbortSignal.timeout(20_000),
    });
    if (upstream.status >= 300 && upstream.status < 400) {
      return failure("upstream_unavailable", 502);
    }
    const contentType = upstream.headers.get("content-type") ?? "";
    if (!jsonContentType.test(contentType)) {
      return failure("upstream_unavailable", 502);
    }
    return new Response(upstream.body, {
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": contentType,
        "X-Content-Type-Options": "nosniff",
      },
      status: upstream.status,
    });
  } catch {
    return failure("upstream_unavailable", 502);
  }
}
