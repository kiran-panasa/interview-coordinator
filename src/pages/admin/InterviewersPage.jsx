import { useState, useEffect } from "react";
import { getInterviewerAvailability, subscribeToUsers, subscribeToSkills, updateUser, deleteUser } from "../../api/firestore";
import Modal from "../../components/Modal";
import Toast from "../../components/Toast";
import SkillsSelect from "../../components/SkillsSelect";

function initials(name, email) {
  return (name || email || "?").split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);
}

const AVATAR_COLORS = [
  "bg-indigo-100 text-indigo-700",
  "bg-emerald-100 text-emerald-700",
  "bg-violet-100 text-violet-700",
  "bg-amber-100 text-amber-700",
  "bg-rose-100 text-rose-700",
  "bg-cyan-100 text-cyan-700",
];

function avatarColor(id) {
  let n = 0;
  for (const ch of (id || "")) n += ch.charCodeAt(0);
  return AVATAR_COLORS[n % AVATAR_COLORS.length];
}

export default function InterviewersPage() {
  const [interviewers, setInterviewers] = useState([]);
  const [skills,       setSkills]       = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [viewAvail,    setViewAvail]    = useState(null);
  const [editSkills,   setEditSkills]   = useState(null); // { user, draft }
  const [savingSkills, setSavingSkills] = useState(false);
  const [search,       setSearch]       = useState("");
  const [toast,        setToast]        = useState(null);

  useEffect(() => {
    const unsub1 = subscribeToUsers(users => {
      setInterviewers(
        users.filter(u =>
          (u.role === "interviewer" || u.role === "interviewer_content") &&
          u.status === "active"
        )
      );
      setLoading(false);
    });
    const unsub2 = subscribeToSkills(setSkills);
    return () => { unsub1(); unsub2(); };
  }, []);

  const viewAvailability = async (u) => {
    const slots = await getInterviewerAvailability(u.id);
    setViewAvail({ user: u, slots });
  };

  const handleDelete = async (u) => {
    const name = u.displayName || u.email;
    if (!confirm(`Remove interviewer "${name}" from the platform?\n\nThis deletes their account record. Their past interviews will remain.`)) return;
    try {
      await deleteUser(u.id);
      setToast({ message: `${name} removed.` });
    } catch (e) {
      setToast({ message: e.message, type: "error" });
    }
  };

  const saveSkills = async () => {
    if (!editSkills) return;
    setSavingSkills(true);
    await updateUser(editSkills.user.id, { skills: editSkills.draft });
    setSavingSkills(false);
    setEditSkills(null);
    setToast({ message: "Skills updated." });
  };

  const today = new Date().toISOString().slice(0, 10);

  const filtered = interviewers.filter(u => {
    const q = search.toLowerCase();
    return !q ||
      u.displayName?.toLowerCase().includes(q) ||
      u.email?.toLowerCase().includes(q) ||
      u.company?.toLowerCase().includes(q) ||
      u.companyRole?.toLowerCase().includes(q);
  });

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Interviewers</h1>
          <p className="text-sm text-gray-500 mt-0.5">{interviewers.length} active interviewer{interviewers.length !== 1 ? "s" : ""}</p>
        </div>
        <input
          type="text"
          placeholder="Search by name, email, company…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-64 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>

      {loading ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 flex flex-col items-center justify-center py-16 gap-2">
          <svg className="w-10 h-10 text-gray-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
          <p className="text-sm text-gray-400">{interviewers.length === 0 ? "No interviewers yet." : "No results match your search."}</p>
          {interviewers.length === 0 && <p className="text-xs text-gray-300">Invite and approve interviewers from the Admin Panel.</p>}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map(u => (
            <div key={u.id} className="bg-white rounded-2xl border border-gray-200 p-5 flex flex-col gap-4 hover:shadow-sm transition-shadow">

              {/* Header: avatar + name + role badge */}
              <div className="flex items-start gap-3">
                <div className={`w-11 h-11 rounded-xl flex items-center justify-center font-bold text-sm flex-shrink-0 ${avatarColor(u.id)}`}>
                  {initials(u.displayName, u.email)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-gray-900 leading-tight truncate">{u.displayName || "—"}</p>
                  {u.role === "interviewer_content" ? (
                    <span className="inline-block mt-0.5 text-[10px] font-semibold text-teal-700 bg-teal-50 border border-teal-200 px-1.5 py-0.5 rounded-full leading-none">
                      Interviewer + Content
                    </span>
                  ) : (
                    <span className="inline-block mt-0.5 text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-full leading-none">
                      Interviewer
                    </span>
                  )}
                </div>
              </div>

              {/* Professional details */}
              <div className="space-y-1.5">
                {(u.company || u.companyRole) && (
                  <div className="flex items-start gap-2">
                    <svg className="w-3.5 h-3.5 text-gray-300 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                    </svg>
                    <p className="text-xs text-gray-600 leading-tight">
                      {[u.companyRole, u.company].filter(Boolean).join(" at ")}
                    </p>
                  </div>
                )}
                {u.experience && (
                  <div className="flex items-center gap-2">
                    <svg className="w-3.5 h-3.5 text-gray-300 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <p className="text-xs text-gray-600">{u.experience} yr{u.experience != 1 ? "s" : ""} experience</p>
                  </div>
                )}
              </div>

              {/* Contact */}
              <div className="space-y-1.5 pt-1 border-t border-gray-50">
                <div className="flex items-center gap-2">
                  <svg className="w-3.5 h-3.5 text-gray-300 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  <p className="text-xs text-gray-500 font-mono truncate">{u.email}</p>
                </div>
                {u.phone && (
                  <div className="flex items-center gap-2">
                    <svg className="w-3.5 h-3.5 text-gray-300 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                    </svg>
                    <p className="text-xs text-gray-500">{u.phone}</p>
                  </div>
                )}
                {u.linkedin && (
                  <div className="flex items-center gap-2">
                    <svg className="w-3.5 h-3.5 text-gray-300 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
                    </svg>
                    <a href={u.linkedin.startsWith("http") ? u.linkedin : `https://${u.linkedin}`}
                      target="_blank" rel="noreferrer"
                      className="text-xs text-indigo-600 hover:underline truncate">
                      LinkedIn Profile ↗
                    </a>
                  </div>
                )}
              </div>

              {/* Skills */}
              <div className="border-t border-gray-50 pt-2">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Skills</span>
                  <button onClick={() => setEditSkills({ user: u, draft: u.skills || [] })}
                    className="text-[10px] text-indigo-500 hover:underline font-medium">Edit</button>
                </div>
                {(u.skills || []).length === 0 ? (
                  <p className="text-xs text-gray-300">Not set</p>
                ) : (
                  <div className="flex flex-wrap gap-1">
                    {(u.skills || []).map(sid => {
                      const sk = skills.find(s => s.id === sid);
                      return sk ? (
                        <span key={sid} className="text-[10px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200 px-1.5 py-0.5 rounded-full">
                          {sk.name}
                        </span>
                      ) : null;
                    })}
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="mt-auto flex gap-2">
                <button onClick={() => viewAvailability(u)}
                  className="flex-1 text-xs font-semibold text-indigo-600 border border-indigo-100 bg-indigo-50 hover:bg-indigo-100 py-2 rounded-xl transition-colors">
                  View Availability
                </button>
                <button onClick={() => handleDelete(u)}
                  className="text-xs font-semibold text-red-400 border border-red-100 bg-red-50 hover:bg-red-100 px-3 py-2 rounded-xl transition-colors">
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Edit skills modal */}
      <Modal open={!!editSkills} onClose={() => setEditSkills(null)}
        title={`Skills — ${editSkills?.user?.displayName || editSkills?.user?.email || ""}`}>
        {editSkills && (
          <div className="space-y-4">
            <SkillsSelect
              skills={skills}
              value={editSkills.draft}
              onChange={v => setEditSkills(s => ({ ...s, draft: v }))}
              placeholder="Select skills…"
            />
            <div className="flex gap-3 pt-1">
              <button onClick={saveSkills} disabled={savingSkills}
                className="flex-1 bg-indigo-600 text-white rounded-xl py-2.5 text-sm font-semibold hover:bg-indigo-700 disabled:opacity-60">
                {savingSkills ? "Saving…" : "Save Skills"}
              </button>
              <button onClick={() => setEditSkills(null)}
                className="px-5 bg-gray-100 text-gray-700 rounded-xl py-2.5 text-sm font-semibold hover:bg-gray-200">
                Cancel
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Availability modal */}
      <Modal open={!!viewAvail} onClose={() => setViewAvail(null)}
        title={viewAvail ? `${viewAvail.user.displayName || viewAvail.user.email} — Availability` : ""} wide>
        {viewAvail && (() => {
          const upcoming = viewAvail.slots
            .filter(s => s.date >= today)
            .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
          const byDate = {};
          upcoming.forEach(s => { if (!byDate[s.date]) byDate[s.date] = []; byDate[s.date].push(s); });
          return Object.keys(byDate).length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">No upcoming availability set.</p>
          ) : (
            <div className="space-y-4">
              {Object.entries(byDate).map(([date, daySlots]) => {
                const [y, m, d] = date.split("-");
                return (
                  <div key={date}>
                    <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">{`${d}/${m}/${y}`}</p>
                    <div className="flex flex-wrap gap-2">
                      {daySlots.map(s => (
                        <span key={s.id}
                          className={`px-3 py-1 rounded-full text-xs font-medium ${s.isBooked ? "bg-orange-100 text-orange-700" : "bg-emerald-50 text-emerald-700"}`}>
                          {s.time} {s.isBooked ? "· Booked" : "· Free"}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })()}
      </Modal>

      {toast && <Toast message={toast.message} type={toast.type} onDone={() => setToast(null)} />}
    </div>
  );
}
