import { useState, useEffect } from "react";
import { useAuth } from "../../AuthContext";
import { getCandidates, createCandidate, updateCandidate, deleteCandidate } from "../../api/firestore";
import Modal from "../../components/Modal";
import Toast from "../../components/Toast";

const EMPTY = { name: "", uid: "", email: "", phone: "", resumeLink: "", notes: "" };

export default function CandidatesPage() {
  const { currentUser } = useAuth();
  const [candidates, setCandidates] = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [search,     setSearch]     = useState("");
  const [showModal,  setShowModal]  = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [form,       setForm]       = useState(EMPTY);
  const [saving,     setSaving]     = useState(false);
  const [toast,      setToast]      = useState(null);

  const load = () => getCandidates().then(c => { setCandidates(c); setLoading(false); });
  useEffect(() => { load(); }, []);

  const openNew  = () => { setEditTarget(null); setForm(EMPTY); setShowModal(true); };
  const openEdit = (c) => {
    setEditTarget(c);
    setForm({ name: c.name, uid: c.uid || "", email: c.email || "", phone: c.phone || "", resumeLink: c.resumeLink || "", notes: c.notes || "" });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.name.trim())
      return setToast({ message: "Name is required.", type: "error" });
    setSaving(true);
    try {
      if (editTarget) {
        await updateCandidate(editTarget.id, form);
        setToast({ message: "Candidate updated." });
      } else {
        await createCandidate({ ...form, createdBy: currentUser.uid });
        setToast({ message: "Candidate added." });
      }
      setShowModal(false); load();
    } catch (e) { setToast({ message: e.message, type: "error" }); }
    setSaving(false);
  };

  const handleDelete = async (c) => {
    if (!confirm(`Delete ${c.name}? This cannot be undone.`)) return;
    await deleteCandidate(c.id);
    setToast({ message: "Candidate deleted." });
    load();
  };

  const filtered = candidates.filter(c =>
    c.name?.toLowerCase().includes(search.toLowerCase()) ||
    c.uid?.toLowerCase().includes(search.toLowerCase()) ||
    c.email?.toLowerCase().includes(search.toLowerCase())
  );

  const inputCls = "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500";
  const labelCls = "block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1";
  const setField = (k, v) => setForm(f => ({ ...f, [k]: v }));

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Candidates</h1>
          <p className="text-sm text-gray-500 mt-0.5">{candidates.length} candidates</p>
        </div>
        <button onClick={openNew}
          className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-indigo-700">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Candidate
        </button>
      </div>

      <input type="text" placeholder="Search by name, UID, or email…" value={search}
        onChange={e => setSearch(e.target.value)}
        className="w-full max-w-sm border border-gray-300 rounded-lg px-3 py-2 text-sm mb-5 focus:outline-none focus:ring-2 focus:ring-indigo-500" />

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          <p className="text-center text-gray-400 py-12 text-sm">Loading…</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                {["Name", "UID", "Email", "Resume", "Actions"].map(h => (
                  <th key={h} className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide px-4 py-3">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.length === 0 ? (
                <tr><td colSpan={5} className="text-center text-gray-400 py-12">No candidates found</td></tr>
              ) : filtered.map(c => (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <p className="font-semibold text-gray-900">{c.name}</p>
                    {c.phone && <p className="text-xs text-gray-400">{c.phone}</p>}
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-mono text-xs text-gray-700 bg-gray-100 px-2 py-0.5 rounded">{c.uid || "—"}</span>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{c.email || "—"}</td>
                  <td className="px-4 py-3">
                    {c.resumeLink
                      ? <a href={c.resumeLink} target="_blank" rel="noreferrer" className="text-indigo-600 text-xs hover:underline">View ↗</a>
                      : <span className="text-gray-400 text-xs">—</span>
                    }
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-3">
                      <button onClick={() => openEdit(c)} className="text-xs text-indigo-600 font-medium hover:underline">Edit</button>
                      <button onClick={() => handleDelete(c)} className="text-xs text-red-500 font-medium hover:underline">Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Modal open={showModal} onClose={() => setShowModal(false)} title={editTarget ? "Edit Candidate" : "Add Candidate"}>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Full Name *</label>
              <input value={form.name} onChange={e => setField("name", e.target.value)} placeholder="John Doe" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>UID</label>
              <input value={form.uid} onChange={e => setField("uid", e.target.value)} placeholder="e.g. STU-2024-001" className={inputCls} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Email</label>
              <input type="email" value={form.email} onChange={e => setField("email", e.target.value)} placeholder="john@example.com" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Phone</label>
              <input value={form.phone} onChange={e => setField("phone", e.target.value)} placeholder="+91 98765 43210" className={inputCls} />
            </div>
          </div>
          <div>
            <label className={labelCls}>Resume Link</label>
            <input type="url" value={form.resumeLink} onChange={e => setField("resumeLink", e.target.value)} placeholder="https://drive.google.com/…" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Notes</label>
            <textarea rows={2} value={form.notes} onChange={e => setField("notes", e.target.value)}
              placeholder="Any notes…" className={`${inputCls} resize-none`} />
          </div>
          <div className="flex gap-3 pt-1">
            <button onClick={handleSave} disabled={saving}
              className="flex-1 bg-indigo-600 text-white rounded-lg py-2 text-sm font-semibold hover:bg-indigo-700 disabled:opacity-60">
              {saving ? "Saving…" : editTarget ? "Update" : "Add Candidate"}
            </button>
            <button onClick={() => setShowModal(false)}
              className="px-5 bg-gray-100 text-gray-700 rounded-lg py-2 text-sm font-semibold hover:bg-gray-200">Cancel</button>
          </div>
        </div>
      </Modal>

      {toast && <Toast message={toast.message} type={toast.type} onDone={() => setToast(null)} />}
    </div>
  );
}
