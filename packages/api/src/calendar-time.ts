const CENTRAL_TIMEZONE = "America/Chicago";
const DATE_PARTS = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_PARTS = /^(\d{2}):(\d{2})$/;
const validDuration = (value: number) =>
  Number.isInteger(value) && value >= 15 && value <= 120;

const FORMAT = new Intl.DateTimeFormat("en-CA", {
  day: "2-digit",
  hour: "2-digit",
  hourCycle: "h23",
  minute: "2-digit",
  month: "2-digit",
  timeZone: CENTRAL_TIMEZONE,
  year: "numeric",
});

function localParts(instant: number): string {
  const parts = Object.fromEntries(
    FORMAT.formatToParts(new Date(instant)).map(({ type, value }) => [
      type,
      value,
    ])
  );
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:00`;
}

export function centralToday(now: Date = new Date()): string {
  return localParts(now.getTime()).slice(0, 10);
}

/**
 * AgentMail accepts naive local timestamps plus America/Chicago timezone.
 * Reject nonexistent/ambiguous DST times instead of silently booking the
 * wrong instant; do not reinterpret Chicago wall clock time as UTC.
 */
export function buildCentralCalendarHold(
  date: string,
  time: string,
  minutes: number
): { start: string; end: string } {
  const day = DATE_PARTS.exec(date);
  const clock = TIME_PARTS.exec(time);
  if (!(day && clock && validDuration(minutes))) {
    throw new Error("Enter a valid Central date, time, and duration.");
  }
  const year = Number(day[1]);
  const month = Number(day[2]);
  const dateOfMonth = Number(day[3]);
  const hours = Number(clock[1]);
  const mins = Number(clock[2]);
  const naive = Date.UTC(year, month - 1, dateOfMonth, hours, mins);
  const start = `${date}T${time}:00`;
  if (
    hours > 23 ||
    mins > 59 ||
    !Number.isFinite(naive) ||
    new Date(naive).toISOString().slice(0, 16) !== start.slice(0, 16)
  ) {
    throw new Error("Enter a valid Central date and time.");
  }
  // Chicago uses UTC−6 (CST) and UTC−5 (CDT). Verify the actual
  // offset using Intl so timezone transitions cannot be misrepresented.
  const possible = [-360, -300]
    .map((offsetMinutes) => naive - offsetMinutes * 60_000)
    .filter((instant) => localParts(instant) === start);
  const [startMillis] = possible;
  if (possible.length !== 1 || startMillis === undefined) {
    throw new Error(
      "That Central time is unavailable or occurs twice due to daylight saving. Choose a different time."
    );
  }
  const endMillis = startMillis + minutes * 60_000;
  const end = localParts(endMillis);
  const endAsUtc = Date.parse(`${end}Z`);
  const matchingEndInstants = [-360, -300]
    .map((offsetMinutes) => endAsUtc - offsetMinutes * 60_000)
    .filter((instant) => localParts(instant) === end);
  // The provider only receives local timestamps and a timezone, not an
  // offset, so repeated end times are ambiguous even if start was unique.
  const clockDuration = endAsUtc - naive;
  if (
    matchingEndInstants.length !== 1 ||
    matchingEndInstants[0] !== endMillis ||
    clockDuration !== minutes * 60_000
  ) {
    throw new Error(
      "The call crosses a daylight-saving clock change. Choose a different time."
    );
  }
  return { end, start };
}
