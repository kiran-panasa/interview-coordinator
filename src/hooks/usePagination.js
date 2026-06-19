import { useState, useMemo } from "react";

export function usePagination(items, pageSize = 10) {
  const [page, setPage] = useState(1);

  // Reset to page 1 whenever the item list changes (e.g. after a filter)
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const safePage   = Math.min(page, totalPages);

  const paged = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return items.slice(start, start + pageSize);
  }, [items, safePage, pageSize]);

  // Expose a setPage that also resets when dependencies change
  return { paged, page: safePage, setPage, totalPages, total: items.length, pageSize };
}
