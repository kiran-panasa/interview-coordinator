import { useState, useEffect } from "react";
import { CalendarDays, AlertTriangle } from "lucide-react";
import Modal from "../../components/Modal";
import Button from "../../components/Button";
import DatePicker from "../../components/DatePicker";
import SearchableSelect from "../../components/SearchableSelect";

const OTHER_VALUE = "__other__";

const inputCls = "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-colors";
const labelCls = "block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1";

export default function ScheduleInterviewModal({
  open, onClose,
  editTarget, form, setField, handleSave, saving,
  candidates, interviewers, templates,
  availDates, availTimes,
  rounds = [], DURATIONS,
  blockedDates = [],
  reassignMode = false,
}) {
  const roundNames = rounds.map(r => r.name);
  const [customRound, setCustomRound] = useState(() => !!form.round && !roundNames.includes(form.round));
  const todayStr = new Date().toISOString().slice(0, 10);

  // Re-derive whenever the modal is (re)opened, e.g. for a different edit target
  useEffect(() => {
    if (open) setCustomRound(!!form.round && !roundNames.includes(form.round));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editTarget]);

  return (
    <Modal open={open} onClose={onClose}
      title={editTarget ? "Edit Interview" : reassignMode ? "Reassign Interviewer" : "Schedule Interview"} wide>
      <div className="space-y-4">
        <div>
          <label className={labelCls}>Candidate *</label>
          <SearchableSelect
            options={candidates.map(c => ({ id: c.id, label: `${c.name}${c.uid ? ` · ${c.uid}` : ""}` }))}
            value={form.candidateId}
            onChange={id => setField("candidateId", id)}
            placeholder="— Select candidate —"
            searchPlaceholder="Search by name or UID…"
          />
        </div>

        <div>
          <label className={labelCls}>Interviewer *</label>
          <SearchableSelect
            options={interviewers.map(u => ({ id: u.id, label: u.displayName || u.email }))}
            value={form.interviewerId}
            onChange={id => setField("interviewerId", id)}
            placeholder="— Select interviewer —"
            searchPlaceholder="Search by name…"
          />
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className={labelCls}>Date *</label>
            <DatePicker min={todayStr} value={form.scheduledDate} onChange={e => setField("scheduledDate", e.target.value)}
              blockedDates={blockedDates} disableBlocked className={inputCls} />
            {form.interviewerId && availDates.length === 0 &&
              <p className="flex items-center gap-1 text-xs text-amber-600 mt-1">
                <AlertTriangle className="w-3 h-3 flex-shrink-0" /> No availability submitted — pick any date, it'll still be scheduled and reserved for this interview
              </p>
            }
          </div>
          <div>
            <label className={labelCls}>Start Time *</label>
            <input type="time" value={form.scheduledTime} onChange={e => setField("scheduledTime", e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Duration *</label>
            <select value={form.duration} onChange={e => setField("duration", e.target.value ? Number(e.target.value) : "")} className={inputCls}>
              <option value="">— Select duration —</option>
              {DURATIONS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
            </select>
          </div>
        </div>

        {/* Pure convenience — click to fill in the field, never a restriction.
           Date/Start Time above always accept any value; this just surfaces
           what the interviewer already told you they're free for. */}
        {form.interviewerId && form.scheduledDate && availTimes.length > 0 && (
          <div className="-mt-2">
            <p className="text-[11px] text-gray-400 mb-1">Interviewer submitted availability at:</p>
            <div className="flex flex-wrap gap-1.5">
              {availTimes.map(t => (
                <button key={t} type="button" onClick={() => setField("scheduledTime", t)}
                  className={`text-xs font-semibold px-2.5 py-1 rounded-full border transition-colors ${
                    form.scheduledTime === t
                      ? "bg-brand-600 text-white border-brand-600"
                      : "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100"
                  }`}>
                  {t}
                </button>
              ))}
            </div>
          </div>
        )}

        <div>
          <div className="flex items-center justify-between mb-1">
            <label className={labelCls}>Round *</label>
            <a href="/admin/settings?section=General" target="_blank" rel="noreferrer"
              className="text-[11px] font-semibold text-brand-600 hover:underline">
              Manage rounds
            </a>
          </div>
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
            {roundNames.map(r => <option key={r} value={r}>{r}</option>)}
            <option value={OTHER_VALUE}>Other…</option>
          </select>
          {customRound && (
            <input
              type="text"
              value={form.round}
              onChange={e => setField("round", e.target.value)}
              placeholder="Enter custom round name — e.g. Managerial Round, Technical Discussion… (saved for next time)"
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
