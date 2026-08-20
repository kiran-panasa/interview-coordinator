import { useState } from "react";
import { Copy, Check, AlertCircle } from "lucide-react";

// Small, self-contained copy-to-clipboard icon button — renders nothing if
// there's neither a value nor a resolver to get one. Never navigates/opens
// anything, only copies.
//
// `resolve` (optional): async () => string, used when `value` isn't already
// known — e.g. a recording/transcript link that exists on Google's side but
// hasn't been fetched into Firestore yet. Lets the icon show up for every
// row that *might* have a link instead of only rows where it's cached,
// without eagerly calling out for all of them (only fires on click).
export default function CopyButton({ value, resolve, className = "", title = "Copy link" }) {
  const [status, setStatus] = useState("idle"); // idle | loading | copied | error
  if (!value && !resolve) return null;

  const handleCopy = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (status === "loading") return;
    try {
      const toCopy = value || await (async () => { setStatus("loading"); return resolve(); })();
      if (!toCopy) throw new Error("not available");
      await navigator.clipboard.writeText(toCopy);
      setStatus("copied");
      setTimeout(() => setStatus("idle"), 1500);
    } catch {
      setStatus("error");
      setTimeout(() => setStatus("idle"), 1500);
    }
  };

  const Icon = status === "copied" ? Check : status === "error" ? AlertCircle : Copy;

  return (
    <span className="relative inline-flex flex-shrink-0">
      <button
        type="button"
        onClick={handleCopy}
        disabled={status === "loading"}
        title={status === "error" ? "Not available" : title}
        className={`inline-flex items-center justify-center p-1 rounded-md transition-colors flex-shrink-0 disabled:opacity-50 ${
          status === "copied" ? "text-emerald-600" : status === "error" ? "text-red-500" : "text-gray-400 hover:text-emerald-600 hover:bg-emerald-50"
        } ${className}`}
      >
        <Icon className="w-3.5 h-3.5" />
      </button>
      {status === "copied" && (
        <span className="absolute -top-6 left-1/2 -translate-x-1/2 text-[10px] font-semibold text-white bg-gray-800 px-1.5 py-0.5 rounded whitespace-nowrap pointer-events-none z-10">
          Copied!
        </span>
      )}
      {status === "error" && (
        <span className="absolute -top-6 left-1/2 -translate-x-1/2 text-[10px] font-semibold text-white bg-red-600 px-1.5 py-0.5 rounded whitespace-nowrap pointer-events-none z-10">
          Not available
        </span>
      )}
    </span>
  );
}
