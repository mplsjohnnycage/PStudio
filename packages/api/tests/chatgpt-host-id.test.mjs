import assert from "node:assert/strict";
import test from "node:test";
import {
  chatgptOAuthDeviceId,
  validChatgptHostId,
} from "../src/chatgpt-hosted-policy.ts";

const DEVICE_ID = "e05569d2-d7ee-4c73-940b-9b5b1e71c13d";

test("OAuth device ID strips urn:uuid prefix added by PStudio staging config", () => {
  const prefixed = `urn:uuid:${DEVICE_ID}`;
  assert.equal(validChatgptHostId(prefixed), true);
  assert.equal(chatgptOAuthDeviceId(prefixed), DEVICE_ID);
});

test("bare UUID stays stable across restarts", () => {
  assert.equal(chatgptOAuthDeviceId(DEVICE_ID), DEVICE_ID);
  assert.equal(chatgptOAuthDeviceId(DEVICE_ID.toUpperCase()), DEVICE_ID);
});

test("malformed or empty identities fail closed", () => {
  for (const input of [
    "",
    "urn:uuid:",
    "urn:uuid:bad-id",
    "https://example.com/uuid",
  ]) {
    assert.equal(validChatgptHostId(input), false);
    assert.throws(() => chatgptOAuthDeviceId(input));
  }
});
