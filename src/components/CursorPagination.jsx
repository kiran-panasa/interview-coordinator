import { memo } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

// The companion to useCursorPagination — looks like Pagination.jsx (same
// Prev/Next + page-number pill styling) but deliberately only renders
// clickable numbers up to maxReachedPage (the furthest page actually
// fetched so far), since a Firestore cursor can't jump past that without
// reading everything in between. Next is the only way to go further; once
// clicked, that page becomes reachable by number from then on.
function CursorPagination({ page, maxReachedPage, done, total, pageSize, loading, onPageChange }) {
  if (maxReachedPage <= 1 && done) return null; // everything fits on one page

  const start = (page - 1) * pageSize + 1;
  const end   = start + pageSize - 1; // approximate for the last page when `total` isn't known exactly

  const pages = [];
  for (let i = 1; i <= maxReachedPage; i++) pages.push(i);

  return (
    <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
      <p className="text-xs text-gray-400">
        Showing <span className="font-semibold text-gray-600">{start}–{total != null ? Math.min(end, total) : end}</span>
        {total != null && <> of <span className="font-semibold text-gray-600">{total}</span></>}
      </p>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page === 1 || loading}
          className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded-full disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
        >
          <ChevronLeft className="w-3.5 h-3.5" /> Prev
        </button>
        {pages.map(p => (
          <button
            key={p}
            onClick={() => onPageChange(p)}
            disabled={loading}
            className={`w-7 h-7 text-xs font-semibold rounded-full transition-colors disabled:opacity-50 ${
              p === page
                ? "bg-brand-600 text-white shadow-soft"
                : "text-gray-500 hover:bg-gray-100 hover:text-gray-800"
            }`}
          >
            {p}
          </button>
        ))}
        <button
          onClick={() => onPageChange(page + 1)}
          disabled={(page === maxReachedPage && done) || loading}
          className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded-full disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
        >
          Next <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

export default memo(CursorPagination);
