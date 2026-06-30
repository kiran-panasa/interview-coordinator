import { useState, useEffect, useCallback } from "react";
import { materializeFeedback } from "../../utils/templateEngine";
import { useAuth } from "../../AuthContext";
import {
  subscribeToInterviews, subscribeToPrograms, getCandidates, getAllUsers,
  createInterview, updateInterview, deleteInterview,
  getInterviewerAvailability, markSlotBooked, markSlotFree,
  getTemplates, getTemplate, DEFAULT_ROUNDS, importCompletedInterview,
} from "../../api/firestore";
import Modal from "../../components/Modal";
import Badge from "../../components/Badge";
import Toast from "../../components/Toast";
import KebabMenu from "../../components/KebabMenu";
import { DynamicFeedbackDisplay } from "../../components/DynamicFeedbackForm";
import Pagination from "../../components/Pagination";
import { usePagination } from "../../hooks/usePagination";

const APPS_SCRIPT_URL    = import.meta.env.VITE_APPS_SCRIPT_URL;
const APPS_SCRIPT_SECRET = import.meta.env.VITE_APPS_SCRIPT_SECRET;

const STATUSES  = ["All", "pending_acceptance", "scheduled", "completed", "cancelled", "declined", "no_show"];
const DURATIONS = [
  { label: "30 min",  value: 30  },
  { label: "45 min",  value: 45  },
  { label: "1 hour",  value: 60  },
  { label: "1.5 hrs", value: 90  },
  { label: "2 hours", value: 120 },
];

const EMPTY_FORM = {
  candidateId: "", interviewerId: "", scheduledDate: "", scheduledTime: "",
  duration: 60, meetLink: "", round: "", notes: "", templateId: "",
};

function fmt(dateStr) {
  if (!dateStr) return "—";
  const [y, m, d] = dateStr.split("-");
  return `${d}/${m}/${y}`;
}

// ── CSV import helpers ────────────────────────────────────────────────────────

function parseLine(line) {
  const fields = [];
  let field = "", inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQ && line[i + 1] === '"') { field += '"'; i++; }
      else inQ = !inQ;
    } else if (c === "," && !inQ) { fields.push(field.trim()); field = ""; }
    else field += c;
  }
  fields.push(field.trim());
  return fields;
}

function normalizeDate(s) {
  if (!s) return null;
  s = s.trim();
  const dmy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return null;
}

function slugify(label) {
  return (label || "")
    .toLowerCase()
    .replace(/[–—]/g, "_")
    .replace(/[^a-z0-9\s_]/g, " ")
    .trim()
    .replace(/[\s_]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 40) || "field";
}

function normalizeTime(s) {
  if (!s) return null;
  s = s.trim();
  const ampm = s.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (ampm) return `${ampm[1]}:${ampm[2]} ${ampm[3].toUpperCase()}`;
  const h24 = s.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (h24) {
    let h = parseInt(h24[1]);
    const m = h24[2];
    const suf = h >= 12 ? "PM" : "AM";
    if (h === 0) h = 12;
    else if (h > 12) h -= 12;
    return `${h}:${m} ${suf}`;
  }
  return null;
}

const VERDICT_MAP = { proceed: "Proceed", hold: "Hold", reject: "Reject" };

function parseImportCSV(text, candidates, interviewers, templates, existing) {
  const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
  if (lines.length < 2) return { globalError: "Need at least a header row and one data row." };

  const headers = parseLine(lines[0]).map(h => h.toLowerCase().replace(/\s+/g, ""));
  const REQ = ["candidateemail", "intervieweremail", "templatename", "date", "time"];
  const missing = REQ.filter(h => !headers.includes(h));
  if (missing.length) return { globalError: `Missing columns: ${missing.join(", ")}` };

  const idx = name => headers.indexOf(name.toLowerCase().replace(/\s+/g, ""));

  return {
    rows: lines.slice(1).map((line, i) => {
      const f = parseLine(line);
      const g = name => (f[idx(name)] || "").trim();

      const raw = {
        candidateEmail:  g("candidateEmail"),
        interviewerEmail: g("interviewerEmail"),
        templateName:    g("templateName"),
        date:            g("date"),
        time:            g("time"),
        round:           g("round") || "Round 1",
        verdict:         g("verdict"),
        notes:           g("notes"),
      };

      const errors = [], warnings = [];

      const candidate = candidates.find(c => c.email?.toLowerCase() === raw.candidateEmail.toLowerCase());
      if (!raw.candidateEmail) errors.push("candidateEmail required");
      else if (!candidate) errors.push(`Candidate not found: ${raw.candidateEmail}`);

      const interviewer = interviewers.find(u => u.email?.toLowerCase() === raw.interviewerEmail.toLowerCase());
      if (!raw.interviewerEmail) errors.push("interviewerEmail required");
      else if (!interviewer) errors.push(`Interviewer not found: ${raw.interviewerEmail}`);

      const template = templates.find(t => t.name.toLowerCase() === raw.templateName.toLowerCase());
      if (!raw.templateName) errors.push("templateName required");
      else if (!template) errors.push(`Template not found: "${raw.templateName}"`);

      const scheduledDate = normalizeDate(raw.date);
      if (!raw.date) errors.push("date required");
      else if (!scheduledDate) errors.push(`Bad date format: "${raw.date}" — use DD/MM/YYYY`);

      const scheduledTime = normalizeTime(raw.time);
      if (!raw.time) errors.push("time required");
      else if (!scheduledTime) errors.push(`Bad time format: "${raw.time}" — use "10:00 AM" or "14:00"`);

      const verdict = raw.verdict ? (VERDICT_MAP[raw.verdict.toLowerCase()] || raw.verdict) : "";

      // Collect domain columns: any header ending in _rating or _notes
      const domainData = {};
      headers.forEach((h, j) => {
        if (h.endsWith("_rating") || h.endsWith("_notes")) domainData[h] = (f[j] || "").trim();
      });

      // Validate numeric ratings are in 0-5 range (templates may use 0-4 or 1-5 scales)
      Object.entries(domainData).forEach(([k, v]) => {
        if (k.endsWith("_rating") && v) {
          const n = parseFloat(v);
          if (isNaN(n) || n < 0 || n > 5) warnings.push(`${k}: "${v}" is not a valid score (expected 0–5)`);
        }
      });

      const hasDomainFeedback = Object.values(domainData).some(Boolean);

      if (candidate && scheduledDate) {
        const dup = existing.some(iv => iv.candidateId === candidate.id && iv.scheduledDate === scheduledDate);
        if (dup) warnings.push("Duplicate: interview for this candidate on this date already exists");
      }

      return { rowNum: i + 2, raw, resolved: { candidate, interviewer, template, scheduledDate, scheduledTime, verdict, domainData, hasDomainFeedback }, errors, warnings };
    }),
  };
}

// Builds a proper feedback.domains object from flat CSV domain columns.
// For domains WITH cardFields: reads {domainId}_{fieldId}_rating per scored field → one synthetic card.
// For domains WITHOUT cardFields (resume, overall_feedback): reads {domainId}_rating → domain-level field.
function buildFeedbackFromCSV(template, domainData, verdict, overallNotes) {
  const hasDomainData = Object.values(domainData).some(Boolean);

  if (!template?.domains || !hasDomainData) {
    return {
      overallRecommendation: verdict,
      comments: overallNotes,
      importedFromSheet: true,
      submittedAt: new Date().toISOString(),
    };
  }

  const feedbackDomains = {};

  for (const domain of template.domains.filter(d => d.enabled !== false)) {
    const notes    = domainData[`${domain.id}_notes`] || "";
    const hasCards = (domain.cardFields || []).length > 0;
    const domainState = { cards: [] };

    if (hasCards) {
      // One synthetic card: each scored_dropdown gets its own per-field column value
      const card = {};
      for (const f of domain.cardFields) {
        if (f.type === "scored_dropdown") {
          // Try label-slug column first (new format), fall back to field ID (old format)
          const raw = domainData[`${domain.id}_${slugify(f.label)}_rating`]
                   ?? domainData[`${domain.id}_${f.id}_rating`];
          card[f.id] = raw !== "" && raw != null ? parseFloat(raw) : null;
        } else {
          card[f.id] = f.type === "text" ? "" : null;
        }
      }
      domainState.cards = [card];
      // Domain-level text fields (remarks)
      for (const f of domain.domainFields || []) {
        domainState[f.id] = f.type === "text" ? notes : null;
      }
    } else {
      // No cards: single domain-level rating + remarks
      const raw    = domainData[`${domain.id}_rating`];
      const rating = raw !== "" && raw != null ? parseFloat(raw) : null;
      for (const f of domain.domainFields || []) {
        if (f.type === "scored_dropdown") domainState[f.id] = rating;
        else if (f.type === "text") domainState[f.id] = domain.id === "overall_feedback" ? (overallNotes || notes) : notes;
        else domainState[f.id] = null;
      }
    }

    feedbackDomains[domain.id] = domainState;
  }

  const materialized = materializeFeedback(template, { domains: feedbackDomains });
  return {
    ...materialized,
    overallRecommendation: verdict,
    importedFromSheet: true,
    submittedAt: new Date().toISOString(),
  };
}

function downloadImportTemplate(template) {
  const baseHeaders = ["candidateEmail", "interviewerEmail", "templateName", "date", "time", "round", "verdict", "notes"];
  const baseExample = [
    "john.doe@example.com", "interviewer@nxtwave.tech",
    template?.name || "Product Mastery - Novice",
    "15/06/2026", "10:00 AM", "Round 1", "Proceed", "Overall interview notes",
  ];

  const domainHeaders = [];
  const domainExample = [];

  if (template?.domains) {
    const sorted = [...template.domains]
      .filter(d => d.enabled !== false)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

    for (const d of sorted) {
      if (d.id === "overall_feedback") {
        // overall_feedback has no rating, just notes (domain_remarks)
        domainHeaders.push(`${d.id}_notes`);
        domainExample.push("");
        continue;
      }

      const hasCardFields = (d.cardFields || []).length > 0;

      if (hasCardFields) {
        // One column per scored_dropdown field in the card, named by label slug
        for (const f of d.cardFields) {
          if (f.type === "scored_dropdown") {
            domainHeaders.push(`${d.id}_${slugify(f.label)}_rating`);
            domainExample.push("3");
          }
        }
      } else {
        // Domain-level single rating (e.g. resume)
        domainHeaders.push(`${d.id}_rating`);
        domainExample.push("3");
      }

      // Notes column for every domain
      domainHeaders.push(`${d.id}_notes`);
      domainExample.push(`Remarks for ${d.label}`);
    }
  }

  const rows = [
    [...baseHeaders, ...domainHeaders].join(","),
    [...baseExample, ...domainExample].map(v => (v.includes(",") || v.includes(" ")) ? `"${v}"` : v).join(","),
  ];

  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([rows.join("\n")], { type: "text/csv" }));
  a.download = template ? `import_${template.name.replace(/\s+/g, "_")}.csv` : "interview_import_template.csv";
  a.click();
}

// ── Calendar API helpers ──────────────────────────────────────────────────────

async function callAppsScript(payload) {
  if (!APPS_SCRIPT_URL) throw new Error("VITE_APPS_SCRIPT_URL is not set in .env");
  const res = await fetch(APPS_SCRIPT_URL, {
    method:   "POST",
    redirect: "follow",
    body:     JSON.stringify({ ...payload, secret: APPS_SCRIPT_SECRET }),
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error || "Apps Script call failed");
  return json;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function InterviewsPage() {
  const { currentUser, userProfile } = useAuth();
  const [interviews,    setInterviews]    = useState([]);
  const [candidates,    setCandidates]    = useState([]);
  const [interviewers,  setInterviewers]  = useState([]);
  const [templates,     setTemplates]     = useState([]);
  const [programs,      setPrograms]      = useState([]);
  const [activeProgram, setActiveProgram] = useState("all");
  const [filterStatus,  setFilterStatus]  = useState("All");
  const [filterDate,    setFilterDate]    = useState("");
  const [filterIvr,     setFilterIvr]     = useState("All");
  const [showModal,     setShowModal]     = useState(false);
  const [editTarget,    setEditTarget]    = useState(null);
  const [form,          setForm]          = useState(EMPTY_FORM);
  const [slots,         setSlots]         = useState([]);
  const [availDates,    setAvailDates]    = useState([]);
  const [availTimes,    setAvailTimes]    = useState([]);
  const [saving,        setSaving]        = useState(false);
  const [inviting,      setInviting]      = useState({});  // { [interviewId]: true }
  const [feedbackModal, setFeedbackModal] = useState(null); // { interview, template }
  const [toast,         setToast]         = useState(null);
  const [showImport,      setShowImport]      = useState(false);
  const [csvText,         setCsvText]         = useState("");
  const [parsedRows,      setParsedRows]      = useState(null);
  const [importing,       setImporting]       = useState(false);
  const [dlTemplateId,    setDlTemplateId]    = useState("");

  useEffect(() => {
    const unsubInterviews = subscribeToInterviews(setInterviews);
    const unsubPrograms   = subscribeToPrograms(setPrograms);
    getCandidates().then(setCandidates);
    getAllUsers().then(users =>
      setInterviewers(users.filter(u =>
        (u.role === "interviewer" || u.role === "interviewer_content") && u.status === "active"
      ))
    );
    getTemplates().then(setTemplates);
    return () => { unsubInterviews(); unsubPrograms(); };
  }, []);

  useEffect(() => {
    if (!form.interviewerId) { setSlots([]); setAvailDates([]); setAvailTimes([]); return; }
    getInterviewerAvailability(form.interviewerId).then(s => {
      const free = s.filter(x => !x.isBooked);
      setSlots(s);
      setAvailDates([...new Set(free.map(x => x.date))].sort());
      setAvailTimes([]);
    });
  }, [form.interviewerId]);

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
      candidateId:   iv.candidateId,
      interviewerId: iv.interviewerId,
      scheduledDate: iv.scheduledDate,
      scheduledTime: iv.scheduledTime,
      duration:      iv.duration || 60,
      meetLink:      iv.meetLink  || "",
      round:         iv.round     || "",
      notes:         iv.notes     || "",
      templateId:    iv.templateId || "",
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
        candidateName:    candidate?.name         || "",
        candidateEmail:   candidate?.email        || "",
        roleAppliedFor:   candidate?.roleAppliedFor || "",
        resumeLink:       candidate?.resumeLink   || "",
        interviewerEmail: interviewer?.email      || "",
        interviewerName:  interviewer?.displayName || interviewer?.email || "",
        codingProblems:   (template?.questions?.coding  || []).slice(0, template?.codingProblems || 2),
        theorySubject:    (template?.questions?.theory  || []).join(", "),
        templateName:     template?.name || "",
      };

      if (editTarget) {
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

  // ── Send calendar invite ────────────────────────────────────────────────────

  const sendInvite = async (iv) => {
    setInviting(s => ({ ...s, [iv.id]: true }));
    try {
      const result = await callAppsScript({
        action:          "schedule",
        candidateEmail:  iv.candidateEmail,
        interviewerEmail: iv.interviewerEmail,
        candidateName:   iv.candidateName,
        interviewerName: iv.interviewerName,
        round:           iv.round,
        date:            iv.scheduledDate,
        startTime:       iv.scheduledTime,
        durationMinutes: iv.duration || 60,
      });
      await updateInterview(iv.id, {
        meetLink: result.meetLink,
        eventId:  result.eventId,
        inviteSentAt: new Date().toISOString(),
      });
      setToast({ message: "Calendar invite sent! Meet link saved." });
    } catch (e) {
      setToast({ message: "Failed to send invite: " + e.message, type: "error" });
    }
    setInviting(s => ({ ...s, [iv.id]: false }));
  };

  // ── Cancel interview (+ calendar event) ────────────────────────────────────

  const handleCancel = async (iv) => {
    if (!confirm(`Cancel interview with ${iv.candidateName}? This will also delete the calendar event and notify attendees.`)) return;
    try {
      if (iv.eventId) {
        await callAppsScript({ action: "cancel", eventId: iv.eventId }).catch(() => {});
      }
      await updateInterview(iv.id, { status: "cancelled", eventId: null, meetLink: "" });
      const slotId = `${iv.scheduledDate}_${iv.scheduledTime.replace(/[: ]/g, "")}`;
      await markSlotFree(iv.interviewerId, slotId).catch(() => {});
      setToast({ message: "Interview cancelled and calendar event deleted." });
    } catch (e) {
      setToast({ message: e.message, type: "error" });
    }
  };

  const handleDelete = async (iv) => {
    const label = `${iv.candidateName} — ${iv.round} on ${fmt(iv.scheduledDate)}`;
    if (!confirm(`Permanently delete interview:\n"${label}"?\n\nThis cannot be undone.`)) return;
    try {
      if (iv.eventId) {
        await callAppsScript({ action: "cancel", eventId: iv.eventId }).catch(() => {});
      }
      const slotId = `${iv.scheduledDate}_${(iv.scheduledTime || "").replace(/[: ]/g, "")}`;
      await markSlotFree(iv.interviewerId, slotId).catch(() => {});
      await deleteInterview(iv.id);
      setToast({ message: "Interview deleted." });
    } catch (e) {
      setToast({ message: e.message, type: "error" });
    }
  };

  const handleMarkNoShow = async (iv) => {
    if (!confirm(`Mark "${iv.candidateName}" as no-show?`)) return;
    try {
      await updateInterview(iv.id, { status: "no_show" });
      setToast({ message: "Marked as no-show." });
    } catch (e) {
      setToast({ message: e.message, type: "error" });
    }
  };

  const openFeedback = async (iv) => {
    const tmpl = iv.templateId ? await getTemplate(iv.templateId) : null;
    setFeedbackModal({ interview: iv, template: tmpl });
  };

  const handleParseCSV = () => {
    const result = parseImportCSV(csvText, candidates, interviewers, templates, interviews);
    if (result.globalError) { setToast({ message: result.globalError, type: "error" }); return; }
    setParsedRows(result.rows);
  };

  const handleImport = async () => {
    const validRows = parsedRows.filter(r => r.errors.length === 0);
    setImporting(true);
    let done = 0;
    const failed = [];
    for (const row of validRows) {
      try {
        const { candidate, interviewer, template, scheduledDate, scheduledTime, verdict, domainData } = row.resolved;
        const feedback = buildFeedbackFromCSV(template, domainData, verdict, row.raw.notes);
        await importCompletedInterview({
          candidateId:      candidate.id,
          candidateName:    candidate.name,
          candidateEmail:   candidate.email,
          interviewerId:    interviewer.id,
          interviewerEmail: interviewer.email,
          interviewerName:  interviewer.displayName || interviewer.email,
          templateId:       template?.id   || "",
          templateName:     template?.name || "",
          scheduledDate,
          scheduledTime,
          round:    row.raw.round,
          meetLink: "",
          feedback,
        });
        done++;
      } catch (e) { failed.push(`Row ${row.rowNum}: ${e.message}`); }
    }
    setImporting(false);
    if (failed.length) {
      setToast({ message: `${done} imported, ${failed.length} failed. Check console.`, type: "error" });
    } else {
      setToast({ message: `${done} interview${done !== 1 ? "s" : ""} imported successfully.` });
      setShowImport(false); setCsvText(""); setParsedRows(null);
    }
  };

  const setField = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const templateProgram = (templateId) =>
    templates.find(t => t.id === templateId)?.program || "";

  const filtered = interviews.filter(i => {
    if (activeProgram === "unassigned" && templateProgram(i.templateId)) return false;
    if (activeProgram !== "all" && activeProgram !== "unassigned" && templateProgram(i.templateId) !== activeProgram) return false;
    if (filterStatus !== "All" && i.status !== filterStatus) return false;
    if (filterDate && i.scheduledDate !== filterDate) return false;
    if (filterIvr  !== "All" && i.interviewerEmail !== filterIvr) return false;
    return true;
  });
  const { paged: pagedInterviews, page: ivrPage, setPage: setIvrPage, totalPages: ivrTotalPages, total: ivrTotal, pageSize: ivrPageSize } = usePagination(filtered, 10);

  const uniqueIvrs = [...new Set(interviews.map(i => i.interviewerEmail))].filter(Boolean).sort();

  const inputCls = "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500";
  const labelCls = "block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1";

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Interviews</h1>
          <p className="text-sm text-gray-500 mt-0.5">{interviews.length} total interviews</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => { setShowImport(true); setCsvText(""); setParsedRows(null); }}
            className="flex items-center gap-2 border border-gray-300 bg-white text-gray-700 px-4 py-2.5 rounded-lg text-sm font-semibold hover:bg-gray-50 transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1M8 12l4-4m0 0l4 4m-4-4v12" />
            </svg>
            Import from Sheet
          </button>
          <button onClick={openNew}
            className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2.5 rounded-lg text-sm font-semibold hover:bg-indigo-700 transition-colors shadow-sm">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Schedule Interview
          </button>
        </div>
      </div>

      {/* ── Program Tabs ── */}
      {programs.length > 0 && (
        <div className="flex border-b border-gray-200 mb-5">
          {[
            { id: "all",        label: "All",        count: interviews.length },
            ...programs.map(p => ({ id: p.id, label: p.name, count: interviews.filter(i => templateProgram(i.templateId) === p.id).length })),
            { id: "unassigned", label: "Unassigned", count: interviews.filter(i => !templateProgram(i.templateId)).length },
          ].map(tab => (
            <button key={tab.id} onClick={() => { setActiveProgram(tab.id); setIvrPage(1); }}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors ${
                activeProgram === tab.id
                  ? "border-indigo-600 text-indigo-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}>
              {tab.label}
              <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded-full ${
                activeProgram === tab.id ? "bg-indigo-100 text-indigo-700" : "bg-gray-100 text-gray-500"
              }`}>{tab.count}</span>
            </button>
          ))}
        </div>
      )}

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
              {["Candidate", "Interviewer", "Round", "Date & Time", "Meet", "Status", ""].map(h => (
                <th key={h} className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide px-4 py-3">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {filtered.length === 0 ? (
              <tr><td colSpan={7} className="text-center text-gray-400 py-12">No interviews found</td></tr>
            ) : pagedInterviews.map(iv => (
              <tr key={iv.id} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <p className="font-semibold text-gray-900">{iv.candidateName}</p>
                  <p className="text-xs text-gray-400">{iv.candidateEmail}</p>
                </td>
                <td className="px-4 py-3 text-gray-700 text-xs">
                  <p>{iv.interviewerName || iv.interviewerEmail}</p>
                </td>
                <td className="px-4 py-3 text-gray-600">{iv.round}</td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <p className="text-gray-700">{fmt(iv.scheduledDate)}</p>
                  <p className="text-xs text-gray-400">{iv.scheduledTime}{iv.duration ? ` · ${iv.duration}m` : ""}</p>
                </td>
                <td className="px-4 py-3">
                  {iv.meetLink ? (
                    <a href={iv.meetLink} target="_blank" rel="noreferrer"
                      className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full hover:bg-emerald-100 transition-colors">
                      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M15 10l4.553-2.069A1 1 0 0121 8.87v6.26a1 1 0 01-1.447.9L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z"/>
                      </svg>
                      Join Meet
                    </a>
                  ) : (
                    <span className="text-xs text-gray-300">—</span>
                  )}
                </td>
                <td className="px-4 py-3"><Badge value={iv.status} /></td>
                <td className="px-4 py-3 w-12">
                  <KebabMenu actions={[
                    { label: "Edit", onClick: () => openEdit(iv) },
                    {
                      label: inviting[iv.id] ? "Sending…" : iv.eventId ? "✓ Invite Sent" : "Send Invite",
                      onClick: () => { if (!iv.eventId && !inviting[iv.id]) sendInvite(iv); },
                      show: iv.status !== "cancelled" && iv.status !== "completed" && iv.status !== "no_show",
                    },
                    {
                      label: "Mark No-show",
                      onClick: () => handleMarkNoShow(iv),
                      show: iv.status === "scheduled" || iv.status === "pending_acceptance",
                    },
                    {
                      label: "View Feedback",
                      onClick: () => openFeedback(iv),
                      show: iv.status === "completed" && !!iv.feedback,
                      highlight: true,
                    },
                    {
                      label: "Cancel",
                      onClick: () => handleCancel(iv),
                      show: iv.status !== "cancelled" && iv.status !== "completed" && iv.status !== "no_show",
                      danger: true,
                    },
                    { label: "Delete", onClick: () => handleDelete(iv), danger: true },
                  ]} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <Pagination page={ivrPage} totalPages={ivrTotalPages} total={ivrTotal} pageSize={ivrPageSize} onPageChange={setIvrPage} />
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
              {candidates.map(c => <option key={c.id} value={c.id}>{c.name}{c.uid ? ` · ${c.uid}` : ""}</option>)}
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

          {/* Date, Time, Duration */}
          <div className="grid grid-cols-3 gap-3">
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

          {/* Round */}
          <div>
            <label className={labelCls}>Round *</label>
            <select value={form.round} onChange={e => setField("round", e.target.value)} className={inputCls}>
              <option value="">— Select round —</option>
              {DEFAULT_ROUNDS.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
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

      {/* Feedback Viewer Modal */}
      <Modal open={!!feedbackModal} onClose={() => setFeedbackModal(null)}
        title={feedbackModal ? `Feedback — ${feedbackModal.interview.candidateName}` : ""} wide>
        {feedbackModal && (() => {
          const fb = feedbackModal.interview.feedback;
          const tmpl = feedbackModal.template;
          const isDynamic = fb && (fb.domains || fb.sections);
          return (
            <div className="space-y-4">
              {/* Meta row */}
              <div className="flex flex-wrap gap-3 text-xs text-gray-500 pb-2 border-b border-gray-100">
                <span><span className="font-semibold text-gray-700">Interviewer:</span> {feedbackModal.interview.interviewerName || feedbackModal.interview.interviewerEmail}</span>
                <span><span className="font-semibold text-gray-700">Round:</span> {feedbackModal.interview.round}</span>
                <span><span className="font-semibold text-gray-700">Date:</span> {fmt(feedbackModal.interview.scheduledDate)}</span>
                {fb?.submittedAt && (
                  <span><span className="font-semibold text-gray-700">Submitted:</span> {new Date(fb.submittedAt).toLocaleString()}</span>
                )}
              </div>

              {/* Dynamic template feedback */}
              {isDynamic ? (
                <DynamicFeedbackDisplay template={tmpl} feedbackData={fb} />
              ) : (
                /* Legacy feedback fallback */
                <div className="space-y-3">
                  {fb?.answers && Object.entries(fb.answers).map(([qid, val]) => (
                    <div key={qid} className="bg-gray-50 rounded-lg px-4 py-3">
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                        {qid.replace(/_/g, " ")}
                      </p>
                      {typeof val === "number" ? (
                        <div className="flex items-center gap-2">
                          <div className="flex gap-0.5">
                            {[1,2,3,4,5].map(n => (
                              <div key={n} className={`w-4 h-4 rounded-sm ${n <= val ? "bg-indigo-500" : "bg-gray-200"}`} />
                            ))}
                          </div>
                          <span className="text-sm font-bold text-indigo-700">{val}/5</span>
                        </div>
                      ) : (
                        <p className="text-sm text-gray-800">{val || "—"}</p>
                      )}
                    </div>
                  ))}
                  {fb?.comments && (
                    <div className="bg-gray-50 rounded-lg px-4 py-3">
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Comments</p>
                      <p className="text-sm text-gray-800 whitespace-pre-wrap">{fb.comments}</p>
                    </div>
                  )}
                  {fb?.overallRecommendation && (
                    <div className="bg-indigo-50 rounded-lg px-4 py-3 flex items-center gap-3">
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Recommendation</p>
                      <span className="text-sm font-bold text-indigo-700">{fb.overallRecommendation}</span>
                    </div>
                  )}
                </div>
              )}

              <div className="pt-2 flex justify-end">
                <button onClick={() => setFeedbackModal(null)}
                  className="px-5 bg-gray-100 text-gray-700 rounded-xl py-2 text-sm font-semibold hover:bg-gray-200">
                  Close
                </button>
              </div>
            </div>
          );
        })()}
      </Modal>

      {/* Import from Sheet Modal */}
      <Modal open={showImport} onClose={() => setShowImport(false)} title="Import Interviews from Sheet" wide>
        <div className="space-y-5">

          {/* Format reference */}
          <div className="bg-gray-50 rounded-xl border border-gray-200 p-4">
            <p className="text-xs font-bold text-gray-600 uppercase tracking-wide mb-2">CSV Format</p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-200">
                    {["Column", "Required", "Example"].map(h => (
                      <th key={h} className="text-left font-semibold text-gray-500 pb-1.5 pr-4">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="text-gray-600 divide-y divide-gray-100">
                  {[
                    ["candidateEmail",   "Yes", "john@example.com"],
                    ["interviewerEmail", "Yes", "interviewer@nxtwave.tech"],
                    ["templateName",     "Yes", "Product Mastery - Novice"],
                    ["date",             "Yes", "15/06/2026 or 2026-06-15"],
                    ["time",             "Yes", "10:00 AM or 14:30"],
                    ["round",            "No",  "Round 1 (default)"],
                    ["verdict",          "No",  "Proceed / Hold / Reject"],
                    ["notes",            "No",  "Overall feedback notes"],
                    ["{domainId}_{fieldId}_rating","No",  "e.g. coding_ps_rating → score for that specific card field (0–5)"],
                    ["{domainId}_rating",         "No",  "e.g. resume_rating → for domains with no card fields"],
                    ["{domainId}_notes",           "No",  "e.g. coding_notes → overall remarks for that domain"],
                  ].map(([col, req, ex]) => (
                    <tr key={col}>
                      <td className="py-1.5 pr-4 font-mono text-[11px] text-indigo-700">{col}</td>
                      <td className="py-1.5 pr-4">
                        {req === "Yes"
                          ? <span className="text-red-500 font-semibold">Yes</span>
                          : <span className="text-gray-400">No</span>}
                      </td>
                      <td className="py-1.5 text-gray-500">{ex}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Template-specific CSV download */}
            <div className="mt-3 pt-3 border-t border-gray-200">
              <p className="text-xs text-gray-500 mb-2">Download a ready-to-fill CSV with domain columns for a specific template:</p>
              <div className="flex gap-2">
                <select
                  value={dlTemplateId}
                  onChange={e => setDlTemplateId(e.target.value)}
                  className="flex-1 border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500">
                  <option value="">— Select template —</option>
                  {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
                <button
                  disabled={!dlTemplateId}
                  onClick={() => downloadImportTemplate(templates.find(t => t.id === dlTemplateId))}
                  className="px-3 py-1.5 bg-indigo-600 text-white text-xs font-semibold rounded-lg hover:bg-indigo-700 disabled:opacity-40">
                  Download CSV
                </button>
              </div>
            </div>
          </div>

          {/* CSV input */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Paste CSV or upload file</label>
              <label className="text-xs text-indigo-600 font-semibold hover:underline cursor-pointer">
                Upload file
                <input type="file" accept=".csv,.txt" className="hidden" onChange={e => {
                  const file = e.target.files[0];
                  if (!file) return;
                  const reader = new FileReader();
                  reader.onload = ev => { setCsvText(ev.target.result); setParsedRows(null); };
                  reader.readAsText(file);
                  e.target.value = "";
                }} />
              </label>
            </div>
            <textarea
              rows={6}
              value={csvText}
              onChange={e => { setCsvText(e.target.value); setParsedRows(null); }}
              placeholder={"candidateEmail,interviewerEmail,templateName,date,time,round,verdict,notes\njohn@example.com,interviewer@nxtwave.tech,Product Mastery - Novice,15/06/2026,10:00 AM,Round 1,Proceed,Good candidate"}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
            />
          </div>

          <button
            onClick={handleParseCSV}
            disabled={!csvText.trim()}
            className="w-full border border-indigo-300 text-indigo-700 bg-indigo-50 rounded-lg py-2 text-sm font-semibold hover:bg-indigo-100 disabled:opacity-40">
            Parse & Preview
          </button>

          {/* Preview */}
          {parsedRows && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                Preview — {parsedRows.length} row{parsedRows.length !== 1 ? "s" : ""}
                {parsedRows.filter(r => r.errors.length > 0).length > 0 &&
                  <span className="text-red-500 ml-2">· {parsedRows.filter(r => r.errors.length > 0).length} with errors</span>}
                {parsedRows.filter(r => r.warnings.length > 0 && r.errors.length === 0).length > 0 &&
                  <span className="text-amber-500 ml-2">· {parsedRows.filter(r => r.warnings.length > 0 && r.errors.length === 0).length} with warnings</span>}
              </p>
              <div className="border border-gray-200 rounded-xl overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      {["#", "Candidate", "Interviewer", "Template", "Date", "Time", "Round", "Verdict", "Feedback", ""].map(h => (
                        <th key={h} className="text-left font-semibold text-gray-400 uppercase tracking-wide px-3 py-2">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {parsedRows.map(row => {
                      const hasErr = row.errors.length > 0;
                      const hasWarn = row.warnings.length > 0 && !hasErr;
                      return (
                        <tr key={row.rowNum} className={hasErr ? "bg-red-50" : hasWarn ? "bg-amber-50" : "bg-white"}>
                          <td className="px-3 py-2 text-gray-400">{row.rowNum}</td>
                          <td className="px-3 py-2 font-medium text-gray-800">
                            {row.resolved.candidate?.name || <span className="text-red-500">{row.raw.candidateEmail}</span>}
                          </td>
                          <td className="px-3 py-2 text-gray-600">
                            {row.resolved.interviewer?.displayName || row.resolved.interviewer?.email || <span className="text-red-500">{row.raw.interviewerEmail}</span>}
                          </td>
                          <td className="px-3 py-2 text-gray-600">
                            {row.resolved.template?.name || <span className="text-red-500">{row.raw.templateName}</span>}
                          </td>
                          <td className="px-3 py-2 text-gray-600">
                            {row.resolved.scheduledDate ? fmt(row.resolved.scheduledDate) : <span className="text-red-500">{row.raw.date}</span>}
                          </td>
                          <td className="px-3 py-2 text-gray-600">
                            {row.resolved.scheduledTime || <span className="text-red-500">{row.raw.time}</span>}
                          </td>
                          <td className="px-3 py-2 text-gray-600">{row.raw.round}</td>
                          <td className="px-3 py-2">
                            {row.resolved.verdict && (
                              <span className={`font-semibold ${row.resolved.verdict === "Proceed" ? "text-emerald-600" : row.resolved.verdict === "Reject" ? "text-red-500" : "text-amber-600"}`}>
                                {row.resolved.verdict}
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            {row.resolved.hasDomainFeedback ? (
                              <span className="text-xs text-indigo-600 font-semibold">
                                {Object.keys(row.resolved.domainData).filter(k => k.endsWith("_rating") && row.resolved.domainData[k]).length} domains
                              </span>
                            ) : (
                              <span className="text-xs text-gray-300">verdict only</span>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            {hasErr && (
                              <div className="text-red-600 space-y-0.5">
                                {row.errors.map((e, i) => <p key={i}>✕ {e}</p>)}
                              </div>
                            )}
                            {hasWarn && (
                              <div className="text-amber-600 space-y-0.5">
                                {row.warnings.map((w, i) => <p key={i}>⚠ {w}</p>)}
                              </div>
                            )}
                            {!hasErr && !hasWarn && <span className="text-emerald-500">✓</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {parsedRows.filter(r => r.errors.length === 0).length > 0 && (
                <div className="flex gap-3 mt-4">
                  <button
                    onClick={handleImport}
                    disabled={importing}
                    className="flex-1 bg-indigo-600 text-white rounded-lg py-2 text-sm font-semibold hover:bg-indigo-700 disabled:opacity-60">
                    {importing
                      ? "Importing…"
                      : `Import ${parsedRows.filter(r => r.errors.length === 0).length} Interview${parsedRows.filter(r => r.errors.length === 0).length !== 1 ? "s" : ""}`}
                  </button>
                  <button onClick={() => setShowImport(false)}
                    className="px-5 bg-gray-100 text-gray-700 rounded-lg py-2 text-sm font-semibold hover:bg-gray-200">
                    Cancel
                  </button>
                </div>
              )}

              {parsedRows.every(r => r.errors.length > 0) && (
                <div className="mt-3 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
                  All rows have errors — fix the CSV and re-parse.
                </div>
              )}
            </div>
          )}
        </div>
      </Modal>

      {toast && <Toast message={toast.message} type={toast.type} onDone={() => setToast(null)} />}
    </div>
  );
}
