// Small, dependency-free relative-time label for card timestamps and
// the topic sidebar ("2h ago", "Just now") - this app has no date
// library anywhere else, so a tiny hand-rolled helper matches existing
// practice rather than pulling one in for a handful of call sites.
export function formatRelativeTime(isoString, now = new Date()) {
  const then = new Date(isoString);
  const diffMs = now.getTime() - then.getTime();
  if (Number.isNaN(diffMs)) return "";
  if (diffMs < 0) return "Just now";

  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;

  return then.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
