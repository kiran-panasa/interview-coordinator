import { useState } from "react";
import { Copy, Check } from "lucide-react";

// Small, self-contained copy-to-clipboard icon button — renders nothing if
// there's no value to copy. Never navigates/opens anything, only copies.
export default function CopyButton({ value, className = "" }) {
  const [copied, setCopied] = useState(false);
  if (!value) return null;

  const handleCopy = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API unavailable/denied (e.g. insecure context) — nothing
      // sensible to fall back to, so just silently no-op.
    }
  };

  return (
    <span className="relative inline-flex flex-shrink-0">
      <button
        type="button"
        onClick={handleCopy}
        title="Copy link"
        className={`inline-flex items-center justify-center p-1 rounded-md text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 transition-colors flex-shrink-0 ${className}`}
      >
        {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
      </button>
      {copied && (
        <span className="absolute -top-6 left-1/2 -translate-x-1/2 text-[10px] font-semibold text-white bg-gray-800 px-1.5 py-0.5 rounded whitespace-nowrap pointer-events-none z-10">
          Copied!
        </span>
      )}
    </span>
  );
}
