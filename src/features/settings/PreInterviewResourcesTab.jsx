import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { FileText, Plus, Trash2, Video, Link2 } from "lucide-react";
import { subscribeToPreInterviewResources, updatePreInterviewResources } from "../../api/firestore";
import { useAuth } from "../../AuthContext";
import Button from "../../components/Button";

function SectionTitle({ icon: Icon, label }) {
  return (
    <h2 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-2">
      <Icon className="w-4 h-4 text-gray-400" />
      {label}
    </h2>
  );
}

const DOC_TYPES = [
  { value: "instruction", label: "Interview Instructions" },
  { value: "reference",   label: "Reference Document" },
];

export default function PreInterviewResourcesTab() {
  const { currentUser } = useAuth();
  const [settings, setSettings] = useState(null);
  const [form,     setForm]     = useState(null);
  const [saving,   setSaving]   = useState(false);
  const [saved,    setSaved]    = useState(false);

  useEffect(() => subscribeToPreInterviewResources(s => {
    setSettings(s);
    setForm(f => f || s);
  }), []);

  const dirty = form && settings && JSON.stringify(form) !== JSON.stringify(settings);

  const handleSave = async () => {
    setSaving(true);
    try {
      await updatePreInterviewResources(form, currentUser.uid);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  const addDocument = () => {
    setForm(f => ({
      ...f,
      documents: [...(f.documents || []), { id: crypto.randomUUID(), label: "", url: "", type: "instruction" }],
    }));
  };
  const updateDocument = (id, changes) => {
    setForm(f => ({
      ...f,
      documents: (f.documents || []).map(d => d.id === id ? { ...d, ...changes } : d),
    }));
  };
  const removeDocument = (id) => {
    setForm(f => ({ ...f, documents: (f.documents || []).filter(d => d.id !== id) }));
  };

  if (!form) {
    return <p className="text-xs text-gray-400">Loading…</p>;
  }

  return (
    <div>
      <motion.div
        initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}
        className="mb-6"
      >
        <SectionTitle icon={FileText} label="Pre-Interview Resources" />
        <p className="text-xs text-gray-400 mb-4">
          Shared with every candidate whose booking is confirmed — automatically included in the candidate's
          confirmation email only (interviewers never see this section). Store links here (Google Drive share
          links or video URLs), not uploaded files.
        </p>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-soft p-5 space-y-5">
          {/* Video setup guide */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1 flex items-center gap-1.5">
              <Video className="w-3.5 h-3.5 text-gray-400" /> Video Setup Guide
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <input
                value={form.videoGuideLabel || ""}
                onChange={e => setForm(f => ({ ...f, videoGuideLabel: e.target.value }))}
                placeholder='Label (optional, e.g. "Camera and Mic Setup")'
                className="sm:col-span-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
              <input
                value={form.videoGuideUrl || ""}
                onChange={e => setForm(f => ({ ...f, videoGuideUrl: e.target.value }))}
                placeholder="Drive link or video URL"
                className="sm:col-span-2 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
          </div>

          {/* Documents */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-2 flex items-center gap-1.5">
              <Link2 className="w-3.5 h-3.5 text-gray-400" /> Instruction &amp; Reference Documents
            </label>
            <div className="space-y-2">
              {(form.documents || []).map(doc => (
                <div key={doc.id} className="grid grid-cols-1 sm:grid-cols-[140px_1fr_1fr_auto] gap-2 items-center">
                  <select
                    value={doc.type}
                    onChange={e => updateDocument(doc.id, { type: e.target.value })}
                    className="border border-gray-300 rounded-lg px-2.5 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-brand-500"
                  >
                    {DOC_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                  <input
                    value={doc.label}
                    onChange={e => updateDocument(doc.id, { label: e.target.value })}
                    placeholder="Document name…"
                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                  <input
                    value={doc.url}
                    onChange={e => updateDocument(doc.id, { url: e.target.value })}
                    placeholder="Document link…"
                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                  <button
                    onClick={() => removeDocument(doc.id)}
                    className="p-2 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50 transition-colors justify-self-start"
                    title="Remove"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
              {(form.documents || []).length === 0 && (
                <p className="text-xs text-gray-400">No documents added yet.</p>
              )}
            </div>
            <button onClick={addDocument}
              className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-brand-600 border border-dashed border-brand-300 rounded-lg px-3 py-1.5 hover:bg-brand-50 transition-colors">
              <Plus className="w-3.5 h-3.5" /> Add Document
            </button>
          </div>

          <div className="flex items-center gap-3 pt-1">
            <Button variant="primary" size="sm" onClick={handleSave} disabled={!dirty || saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
            {saved && <span className="text-xs font-semibold text-emerald-600">Saved.</span>}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
