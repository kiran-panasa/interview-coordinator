import { useState, useEffect, useMemo } from "react";
import Pagination from "../../components/Pagination";
import { usePagination } from "../../hooks/usePagination";
import { compareTimeLabels } from "../../utils/dates";


export default function SlotOverviewTab({ templates, activeInterviewers, ivrSlots, slotsLoading, fetchSlots }) {
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate,   setToDate]   = useState("");

  useEffect(() => {
    if (!selectedTemplateId && templates.length > 0)
      setSelectedTemplateId(templates[0].id);
  }, [templates]); // eslint-disable-line

  const templateInterviewers = useMemo(() =>
    selectedTemplateId
      ? activeInterviewers.filter(u => (u.templateIds || []).includes(selectedTemplateId))
      : activeInterviewers,
  [activeInterviewers, selectedTemplateId]);

  const datesSelected = !!(fromDate && toDate);

  // date → [{ ivrId, ivrName, slots[] }]
  const byDate = useMemo(() => {
    if (!datesSelected) return [];
    const map = {};
    for (const ivr of templateInterviewers) {
      const slots = (ivrSlots[ivr.id] || []).filter(s =>
        !s.isBooked && s.date >= fromDate && s.date <= toDate
      );
      for (const slot of slots) {
        if (!map[slot.date]) map[slot.date] = {};
        if (!map[slot.date][ivr.id])
          map[slot.date][ivr.id] = { ivrId: ivr.id, ivrName: ivr.displayName || ivr.email, slots: [] };
        map[slot.date][ivr.id].slots.push(slot);
      }
    }
    return Object.entries(map)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, byIvr]) => ({
        date,
        entries: Object.values(byIvr).sort((a, b) => a.ivrName.localeCompare(b.ivrName)),
      }));
  }, [templateInterviewers, ivrSlots, fromDate, toDate]);

  const totalFreeSlots      = useMemo(() => byDate.reduce((a, d) => a + d.entries.reduce((b, e) => b + e.slots.length, 0), 0), [byDate]);
  const interviewersWithSlots = useMemo(() => { const s = new Set(); byDate.forEach(d => d.entries.forEach(e => s.add(e.ivrId))); return s.size; }, [byDate]);

  const datePagination = usePagination(byDate);
  // Reset to page 1 when filters change
  useEffect(() => { datePagination.setPage(1); }, [selectedTemplateId, fromDate, toDate]); // eslint-disable-line

  // interviewer-level summary: total free slots in range per interviewer
  const ivrSummary = useMemo(() => {
    if (!datesSelected) return [];
    const map = {};
    for (const ivr of templateInterviewers) {
      const count = (ivrSlots[ivr.id] || []).filter(s => !s.isBooked && s.date >= fromDate && s.date <= toDate).length;
      map[ivr.id] = { name: ivr.displayName || ivr.email, count };
    }
    return Object.values(map).sort((a, b) => b.count - a.count);
  }, [templateInterviewers, ivrSlots, fromDate, toDate, datesSelected]);

  return (
    <div className="space-y-6">
      {/* Filters + summary */}
      <div className="bg-white rounded-xl border border-gray-200 px-6 py-5">
        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">Slot Overview</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="md:col-span-2">
            <label className="block text-xs font-semibold text-gray-600 mb-1">Template</label>
            <select value={selectedTemplateId} onChange={e => setSelectedTemplateId(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
              <option value="">All Templates</option>
              {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">From</label>
            <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">To</label>
            <input type="date" value={toDate} min={fromDate} onChange={e => setToDate(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
        </div>

        <div className={`flex flex-wrap items-center gap-8 mt-5 pt-4 border-t border-gray-100 ${!datesSelected ? "opacity-30 pointer-events-none select-none" : ""}`}>
          <div>
            <p className="text-[11px] text-gray-400 uppercase tracking-wide font-semibold">Free Slots</p>
            <p className="text-2xl font-bold text-gray-900 mt-0.5">{totalFreeSlots}</p>
          </div>
          <div>
            <p className="text-[11px] text-gray-400 uppercase tracking-wide font-semibold">Interviewers with Slots</p>
            <p className="text-2xl font-bold text-gray-900 mt-0.5">
              {interviewersWithSlots}
              <span className="text-sm font-normal text-gray-400 ml-1">/ {templateInterviewers.length}</span>
            </p>
          </div>
          <div>
            <p className="text-[11px] text-gray-400 uppercase tracking-wide font-semibold">Dates with Availability</p>
            <p className="text-2xl font-bold text-gray-900 mt-0.5">{byDate.length}</p>
          </div>
          <button onClick={() => fetchSlots(activeInterviewers.map(u => u.id))} disabled={slotsLoading}
            className="ml-auto flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-gray-700 disabled:opacity-50 px-3 py-1.5 rounded-lg border border-gray-200 bg-white transition-colors">
            <svg className={`w-3.5 h-3.5 ${slotsLoading ? "animate-spin" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            {slotsLoading ? "Loading…" : "Refresh Slots"}
          </button>
        </div>
      </div>

      {/* Interviewer summary bar */}
      {templateInterviewers.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 px-6 py-4">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3">Per Interviewer</p>
          <div className="flex flex-wrap gap-2">
            {ivrSummary.map(({ name, count }) => (
              <span key={name}
                className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full border ${
                  count > 0
                    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                    : "bg-gray-50 text-gray-400 border-gray-200"
                }`}>
                {name}
                <span className={`font-bold ${count > 0 ? "text-emerald-600" : "text-gray-300"}`}>{count}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Slots by date */}
      {byDate.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 flex flex-col items-center justify-center py-16 gap-2">
          <svg className="w-8 h-8 text-gray-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          {!datesSelected ? (
            <>
              <p className="text-sm text-gray-400">Select a date range to view available slots.</p>
            </>
          ) : (
            <>
              <p className="text-sm text-gray-400">No free slots in this range.</p>
              <p className="text-xs text-gray-300">Expand the date range or ask interviewers to add slots.</p>
            </>
          )}
        </div>
      ) : (
        <>
        <div className="space-y-3">
          {datePagination.paged.map(({ date, entries }) => {
            const totalOnDate = entries.reduce((a, e) => a + e.slots.length, 0);
            const dateLabel = new Date(date + "T12:00:00").toLocaleDateString("en-GB", {
              weekday: "long", day: "numeric", month: "long", year: "numeric",
            });
            return (
              <div key={date} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-5 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
                  <p className="text-sm font-bold text-gray-800">{dateLabel}</p>
                  <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                    {totalOnDate} slot{totalOnDate !== 1 ? "s" : ""}
                  </span>
                </div>
                <div className="divide-y divide-gray-50">
                  {entries.map(entry => (
                    <div key={entry.ivrId} className="px-5 py-3 flex items-center gap-4">
                      <p className="w-44 flex-shrink-0 text-sm font-semibold text-gray-800 truncate">{entry.ivrName}</p>
                      <div className="flex flex-wrap gap-1.5">
                        {entry.slots
                          .slice().sort((a, b) => compareTimeLabels(a.time, b.time))
                          .map(s => (
                            <span key={s.id} className="text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 px-2.5 py-1 rounded-full">
                              {s.time}
                            </span>
                          ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
        <Pagination
          page={datePagination.page}
          totalPages={datePagination.totalPages}
          total={datePagination.total}
          pageSize={datePagination.pageSize}
          onPageChange={datePagination.setPage}
        />
        </>
      )}
    </div>
  );
}
