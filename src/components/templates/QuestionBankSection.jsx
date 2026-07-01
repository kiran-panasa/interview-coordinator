import { useRef } from "react";
import { parseCSV } from "../../utils/templateCSV";

export default function QuestionBankSection({ bankKey, label, placeholder, note, value, onChange }) {
  const fileRef = useRef(null);
  const count = value.split("\n").filter(l => l.trim()).length;

  const handleCSV = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const incoming = parseCSV(ev.target.result);
      const existing = value.split("\n").map(q => q.trim()).filter(Boolean);
      onChange([...new Set([...existing, ...incoming])].join("\n"));
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  return (
    <div className="rounded-xl border border-gray-200 overflow-hidden bg-white">
      <div className="flex items-center justify-between bg-gray-50 px-4 py-2.5 border-b border-gray-200">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-gray-600 uppercase tracking-wide">{label}</span>
          {count > 0 && (
            <span className="text-xs text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full font-medium">{count}</span>
          )}
        </div>
        <div>
          <input ref={fileRef} type="file" accept=".csv,.txt" className="hidden" onChange={handleCSV} />
          <button type="button" onClick={() => fileRef.current?.click()}
            className="flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-800">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            Upload CSV
          </button>
        </div>
      </div>
      {note && <p className="px-4 pt-2 text-xs text-indigo-600">{note}</p>}
      <textarea rows={4} value={value} onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-4 py-3 text-sm text-gray-700 placeholder-gray-400 resize-none focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-400"
      />
    </div>
  );
}
