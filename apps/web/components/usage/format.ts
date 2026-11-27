// UTC and a fixed locale, so the server render and the browser agree.
const numberFormat = new Intl.NumberFormat("en");
const dateFormat = new Intl.DateTimeFormat("en", {
  dateStyle: "medium",
  timeZone: "UTC",
});

export const formatCount = (n: number): string => numberFormat.format(n);

export const formatResetDate = (iso: string): string =>
  dateFormat.format(new Date(iso));

/** "X / Y messages", e.g. "1,200 / 2,000 messages". */
export const usageText = (used: number, limit: number): string =>
  `${formatCount(used)} / ${formatCount(limit)} messages`;
