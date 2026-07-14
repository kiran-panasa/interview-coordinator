import { useEffect, useState } from "react";

function timeAgo(ts) {
  const secs = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (secs < 5) return "just now";
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  return `${hrs}h ago`;
}

export default function AutosaveIndicator({ status, lastSavedAt }) {
  const [, forceTick] = useState(0);

  // Re-render periodically so the "Xs/Xm ago" text stays fresh.
  useEffect(() => {
    if (!lastSavedAt) return;
    const t = setInterval(() => forceTick(x => x + 1), 10000);
    return () => clearInterval(t);
  }, [lastSavedAt]);

  if (status === "saving" || status === "pending") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-gray-400">
        <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
        </svg>
        Saving draft…
      </span>
    );
  }
  if (status === "error") {
    return <span className="text-xs text-red-500">Draft save failed — will retry</span>;
  }
  if (status === "saved" && lastSavedAt) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-emerald-600">
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
        </svg>
        Draft saved · {timeAgo(lastSavedAt)}
      </span>
    );
  }
  return null;
}
