/** OAuth Provider sends the login page a client_id plus a signed query. */
const FRESH_LOGIN = /(?:^|\s)(?:login|create)(?:\s|$)/;

export function isOAuthVisit(search: string): boolean {
  return new URLSearchParams(search).has("client_id");
}

export function requiresFreshLogin(search: string): boolean {
  const params = new URLSearchParams(search);
  return isOAuthVisit(search) && FRESH_LOGIN.test(params.get("prompt") ?? "");
}
