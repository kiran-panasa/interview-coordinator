import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ShieldCheck } from "lucide-react";
import { subscribeToInterviewIntegrity, updateInterviewIntegrity } from "../../api/firestore";
import { useAuth } from "../../AuthContext";
import { FieldListEditor } from "./FieldEditor";
import Button from "../Button";

function SectionTitle({ icon: Icon, label }) {
  return (
    <h2 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-2">
      <Icon className="w-4 h-4 text-gray-400" />
      {label}
    </h2>
  );
}

export default function InterviewIntegrityTab() {
  const { currentUser } = useAuth();
  const [saved,   setSaved]   = useState(null); // last-saved snapshot, for dirty-check
  const [fields,  setFields]  = useState(null); // working draft
  const [saving,  setSaving]  = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  useEffect(() => subscribeToInterviewIntegrity(s => {
    setSaved(s.domainFields);
    setFields(f => f || s.domainFields);
  }), []);

  const dirty = fields && saved && JSON.stringify(fields) !== JSON.stringify(saved);

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateInterviewIntegrity(fields, currentUser.uid);
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  if (!fields) {
    return <p className="text-xs text-gray-400">Loading…</p>;
  }

  return (
    <div>
      <motion.div
        initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}
        className="mb-6"
      >
        <SectionTitle icon={ShieldCheck} label="Interview Integrity Checklist" />
        <p className="text-xs text-gray-400 mb-4">
          A single shared checklist, applied automatically to every interview template — it always renders as
          the first section of the feedback form and isn't stored per-template, so any change here takes effect
          across every template immediately. Each item is a scored dropdown with a relative weight; the
          candidate's Integrity Rating is the weighted average of all answered items, normalized to a 0–10 score.
        </p>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-soft p-5">
          <FieldListEditor
            fields={fields}
            onChange={setFields}
            addLabel="Add Checklist Item"
            showWeight
            weightMode="points"
          />

          <div className="flex items-center gap-3 mt-4">
            <Button variant="primary" size="sm" onClick={handleSave} disabled={!dirty || saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
            {justSaved && <span className="text-xs font-semibold text-emerald-600">Saved — every template is updated.</span>}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
