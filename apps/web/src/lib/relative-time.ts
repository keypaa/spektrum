const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const MONTH = 30.44 * DAY;
const YEAR = 365.25 * DAY;

/** Prism's mini relative-time strings: now, Nm, Nh, Nd, Nmo, Nyr. */
export function relativeTime(from: Date, now: Date): string {
  const seconds = Math.max(0, Math.floor((now.getTime() - from.getTime()) / 1000));
  if (seconds < MINUTE) return "now";
  const minutes = Math.floor(seconds / MINUTE);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(seconds / HOUR);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(seconds / DAY);
  if (days < 31) return `${days}d`;
  const months = Math.round(seconds / MONTH);
  if (months < 12) return `${months}mo`;
  return `${Math.round(seconds / YEAR)}yr`;
}
