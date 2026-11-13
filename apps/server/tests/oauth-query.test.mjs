import assert from "node:assert/strict";
import { test } from "node:test";
import {
  isOAuthVisit,
  requiresFreshLogin,
} from "../../web/src/lib/oauth-query.ts";

test("Neon OAuth login redirect is recognized with client_id alone", () => {
  assert.equal(isOAuthVisit("?client_id=client123&sig=abc&ba_param=def"), true);
  assert.equal(isOAuthVisit("?client_id=client123"), true);
  assert.equal(isOAuthVisit("?response_type=code"), false);
  assert.equal(isOAuthVisit(""), false);
});

test("OAuth login and create prompts require fresh sign in", () => {
  assert.equal(requiresFreshLogin("?client_id=c&prompt=login"), true);
  assert.equal(requiresFreshLogin("?client_id=c&prompt=create"), true);
  assert.equal(requiresFreshLogin("?client_id=c&prompt=consent%20login"), true);
  assert.equal(requiresFreshLogin("?client_id=c&prompt=consent"), false);
  assert.equal(requiresFreshLogin("?prompt=login"), false);
});
