import { getVercelOidcToken } from "@vercel/oidc";
import { proxyStudioApi } from "@/lib/api-proxy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function proxy(request: Request) {
  return proxyStudioApi(request, {
    upstream: process.env.PSTUDIO_API_UPSTREAM_URL,
    ...(process.env.PSTUDIO_API_TRUSTED_SOURCE === "1"
      ? { getTrustedToken: getVercelOidcToken }
      : {}),
  });
}

export const GET = proxy;
export const POST = proxy;
