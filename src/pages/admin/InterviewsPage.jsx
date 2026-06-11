import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../../AuthContext";
import {
  subscribeToInterviews, getCandidates, getAllUsers,
  createInterview, updateInterview,
  getInterviewerAvailability, markSlotBooked, markSlotFree,
  getTemplates, DEFAULT_ROUNDS,
} from "../../api/firestore";
import Modal from "../../components/Modal";
import Badge from "../../components/Badge";
import Toast from "../../components/Toast";

const STATUSES = ["All", "pending_acceptance", "scheduled", "completed", "cancelled", "declined", "no_show"];
const EMPTY_FORM = {
  candidateId: "", interviewerId: "", scheduledDate: "", scheduledTime: "",
  meetLink: "", round: "", notes: "", templateId: "",
};

function fmt(dateStr) {
  if (!dateStr) return "—";
  const [y, m, d] = dateStr.split("-");
  return `${d}/${m}/${y}`;
}

export default function InterviewsPage() {
  const { currentUser, userProfile } = useAuth();
  const [interviews,  setInterviews]  = useState([]);
  const [candidates,  setCandidates]  = useState([]);
  const [interviewers, setInterviewers] = useState([]);
  const [templates,   setTemplates]   = useState([]);
  const [filterStatus, setFilterStatus] = useState("All");
  const [filterDate,   setFilterDate]   = useState("");
  const [filterIvr,    setFilterIvr]    = useState("All");
  const [showModal,    setShowModal]    = useState(false);
  const [editTarget,   setEditTarget]   = useState(null);
  const [form,         setForm]         = useState(EMPTY_FORM);
  const [slots,        setSlots]        = useState([]);
  const [availDates,   setAvailDates]   = useState([]);
  const [availTimes,   setAvailTimes]   = useState([]);
  const [saving,       setSaving]       = useState(false);
  const [toast,        setToast]        = useState(null);

  useEffect(() => {
    const unsub = subscribeToInterviews(setInterviews);
    getCandidates().then(setCandidates);
    getAllUsers().then(users => setInterviewers(users.filter(u => u.role === "interviewer" && u.status === "active")));
    getTemplates().then(setTemplates);
    return unsub;
  }, []);


  // Load availability when interviewer changes
  useEffect(() => {
    if (!form.interviewerId) { setSlots([]); setAvailDates([]); setAvailTimes([]); return; }
    getInterviewerAvailability(form.interviewerId).then(s => {
      const free = s.filter(x => !x.isBooked);
      setSlots(s);
      setAvailDates([...new Set(free.map(x => x.date))].sort());
      setAvailTimes([]);
    });
  }, [form.interviewerId]);

  // Update available times when date changes
  useEffect(() => {
    if (!form.scheduledDate || !form.interviewerId) { setAvailTimes([]); return; }
    const free = slots.filter(s => s.date === form.scheduledDate && !s.isBooked);
    setAvailTimes(free.map(s => s.time).sort());
    setForm(f => ({ ...f, scheduledTime: "" }));
  }, [form.scheduledDate]);

  const openNew  = () => { setEditTarget(null); setForm(EMPTY_FORM); setShowModal(true); };
  const openEdit = (iv) => {
    setEditTarget(iv);
    setForm({
      candidateId: iv.candidateId, interviewerId: iv.interviewerId,
      scheduledDate: iv.scheduledDate, scheduledTime: iv.scheduledTime,
      meetLink: iv.meetLink || "", round: iv.round || "", notes: iv.notes || "",
      templateId: iv.templateId || "",
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.candidateId || !form.interviewerId || !form.scheduledDate || !form.scheduledTime || !form.round)
      return setToast({ message: "Fill in all required fields.", type: "error" });
    setSaving(true);
    try {
      const candidate   = candidates.find(c => c.id === form.candidateId);
      const interviewer = interviewers.find(u => u.id === form.interviewerId);
      const template    = templates.find(t => t.id === form.templateId);
      const data = {
        ...form,
        candidateName:  candidate?.name  || "",
        candidateEmail: candidate?.email || "",
        roleAppliedFor: candidate?.roleAppliedFor || "",
        resumeLink:     candidate?.resumeLink || "",
        interviewerEmail: interviewer?.email || "",
        interviewerName:  interviewer?.displayName || interviewer?.email || "",
        // snapshot questions from template question banks
        codingProblems: (template?.questions?.coding  || []).slice(0, template?.codingProblems || 2),
        theorySubject:  (template?.questions?.theory  || []).join(", "),
        templateName:   template?.name || "",
      };

      if (editTarget) {
        // free old slot if date/time/interviewer changed
        if (editTarget.scheduledDate !== form.scheduledDate ||
            editTarget.scheduledTime !== form.scheduledTime ||
            editTarget.interviewerId !== form.interviewerId) {
          const oldSlotId = `${editTarget.scheduledDate}_${editTarget.scheduledTime.replace(/[: ]/g, "")}`;
          await markSlotFree(editTarget.interviewerId, oldSlotId).catch(() => {});
          const newSlotId = `${form.scheduledDate}_${form.scheduledTime.replace(/[: ]/g, "")}`;
          await markSlotBooked(form.interviewerId, newSlotId, editTarget.id).catch(() => {});
        }
        await updateInterview(editTarget.id, data);
        setToast({ message: "Interview updated." });
      } else {
        const id = await createInterview({ ...data, createdBy: currentUser.uid });
        const slotId = `${form.scheduledDate}_${form.scheduledTime.replace(/[: ]/g, "")}`;
        await markSlotBooked(form.interviewerId, slotId, id).catch(() => {});
        setToast({ message: "Interview scheduled." });
      }
      setShowModal(false);
    } catch (e) { setToast({ message: e.message, type: "error" }); }
    setSaving(false);
  };

  const handleCancel = async (iv) => {
    if (!confirm(`Cancel interview with ${iv.candidateName}?`)) return;
    await updateInterview(iv.id, { status: "cancelled" });
    const slotId = `${iv.scheduledDate}_${iv.scheduledTime.replace(/[: ]/g, "")}`;
    await markSlotFree(iv.interviewerId, slotId).catch(() => {});
    setToast({ message: "Interview cancelled." });
  };

  const setField = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const filtered = interviews.filter(i => {
    if (filterStatus !== "All" && i.status !== filterStatus) return false;
    if (filterDate && i.scheduledDate !== filterDate) return false;
    if (filterIvr  !== "All" && i.interviewerEmail !== filterIvr) return false;
    return true;
  });

  const uniqueDates = [...new Set(interviews.map(i => i.scheduledDate))].filter(Boolean).sort();
  const uniqueIvrs  = [...new Set(interviews.map(i => i.interviewerEmail))].filter(Boolean).sort();

  const inputCls = "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500";
  const labelCls = "block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1";

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Interviews</h1>
          <p className="text-sm text-gray-500 mt-0.5">{interviews.length} total interviews</p>
        </div>
        <button onClick={openNew}
          className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-indigo-700">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Schedule Interview
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-5 flex-wrap">
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
          {STATUSES.map(s => <option key={s} value={s}>{s === "All" ? "All Statuses" : s.replace(/_/g," ")}</option>)}
        </select>
        <input type="date" value={filterDate} onChange={e => setFilterDate(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        <select value={filterIvr} onChange={e => setFilterIvr(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
          <option value="All">All Interviewers</option>
          {uniqueIvrs.map(e => <option key={e} value={e}>{e}</option>)}
        </select>
        {(filterStatus !== "All" || filterDate || filterIvr !== "All") && (
          <button onClick={() => { setFilterStatus("All"); setFilterDate(""); setFilterIvr("All"); }}
            className="text-sm text-gray-500 hover:text-gray-800 px-2">Clear</button>
        )}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100">
              {["Candidate", "Interviewer", "Round", "Date", "Time", "Status", "Actions"].map(h => (
                <th key={h} className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide px-4 py-3">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {filtered.length === 0 ? (
              <tr><td colSpan={7} className="text-center text-gray-400 py-12">No interviews found</td></tr>
            ) : filtered.map(i => (
              <tr key={i.id} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <p className="font-semibold text-gray-900">{i.candidateName}</p>
                  <p className="text-xs text-gray-400">{i.roleAppliedFor}</p>
                </td>
                <td className="px-4 py-3 text-gray-700">{i.interviewerName || i.interviewerEmail}</td>
                <td className="px-4 py-3 text-gray-600">{i.round}</td>
                <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{fmt(i.scheduledDate)}</td>
                <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{i.scheduledTime}</td>
                <td className="px-4 py-3"><Badge value={i.status} /></td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    <button onClick={() => openEdit(i)}
                      className="text-xs text-indigo-600 font-medium hover:underline">Edit</button>
                    {i.status !== "cancelled" && i.status !== "completed" && (
                      <button onClick={() => handleCancel(i)}
                        className="text-xs text-red-500 font-medium hover:underline">Cancel</button>
                    )}
                    {i.status === "completed" && i.feedback && (
                      <span className="text-xs text-emerald-600 font-medium">✓ Feedback</span>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Schedule / Edit Modal */}
      <Modal open={showModal} onClose={() => setShowModal(false)}
        title={editTarget ? "Edit Interview" : "Schedule Interview"} wide>
        <div className="space-y-4">
          {/* Candidate */}
          <div>
            <label className={labelCls}>Candidate *</label>
            <select value={form.candidateId} onChange={e => setField("candidateId", e.target.value)} className={inputCls}>
              <option value="">— Select candidate —</option>
              {candidates.map(c => <option key={c.id} value={c.id}>{c.name} · {c.roleAppliedFor}</option>)}
            </select>
          </div>

          {/* Interviewer */}
          <div>
            <label className={labelCls}>Interviewer *</label>
            <select value={form.interviewerId} onChange={e => setField("interviewerId", e.target.value)} className={inputCls}>
              <option value="">— Select interviewer —</option>
              {interviewers.map(u => <option key={u.id} value={u.id}>{u.displayName || u.email}</option>)}
            </select>
          </div>

          {/* Date */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Date *</label>
              {availDates.length > 0 ? (
                <select value={form.scheduledDate} onChange={e => setField("scheduledDate", e.target.value)} className={inputCls}>
                  <option value="">— Select date —</option>
                  {availDates.map(d => <option key={d} value={d}>{fmt(d)}</option>)}
                </select>
              ) : (
                <div>
                  <input type="date" value={form.scheduledDate} onChange={e => setField("scheduledDate", e.target.value)} className={inputCls} />
                  {form.interviewerId && availDates.length === 0 &&
                    <p className="text-xs text-amber-600 mt-1">⚠ Interviewer has no availability set — scheduling anyway.</p>
                  }
                </div>
              )}
            </div>
            <div>
              <label className={labelCls}>Time *</label>
              {availTimes.length > 0 ? (
                <select value={form.scheduledTime} onChange={e => setField("scheduledTime", e.target.value)} className={inputCls}>
                  <option value="">— Select time —</option>
                  {availTimes.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              ) : (
                <input type="time" value={form.scheduledTime} onChange={e => setField("scheduledTime", e.target.value)} className={inputCls} />
              )}
            </div>
          </div>

          {/* Round */}
          <div>
            <label className={labelCls}>Round *</label>
            <select value={form.round} onChange={e => setField("round", e.target.value)} className={inputCls}>
              <option value="">— Select round —</option>
              {DEFAULT_ROUNDS.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>

          {/* Meet link */}
          <div>
            <label className={labelCls}>Meet Link</label>
            <input type="url" placeholder="https://meet.google.com/…" value={form.meetLink}
              onChange={e => setField("meetLink", e.target.value)} className={inputCls} />
          </div>

          {/* Notes */}
          <div>
            <label className={labelCls}>Notes (admin only)</label>
            <textarea rows={2} placeholder="Any notes for this interview…" value={form.notes}
              onChange={e => setField("notes", e.target.value)}
              className={`${inputCls} resize-none`} />
          </div>

          {/* Template */}
          <div className="border-t border-gray-100 pt-4">
            <label className={labelCls}>Evaluation Template</label>
            <select value={form.templateId} onChange={e => setField("templateId", e.target.value)} className={inputCls}>
              <option value="">— No template (generic feedback) —</option>
              {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>

          {/* Template question bank summary (read-only) */}
          {form.templateId && (() => {
            const tmpl = templates.find(t => t.id === form.templateId);
            if (!tmpl) return null;
            const q = tmpl.questions || {};
            const sections = [
              { label: "Coding",  items: (q.coding  || []).slice(0, tmpl.codingProblems), show: true },
              { label: "Theory",  items: q.theory  || [],                                 show: tmpl.hasTheory },
              { label: "Project", items: q.project || [],                                 show: tmpl.hasProject },
              { label: "Resume",  items: q.resume  || [],                                 show: tmpl.hasResume },
            ].filter(s => s.show);
            const hasAny = sections.some(s => s.items.length > 0);
            return (
              <div className="bg-gray-50 rounded-xl border border-gray-200 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Questions from template</p>
                  {!hasAny && <span className="text-xs text-amber-600 font-medium">⚠ No questions in this template yet</span>}
                </div>
                {sections.map(({ label, items }) => (
                  <div key={label}>
                    <p className="text-xs font-semibold text-gray-400 mb-1">{label}</p>
                    {items.length > 0 ? items.map((q, i) => (
                      <p key={i} className="text-xs text-gray-700 truncate pl-2 py-0.5">· {q}</p>
                    )) : (
                      <p className="text-xs text-gray-400 italic pl-2">Not set</p>
                    )}
                  </div>
                ))}
              </div>
            );
          })()}

          <div className="flex gap-3 pt-2">
            <button onClick={handleSave} disabled={saving}
              className="flex-1 bg-indigo-600 text-white rounded-lg py-2 text-sm font-semibold hover:bg-indigo-700 disabled:opacity-60">
              {saving ? "Saving…" : editTarget ? "Update Interview" : "Schedule Interview"}
            </button>
            <button onClick={() => setShowModal(false)}
              className="px-5 bg-gray-100 text-gray-700 rounded-lg py-2 text-sm font-semibold hover:bg-gray-200">
              Cancel
            </button>
          </div>
        </div>
      </Modal>

      {toast && <Toast message={toast.message} type={toast.type} onDone={() => setToast(null)} />}
    </div>
  );
}
