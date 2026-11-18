import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildCentralCalendarHold,
  centralToday,
} from "../../../packages/api/src/calendar-time.ts";

test("Calendar preserves Chicago wall time in winter and summer", () => {
  assert.deepEqual(buildCentralCalendarHold("2026-11-18", "10:00", 30), {
    end: "2026-11-18T10:30:00",
    start: "2026-11-18T10:00:00",
  });
  assert.deepEqual(buildCentralCalendarHold("2026-07-18", "10:15", 45), {
    end: "2026-07-18T11:00:00",
    start: "2026-07-18T10:15:00",
  });
});

test("Calendar correctly rolls over midnight without using browser timezone", () => {
  assert.deepEqual(buildCentralCalendarHold("2026-11-18", "23:45", 30), {
    end: "2026-11-19T00:15:00",
    start: "2026-11-18T23:45:00",
  });
});

test("Calendar rejects nonexistent, duplicate, and DST-spanning Chicago times", () => {
  assert.throws(() => buildCentralCalendarHold("2026-03-08", "02:30", 30));
  assert.throws(() => buildCentralCalendarHold("2026-11-01", "01:30", 30));
  assert.throws(() => buildCentralCalendarHold("2026-03-08", "01:45", 30));
  assert.throws(() => buildCentralCalendarHold("2026-11-01", "00:45", 60));
});

test("Calendar rejects invalid dates, times, and durations", () => {
  assert.throws(() => buildCentralCalendarHold("2026-02-30", "10:00", 30));
  assert.throws(() => buildCentralCalendarHold("2026-11-18", "25:00", 30));
  assert.throws(() => buildCentralCalendarHold("2026-11-18", "10:91", 30));
  assert.throws(() => buildCentralCalendarHold("2026-11-18", "10:00", 180));
});

test("Calendar date defaults to Central time regardless of browser timezone", () => {
  assert.equal(centralToday(new Date("2026-11-18T04:30:00Z")), "2026-11-17");
  assert.equal(centralToday(new Date("2026-11-18T18:30:00Z")), "2026-11-18");
});
