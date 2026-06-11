import { useEffect } from "react";

export default function Toast({ message, type = "success", onDone }) {
  useEffect(() => { const t = setTimeout(onDone, 3000); return () => clearTimeout(t); }, []);
  const bg = type === "error" ? "bg-red-500" : "bg-emerald-500";
  return (
    <div className={`fixed bottom-6 right-6 z-50 ${bg} text-white px-5 py-3 rounded-xl shadow-lg text-sm font-medium animate-bounce-once`}>
      {message}
    </div>
  );
}
