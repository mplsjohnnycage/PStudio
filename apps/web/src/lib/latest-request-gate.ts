/** Only the newest request in a mounted scope may publish its result. */
export function createLatestRequestGate() {
  let epoch = 0;
  return {
    begin() {
      epoch += 1;
      const requestEpoch = epoch;
      return () => requestEpoch === epoch;
    },
    invalidate() {
      epoch += 1;
    },
  };
}
