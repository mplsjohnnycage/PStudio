import assert from "node:assert/strict";
import { test } from "node:test";
import { proxyStudioApi } from "../src/lib/api-proxy.ts";

const origin = "https://studio.example.test";
const upstream = "https://api.example.test";
const auth = { Authorization: "Bearer real-user-token" };
function request(path, init) {
  return new Request(origin + path, init);
}

test("proxy rejects missing user authorization and invalid destinations before network access", async () => {
  let calls = 0;
  const fetcher = () => {
    calls += 1;
    return Response.json({});
  };
  assert.equal(
    (await proxyStudioApi(request("/v1/workspaces"), { fetcher, upstream }))
      .status,
    401
  );
  assert.equal(
    (
      await proxyStudioApi(request("/v1/workspaces", { headers: auth }), {
        fetcher,
        upstream: "http://api.example.test",
      })
    ).status,
    503
  );
  assert.equal(
    (
      await proxyStudioApi(request("/v1/workspaces", { headers: auth }), {
        fetcher,
        upstream: origin,
      })
    ).status,
    503
  );
  assert.equal(
    (
      await proxyStudioApi(request("/v1/%2F%2Fevil.example"), {
        fetcher,
        upstream,
      })
    ).status,
    401
  );
  assert.equal(calls, 0);
});

test("proxy preserves the signed user bearer and idempotency key but never forwards arbitrary cookies or client-supplied trust tokens", async () => {
  let received;
  const fetcher = (url, init) => {
    received = { init, url: String(url) };
    return Response.json(
      { prospects: [] },
      { headers: { "Cache-Control": "public", "Set-Cookie": "secret=bad" } }
    );
  };
  const response = await proxyStudioApi(
    request("/v1/workspaces/ws1/prospects?limit=10", {
      headers: {
        ...auth,
        Cookie: "private=1",
        "Idempotency-Key": "once",
        "X-Vercel-Trusted-Oidc-Idp-Token": "forged",
      },
    }),
    { fetcher, getTrustedToken: () => "server-oidc", upstream }
  );
  assert.equal(response.status, 200);
  assert.equal(
    received.url,
    `${upstream}/v1/workspaces/ws1/prospects?limit=10`
  );
  const headers = new Headers(received.init.headers);
  assert.equal(headers.get("authorization"), auth.Authorization);
  assert.equal(headers.get("idempotency-key"), "once");
  assert.equal(headers.get("x-vercel-trusted-oidc-idp-token"), "server-oidc");
  assert.equal(headers.has("cookie"), false);
  assert.equal(received.init.redirect, "manual");
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.has("set-cookie"), false);
});

test("proxy rejects cross-origin writes, non-API paths, and upstream redirects", async () => {
  const fetcher = () => Response.redirect("https://other.example", 302);
  assert.equal(
    (
      await proxyStudioApi(
        request("/v1/workspaces", {
          body: "{}",
          headers: {
            ...auth,
            "Content-Type": "application/json",
            Origin: "https://other.example",
          },
          method: "POST",
        }),
        { fetcher, upstream }
      )
    ).status,
    403
  );
  assert.equal(
    (
      await proxyStudioApi(
        request("/v1/%2f%2fevil.example", { headers: auth }),
        { fetcher, upstream }
      )
    ).status,
    400
  );
  assert.equal(
    (
      await proxyStudioApi(request("/mcp", { headers: auth }), {
        fetcher,
        upstream,
      })
    ).status,
    400
  );
  assert.equal(
    (
      await proxyStudioApi(request("/v1/workspaces", { headers: auth }), {
        fetcher,
        upstream,
      })
    ).status,
    502
  );
});

test("proxy refuses to fall back to unauthenticated service access when server OIDC fails", async () => {
  let calls = 0;
  const response = await proxyStudioApi(
    request("/v1/workspaces", { headers: auth }),
    {
      fetcher: () => {
        calls += 1;
        return Response.json({});
      },
      getTrustedToken: () => {
        throw new Error("unavailable");
      },
      upstream,
    }
  );
  assert.equal(response.status, 503);
  assert.equal(calls, 0);
});

test("proxy bounds writes and does not forward oversized payloads", async () => {
  let calls = 0;
  const result = await proxyStudioApi(
    request("/v1/workspaces", {
      body: "x".repeat(1_048_577),
      headers: { ...auth, "Content-Type": "application/json", Origin: origin },
      method: "POST",
    }),
    {
      fetcher: () => {
        calls += 1;
        return Response.json({});
      },
      upstream,
    }
  );
  assert.equal(result.status, 413);
  assert.equal(calls, 0);
});

test("proxy passes through genuine backend authorization failures without cookies", async () => {
  const result = await proxyStudioApi(
    request("/v1/workspaces", { headers: auth }),
    {
      fetcher: () => Response.json({ error: "unauthorized" }, { status: 401 }),
      upstream,
    }
  );
  assert.equal(result.status, 401);
  assert.deepEqual(await result.json(), { error: "unauthorized" });
  assert.equal(result.headers.get("cache-control"), "no-store");
});
