import Modal from "../../components/Modal";
import { formatDate } from "../../utils/dates";

const inputCls = "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500";
const labelCls = "block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1";

export default function ScheduleInterviewModal({
  open, onClose,
  editTarget, form, setField, handleSave, saving,
  candidates, interviewers, templates,
  availDates, availTimes,
  DEFAULT_ROUNDS, DURATIONS,
}) {
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
                <input type="date" value={form.scheduledDate} onChange={e => setField("scheduledDate", e.target.value)} className={inputCls} />
                {form.interviewerId && availDates.length === 0 &&
                  <p className="text-xs text-amber-600 mt-1">⚠ No availability set</p>
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
          <select value={form.round} onChange={e => setField("round", e.target.value)} className={inputCls}>
            <option value="">— Select round —</option>
            {DEFAULT_ROUNDS.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
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
          <button onClick={handleSave} disabled={saving}
            className="flex-1 bg-indigo-600 text-white rounded-lg py-2 text-sm font-semibold hover:bg-indigo-700 disabled:opacity-60">
            {saving ? "Saving…" : editTarget ? "Update Interview" : "Schedule Interview"}
          </button>
          <button onClick={onClose}
            className="px-5 bg-gray-100 text-gray-700 rounded-lg py-2 text-sm font-semibold hover:bg-gray-200">
            Cancel
          </button>
        </div>
      </div>
    </Modal>
  );
}
