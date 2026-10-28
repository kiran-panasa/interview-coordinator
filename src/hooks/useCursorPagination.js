import { useState, useEffect, useRef, useCallback } from "react";

// Real page-number pagination against a Firestore cursor-paged fetch — not
// an approximation of "Load 10 more" with a page counter bolted on.
// Firestore itself has no offset/skip query, so jumping straight to an
// arbitrary page (without ever having fetched everything before it) isn't
// something any amount of client cleverness can make free — this instead
// remembers the start cursor of every page already visited, so Prev and
// any already-reached page number are instant, and Next walks one page
// further each time. maxReachedPage is the honest boundary: page numbers
// past it are never rendered as clickable (see CursorPagination.jsx),
// rather than offering a button that would silently do nothing.
//
// `fetchPage(cursor)` — cursor is null for page 1, otherwise whatever the
// previous call returned; resolves { items, cursor, done }. `resetKey` —
// pagination restarts at page 1 whenever this changes (e.g. an active
// filter), same idea as a useEffect dependency.
export function useCursorPagination(fetchPage, resetKey, pageSize = 10) {
  const [page, setPage] = useState(1);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(false);
  const [maxReachedPage, setMaxReachedPage] = useState(1);
  const startCursorsRef = useRef({ 1: null });
  const reqIdRef = useRef(0);
  const fetchPageRef = useRef(fetchPage);
  fetchPageRef.current = fetchPage;

  const load = useCallback(async (pageNum) => {
    const cursor = startCursorsRef.current[pageNum];
    if (cursor === undefined) return; // page not reachable yet — Next hasn't walked this far
    const reqId = ++reqIdRef.current;
    setLoading(true);
    setError(null);
    try {
      const res = await fetchPageRef.current(cursor);
      if (reqId !== reqIdRef.current) return; // a newer request/reset superseded this one
      startCursorsRef.current[pageNum + 1] = res.cursor;
      setItems(res.items);
      setDone(res.done);
      setPage(pageNum);
      setMaxReachedPage(p => Math.max(p, pageNum));
    } catch (e) {
      if (reqId !== reqIdRef.current) return;
      setError(e?.message || String(e));
    } finally {
      if (reqId === reqIdRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    startCursorsRef.current = { 1: null };
    setMaxReachedPage(1);
    setDone(false);
    load(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  const goToPage = (n) => {
    if (n < 1 || n > maxReachedPage + 1) return;
    load(n);
  };

  return { items, page, pageSize, loading, error, done, maxReachedPage, goToPage, reload: () => load(page) };
}
