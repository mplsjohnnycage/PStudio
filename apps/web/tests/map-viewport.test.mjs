import assert from "node:assert/strict";
import { test } from "node:test";
import {
  INITIAL_MAP_VIEWPORT,
  mapViewportStorageKey,
  parseMapViewport,
  readMapViewport,
} from "../src/lib/map-viewport.ts";

test("map remembers only valid geographic viewports", () => {
  const saved = { latitude: 44.982, longitude: -93.26, zoom: 13.5 };
  assert.deepEqual(readMapViewport(JSON.stringify(saved)), saved);
  assert.deepEqual(parseMapViewport(saved), saved);
  assert.equal(INITIAL_MAP_VIEWPORT.longitude, -93.265);
});

test("map fails safely for corrupt or forged browser storage", () => {
  for (const bad of [
    null,
    "not-json",
    "[]",
    JSON.stringify({ latitude: "44.98", longitude: -93.26, zoom: 10 }),
    JSON.stringify({ latitude: 95, longitude: -93.26, zoom: 10 }),
    JSON.stringify({ latitude: 44.98, longitude: -193, zoom: 10 }),
    JSON.stringify({ latitude: 44.98, longitude: -93.26, zoom: 25 }),
    JSON.stringify({ latitude: null, longitude: -93.26, zoom: 10 }),
    "a".repeat(201),
  ]) {
    assert.equal(readMapViewport(bad), null);
  }
});

test("map state is scoped to the signed-in user and verified workspace", () => {
  assert.notEqual(
    mapViewportStorageKey("owner-a", "ws-1"),
    mapViewportStorageKey("owner-b", "ws-1")
  );
  assert.notEqual(
    mapViewportStorageKey("owner-a", "ws-1"),
    mapViewportStorageKey("owner-a", "ws-2")
  );
  assert.equal(mapViewportStorageKey("", "ws-1"), null);
  assert.equal(mapViewportStorageKey("owner-a", ""), null);
});
