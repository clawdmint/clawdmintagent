// Per-collection countdown deadlines. Address keys are stored lowercase.
// When an address has an active deadline (in the future), the
// `<CollectionCountdown>` UI surfaces a ticking timer; once the deadline
// passes, the timer is hidden and the page renders normally.
const COLLECTION_COUNTDOWNS: Record<string, string> = {
  hkuajrmg1k99xhp3wuhhvxosnhyxempebmqxrqfmhnrq: "2026-04-27T19:00:00Z",
};

export function getCollectionCountdownDeadline(address: string | null | undefined): Date | null {
  if (!address) {
    return null;
  }
  const value = COLLECTION_COUNTDOWNS[address.toLowerCase()];
  if (!value) {
    return null;
  }
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

export function hasActiveCollectionCountdown(address: string | null | undefined): boolean {
  const deadline = getCollectionCountdownDeadline(address);
  if (!deadline) {
    return false;
  }
  return deadline.getTime() > Date.now();
}
