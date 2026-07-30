import { useState, useEffect } from "react";
import { CalendarDays, AlertTriangle } from "lucide-react";
import Modal from "../../components/Modal";
import Button from "../../components/Button";
import DatePicker from "../../components/DatePicker";
import { formatDate } from "../../utils/dates";

const OTHER_VALUE = "__other__";

const inputCls = "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-colors";
const labelCls = "block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1";

export default function ScheduleInterviewModal({
  open, onClose,
  editTarget, form, setField, handleSave, saving,
  candidates, interviewers, templates,
  availDates, availTimes,
  DEFAULT_ROUNDS, DURATIONS,
  blockedDates = [],
}) {
  const [customRound, setCustomRound] = useState(() => !!form.round && !DEFAULT_ROUNDS.includes(form.round));
  const todayStr = new Date().toISOString().slice(0, 10);

  // Re-derive whenever the modal is (re)opened, e.g. for a different edit target
  useEffect(() => {
    if (open) setCustomRound(!!form.round && !DEFAULT_ROUNDS.includes(form.round));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editTarget]);

  return (
    <Modal open={open} onClose={onClose}
      title={editTarget ? "Edit Interview" : "Schedule Interview"} wide>
      <div className="space-y-4">
        <div>
          <label className={labelCls}>Candidate *</label>
          <select value={form.candidateId} onChange={e => setField("candidateId", e.target.value)} className={inputCls}>
            <option value="">— Select candidate —</option>
            {candidates.map(c => <option key={c.id} value={c.id}>{c.name}{c.uid ? ` · ${c.uid}` : ""}</option>)}
          </select>
        </div>

        <div>
          <label className={labelCls}>Interviewer *</label>
          <select value={form.interviewerId} onChange={e => setField("interviewerId", e.target.value)} className={inputCls}>
            <option value="">— Select interviewer —</option>
            {interviewers.map(u => <option key={u.id} value={u.id}>{u.displayName || u.email}</option>)}
          </select>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className={labelCls}>Date *</label>
            {availDates.length > 0 ? (
              <select value={form.scheduledDate} onChange={e => setField("scheduledDate", e.target.value)} className={inputCls}>
                <option value="">— Select date —</option>
                {availDates.map(d => <option key={d} value={d}>{formatDate(d)}</option>)}
              </select>
            ) : (
              <div>
                <DatePicker min={todayStr} value={form.scheduledDate} onChange={e => setField("scheduledDate", e.target.value)}
                  blockedDates={blockedDates} disableBlocked className={inputCls} />
                {form.interviewerId && availDates.length === 0 &&
                  <p className="flex items-center gap-1 text-xs text-amber-600 mt-1">
                    <AlertTriangle className="w-3 h-3 flex-shrink-0" /> No availability set
                  </p>
                }
              </div>
            )}
          </div>
          <div>
            <label className={labelCls}>Start Time *</label>
            {availTimes.length > 0 ? (
              <select value={form.scheduledTime} onChange={e => setField("scheduledTime", e.target.value)} className={inputCls}>
                <option value="">— Select time —</option>
                {availTimes.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            ) : (
              <input type="time" value={form.scheduledTime} onChange={e => setField("scheduledTime", e.target.value)} className={inputCls} />
            )}
          </div>
          <div>
            <label className={labelCls}>Duration *</label>
            <select value={form.duration} onChange={e => setField("duration", Number(e.target.value))} className={inputCls}>
              {DURATIONS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
            </select>
          </div>
        </div>

        <div>
          <label className={labelCls}>Round *</label>
          <select
            value={customRound ? OTHER_VALUE : form.round}
            onChange={e => {
              const v = e.target.value;
              if (v === OTHER_VALUE) {
                setCustomRound(true);
                setField("round", "");
              } else {
                setCustomRound(false);
                setField("round", v);
              }
            }}
            className={inputCls}>
            <option value="">— Select round —</option>
            {DEFAULT_ROUNDS.map(r => <option key={r} value={r}>{r}</option>)}
            <option value={OTHER_VALUE}>Other…</option>
          </select>
          {customRound && (
            <input
              type="text"
              value={form.round}
              onChange={e => setField("round", e.target.value)}
              placeholder="Enter custom round name — e.g. Managerial Round, Technical Discussion…"
              autoFocus
              className={`${inputCls} mt-2`}
            />
          )}
        </div>

        <div>
          <label className={labelCls}>Notes (admin only)</label>
          <textarea rows={2} placeholder="Any notes for this interview…" value={form.notes}
            onChange={e => setField("notes", e.target.value)}
            className={`${inputCls} resize-none`} />
        </div>

        <div className="border-t border-gray-100 pt-4">
          <label className={labelCls}>Evaluation Template</label>
          <select value={form.templateId} onChange={e => setField("templateId", e.target.value)} className={inputCls}>
            <option value="">— No template (generic feedback) —</option>
            {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>

        <div className="flex gap-3 pt-2">
          <Button variant="primary" size="lg" icon={CalendarDays} onClick={handleSave} disabled={saving} className="flex-1">
            {saving ? "Saving…" : editTarget ? "Update Interview" : "Schedule Interview"}
          </Button>
          <Button variant="secondary" size="lg" onClick={onClose} className="px-5">
            Cancel
          </Button>
        </div>
      </div>
    </Modal>
  );
}
