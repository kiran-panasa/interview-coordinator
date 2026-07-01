import { useState, useEffect } from "react";
import { useAuth } from "../../AuthContext";
import { updateUser, subscribeToSkills } from "../../api/firestore";
import SkillsSelect from "../../components/SkillsSelect";
import Toast from "../../components/Toast";

const inputCls = "w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-colors bg-white";
const labelCls = "block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5";

function Field({ label, children }) {
  return (
    <div>
      <label className={labelCls}>{label}</label>
      {children}
    </div>
  );
}

export default function ProfilePage() {
  const { currentUser, userProfile, refreshProfile } = useAuth();
  const [form,    setForm]    = useState(null);
  const [saving,  setSaving]  = useState(false);
  const [toast,   setToast]   = useState(null);
  const [changed, setChanged] = useState(false);
  const [skills,  setSkills]  = useState([]);

  useEffect(() => { return subscribeToSkills(setSkills); }, []);

  useEffect(() => {
    if (userProfile) {
      setForm({
        displayName:  userProfile.displayName  || "",
        phone:        userProfile.phone        || "",
        company:      userProfile.company      || "",
        companyRole:  userProfile.companyRole  || "",
        experience:   userProfile.experience   || "",
        linkedin:     userProfile.linkedin     || "",
        skills:       userProfile.skills       || [],
        customSkills: userProfile.customSkills || [],
      });
      setChanged(false);
    }
  }, [userProfile]);

  const set = (k, v) => { setForm(f => ({ ...f, [k]: v })); setChanged(true); };

  const handleSave = async () => {
    if (!form.displayName.trim()) {
      setToast({ message: "Name is required.", type: "error" });
      return;
    }
    setSaving(true);
    try {
      await updateUser(currentUser.uid, {
        displayName:  form.displayName.trim(),
        phone:        form.phone.trim()       || null,
        company:      form.company.trim()     || null,
        companyRole:  form.companyRole.trim() || null,
        experience:   form.experience.trim()  || null,
        linkedin:     form.linkedin.trim()    || null,
        skills:       form.skills             || [],
        customSkills: form.customSkills       || [],
      });
      await refreshProfile();
      setChanged(false);
      setToast({ message: "Profile saved." });
    } catch (e) {
      setToast({ message: e.message, type: "error" });
    }
    setSaving(false);
  };

  if (!form) return <div className="p-8 text-sm text-gray-400">Loading…</div>;

  const initials = (form.displayName || userProfile?.email || "?")
    .split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);

  return (
    <div className="p-8 max-w-2xl">
      {/* Header */}
      <div className="flex items-center gap-5 mb-8">
        <div className="w-16 h-16 rounded-2xl bg-emerald-100 flex items-center justify-center flex-shrink-0">
          <span className="text-2xl font-bold text-emerald-700">{initials}</span>
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{form.displayName || "My Profile"}</h1>
          <p className="text-sm text-gray-400 mt-0.5">{userProfile?.email}</p>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 divide-y divide-gray-100">

        {/* ── Basic Info ── */}
        <div className="px-6 py-5">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">Basic Info</p>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Full Name *">
              <input value={form.displayName} onChange={e => set("displayName", e.target.value)}
                placeholder="Your full name" className={inputCls} />
            </Field>
            <Field label="Phone Number">
              <input value={form.phone} onChange={e => set("phone", e.target.value)}
                placeholder="+91 98765 43210" className={inputCls} />
            </Field>
            <Field label="Email">
              <input value={userProfile?.email || ""} readOnly
                className={`${inputCls} bg-gray-50 text-gray-400 cursor-not-allowed`} />
            </Field>
          </div>
        </div>

        {/* ── Professional Details ── */}
        <div className="px-6 py-5">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">Professional Details</p>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Current Company">
              <input value={form.company} onChange={e => set("company", e.target.value)}
                placeholder="e.g. NxtWave" className={inputCls} />
            </Field>
            <Field label="Role at Company">
              <input value={form.companyRole} onChange={e => set("companyRole", e.target.value)}
                placeholder="e.g. Senior Software Engineer" className={inputCls} />
            </Field>
            <Field label="Years of Experience">
              <div className="relative">
                <input
                  type="number" min={0} max={50}
                  value={form.experience}
                  onChange={e => set("experience", e.target.value)}
                  placeholder="e.g. 5"
                  className={inputCls}
                />
                <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs text-gray-400 pointer-events-none">yrs</span>
              </div>
            </Field>
            <Field label="LinkedIn Profile">
              <input value={form.linkedin} onChange={e => set("linkedin", e.target.value)}
                placeholder="https://linkedin.com/in/yourprofile" className={inputCls} />
            </Field>
          </div>
          <div className="mt-4">
            <Field label="Skills">
              <SkillsSelect
                skills={skills}
                value={form.skills || []}
                onChange={v => set("skills", v)}
                customSkills={form.customSkills || []}
                onAddCustom={name => set("customSkills", [...(form.customSkills || []), name])}
                onRemoveCustom={name => set("customSkills", (form.customSkills || []).filter(s => s !== name))}
                placeholder="Select or add your skills…"
              />
              {(form.customSkills || []).length > 0 && (
                <p className="text-[11px] text-amber-600 mt-1.5">
                  Custom skills (amber) are visible to admins but not shared in the global skill list.
                </p>
              )}
            </Field>
          </div>
        </div>

        {/* ── Save ── */}
        <div className="px-6 py-4 flex items-center justify-between bg-gray-50 rounded-b-2xl">
          <p className="text-xs text-gray-400">
            {changed ? "You have unsaved changes." : "All changes saved."}
          </p>
          <button onClick={handleSave} disabled={saving || !changed}
            className="flex items-center gap-2 bg-emerald-600 text-white px-5 py-2 rounded-xl text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50 transition-colors">
            {saving ? (
              <>
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                Saving…
              </>
            ) : "Save Changes"}
          </button>
        </div>
      </div>

      {toast && <Toast message={toast.message} type={toast.type} onDone={() => setToast(null)} />}
    </div>
  );
}
