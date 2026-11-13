import { readFile } from "node:fs/promises";
import { dirname, extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import type { Context, Hono } from "hono";

const MIME: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

const ALLOWED_ASSET = /^\/_next\/static\/[A-Za-z0-9/_\-.]+$/;
const AUTH_SUFFIX = /(?:\/index\.html)?\/?$/;
function blockedSignUp(pathname: string, inviteOnly: boolean): boolean {
  return inviteOnly && pathname.startsWith("/auth/sign-up");
}

const ALLOWED_AUTH =
  /^\/auth\/(?:sign-in|sign-up|consent)(?:\/(?:index\.html)?)?$/;

/**
 * Serve only the exported, immutable staging UI. This is NOT generic file
 * hosting: names are allowlisted, normalized, and confined to the ZIP's site
 * folder. None of these routes exist unless explicitly enabled at deployment.
 */
export function mountPublicStagingUi(
  app: Hono,
  siteDir = resolve(dirname(fileURLToPath(import.meta.url)), "site"),
  inviteOnly = false
) {
  async function serve(c: Context) {
    let pathname: string;
    try {
      pathname = decodeURIComponent(new URL(c.req.url).pathname);
    } catch {
      return c.text("Not found", 404);
    }
    if (blockedSignUp(pathname, inviteOnly)) {
      return c.text("Not found", 404);
    }
    const isAsset = ALLOWED_ASSET.test(pathname);
    const isAuth = ALLOWED_AUTH.test(pathname);
    if (
      !(pathname === "/" || pathname === "/favicon.ico" || isAuth || isAsset)
    ) {
      return c.text("Not found", 404);
    }

    let location = pathname.slice(1);
    if (pathname === "/") {
      location = "index.html";
    } else if (isAuth) {
      location = `${pathname.slice(1).replace(AUTH_SUFFIX, "")}/index.html`;
    }
    const fullPath = resolve(siteDir, location);
    if (!fullPath.startsWith(resolve(siteDir) + sep)) {
      return c.text("Not found", 404);
    }
    let bytes: Buffer;
    try {
      bytes = await readFile(fullPath);
    } catch {
      return c.text("Not found", 404);
    }
    const headers: Record<string, string> = {
      "Cache-Control": isAsset
        ? "public, max-age=31536000, immutable"
        : "no-store",
      "Content-Type": MIME[extname(fullPath)] ?? "application/octet-stream",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "X-Content-Type-Options": "nosniff",
    };
    if (!isAsset) {
      headers["Content-Security-Policy"] = "frame-ancestors 'none'";
      headers["X-Frame-Options"] = "DENY";
    }
    return c.body(new Uint8Array(bytes), 200, headers);
  }
  app.get("/", serve);
  app.get("/auth/*", serve);
  app.get("/_next/*", serve);
  app.get("/favicon.ico", serve);
}
