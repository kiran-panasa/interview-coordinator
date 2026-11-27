import { useState, useRef, useMemo, useCallback, useEffect } from "react";
import * as XLSX from "xlsx";
import { motion } from "framer-motion";
import {
  Search, Plus, Upload, UploadCloud, Users, Archive,
  FileSpreadsheet, FileText, AlertTriangle, AlertCircle, Download,
} from "lucide-react";
import { useAuth } from "../../AuthContext";
import { useQueryClient } from "@tanstack/react-query";
import {
  createCandidate, findCandidateByUidOrEmail, updateCandidate, deleteCandidate, archiveCandidate, unarchiveCandidate,
  getCandidatesPage, getCandidates, getInterviewsForCandidateTemplate, getInterviewsForTemplates,
} from "../../api/firestore";
import { usePrograms, useTemplates, useCandidates, useCandidateCounts, QK } from "../../hooks/queries";
import { ordinalLabel } from "../../utils/strings";
import { compareByInterviewDate, formatDate, formatTimeLabel } from "../../utils/dates";
import Modal from "../../components/Modal";
import Toast from "../../components/Toast";
import Button from "../../components/Button";
import KebabMenu from "../../components/KebabMenu";
import Pagination from "../../components/Pagination";
import CursorPagination from "../../components/CursorPagination";
import { useCursorPagination } from "../../hooks/useCursorPagination";
import { SkeletonRows } from "../../components/Skeleton";
import SkillsSelect from "../../components/SkillsSelect";
import DatePicker from "../../components/DatePicker";
import { LABELS as STATUS_LABELS } from "../../components/Badge";
import { usePagination } from "../../hooks/usePagination";
import AttemptOverridesModal from "../../features/candidates/AttemptOverridesModal";
import CandidateHistoryModal from "../../features/candidates/CandidateHistoryModal";
import { getCandidateProgramIds, candidateHasProgram } from "../../utils/candidatePrograms";
import { timelineDetail, buildCandidateTimeline } from "../../utils/candidateTimeline";

const fadeUp = {
  hidden:  { opacity: 0, y: 12 },
  visible: (i = 0) => ({ opacity: 1, y: 0, transition: { delay: i * 0.05, duration: 0.3, ease: "easeOut" } }),
};

const EMPTY = { name: "", uid: "", email: "", phone: "", resumeLink: "", notes: "", programs: [], templateIds: [] };

import { isUUID } from "../../utils/strings";
import { splitCSVRow } from "../../utils/csv";
import { DEFAULT_NO_SHOW_LIMIT, DEFAULT_CANCEL_LIMIT } from "../../constants/templateAttempts";

const isSwapped = (c) => isUUID(c.name) && !!c.uid && !isUUID(c.uid);

// A real, selectable bucket in the Status filter for "this candidate has
// zero templates assigned at all" — distinct from "not_started"/"No
// Interview Taken Yet" (which means they DO have a template, just haven't
// booked it yet). Without an explicit bucket for this, such a candidate
// matched none of the filter's statuses, which is what made the Status
// dropdown's per-option counts sum to LESS than the program tab's own
// total candidate count.
const NO_TEMPLATE_STATUS = "__no_template__";

// A second pseudo-status, same idea as NO_TEMPLATE_STATUS — "blocked" is
// never a real interview status, it's derived per (candidate, template)
// from counting that candidate's own completed/no-show/candidate-cancelled
// interviews against the template's limit (or this candidate's own
// override from "Manage Attempts"). Mirrors effectiveMaxAttempts/
// effectiveMaxNoShows/effectiveMaxCancellations + the blocked checks in
// api/sso-handler.js EXACTLY (same defaults, same override precedence) so
// this list can never disagree with what actually stops a candidate from
// booking — just computed here in bulk instead of one candidate at a time.
const BLOCKED_STATUS = "__blocked__";

function effectiveMaxAttempts(templateMaxAttempts, override) {
  if (override === 0) return null;
  if (typeof override === "number" && override > 0) return override;
  return templateMaxAttempts ?? null;
}
function effectiveMaxNoShows(templateMaxNoShows, override) {
  if (override === 0) return null;
  if (typeof override === "number" && override > 0) return override;
  if (templateMaxNoShows === 0) return null;
  if (typeof templateMaxNoShows === "number" && templateMaxNoShows > 0) return templateMaxNoShows;
  return DEFAULT_NO_SHOW_LIMIT;
}
function effectiveMaxCancellations(templateMaxCancellations, override) {
  if (override === 0) return null;
  if (typeof override === "number" && override > 0) return override;
  if (templateMaxCancellations === 0) return null;
  if (typeof templateMaxCancellations === "number" && templateMaxCancellations > 0) return templateMaxCancellations;
  return DEFAULT_CANCEL_LIMIT;
}
// Checked in the same order the dashboard (api/sso-handler.js) checks it —
// first exhausted limit wins, since that's the one message a student
// actually sees there too.
function computeBlocked(template, tid, candidate, counts) {
  if (!template || !counts) return { blocked: false, blockReason: "" };
  const maxAttempts = effectiveMaxAttempts(template.maxAttempts, candidate.attemptOverrides?.[tid]);
  if (maxAttempts != null && counts.attemptsUsed >= maxAttempts) {
    return { blocked: true, blockReason: `Attempt limit reached (${counts.attemptsUsed}/${maxAttempts})` };
  }
  const maxNoShows = effectiveMaxNoShows(template.maxNoShows, candidate.noShowOverrides?.[tid]);
  if (maxNoShows != null && counts.noShowCount >= maxNoShows) {
    return { blocked: true, blockReason: `No-show limit reached (${counts.noShowCount}/${maxNoShows})` };
  }
  const maxCancellations = effectiveMaxCancellations(template.maxCancellations, candidate.cancelOverrides?.[tid]);
  if (maxCancellations != null && counts.cancelCount >= maxCancellations) {
    return { blocked: true, blockReason: `Cancellation limit reached (${counts.cancelCount}/${maxCancellations})` };
  }
  return { blocked: false, blockReason: "" };
}

// Outline-only variant of Badge.jsx's STATUS_STYLES for the Status column's
// pills — a filled background behind both the template name AND the status
// word read as two overlapping highlight blocks rather than one clean
// badge, especially once the status word was also made bold. A plain
// colored border + colored text reads clearly without that clash.
const STATUS_OUTLINE_STYLES = {
  not_started:         "border-gray-300    text-gray-500",
  pending_acceptance:  "border-amber-300   text-amber-600",
  scheduled:           "border-blue-300    text-blue-600",
  completed:           "border-emerald-300 text-emerald-600",
  partially_completed: "border-amber-300   text-amber-600",
  cancelled:           "border-gray-300    text-gray-500",
  declined:            "border-red-300     text-red-600",
  no_show:             "border-orange-300  text-orange-600",
  dropped_off:         "border-rose-300    text-rose-600",
};
// Shared by the Status pill's dot and the color legend at the bottom of
// the page, so the two can never drift apart.
const STATUS_DOT_COLORS = {
  not_started:         "bg-gray-300",
  pending_acceptance:  "bg-amber-500",
  scheduled:            "bg-blue-500",
  completed:            "bg-emerald-500",
  partially_completed:  "bg-amber-500",
  cancelled:            "bg-gray-400",
  declined:             "bg-red-500",
  no_show:              "bg-orange-500",
  dropped_off:          "bg-rose-500",
};

function parseCandidatesCSV(text) {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (lines.length < 2) return { rows: [], errors: ["File must have a header row and at least one data row."] };

  const headers = splitCSVRow(lines[0]).map(h => h.toLowerCase().replace(/\s+/g, ""));
  const idx = (names) => names.map(n => headers.findIndex(h => h.includes(n))).find(i => i >= 0) ?? -1;

  const nameIdx      = idx(["name"]);
  const uidIdx       = idx(["uid", "studentid", "id"]);
  const emailIdx     = idx(["email"]);
  const phoneIdx     = idx(["phone", "mobile"]);
  const resumeIdx    = idx(["resume", "link"]);
  const notesIdx     = idx(["notes", "remarks"]);
  const programIdx   = idx(["program"]);
  const templatesIdx = idx(["templates", "template"]);

  if (nameIdx === -1) return { rows: [], errors: ["Missing required column: name"] };

  const errors = [], rows = [];
  for (let i = 1; i < lines.length; i++) {
    const c = splitCSVRow(lines[i]);
    const name = c[nameIdx]?.trim();
    if (!name) { errors.push(`Row ${i + 1}: name is required`); continue; }
    rows.push({
      name,
      uid:           uidIdx       >= 0 ? c[uidIdx]?.trim()       || "" : "",
      email:         emailIdx     >= 0 ? c[emailIdx]?.trim()     || "" : "",
      phone:         phoneIdx     >= 0 ? c[phoneIdx]?.trim()     || "" : "",
      resumeLink:    resumeIdx    >= 0 ? c[resumeIdx]?.trim()    || "" : "",
      notes:         notesIdx     >= 0 ? c[notesIdx]?.trim()     || "" : "",
      // Same "|" convention as templateNames below — lets one row enroll a
      // candidate in more than one Program at once (e.g. "Edge 2.0|Academy").
      programNames:  programIdx   >= 0
        ? (c[programIdx] || "").split("|").map(p => p.trim()).filter(Boolean)
        : [],
      templateNames: templatesIdx >= 0
        ? (c[templatesIdx] || "").split("|").map(t => t.trim()).filter(Boolean)
        : [],
    });
  }
  return { rows, errors };
}

// Live template/program names instead of a fictional example — the
// "templates" column must match an exact name already in the system (see
// handleCSVImport's templateMap lookup), so a made-up placeholder name was
// actively misleading rather than just a cosmetic stand-in. Pulling from
// whatever templates/programs actually exist right now also means the
// sample never goes stale as templates get added/renamed — no hardcoded
// list to keep in sync by hand.
function downloadSampleCSV(templates = [], programs = []) {
  const programName = programs[0]?.name || "NIAT";
  const sampleTemplates = templates.slice(0, 2).map(t => t.name);
  const templatesCell = sampleTemplates.length ? sampleTemplates.join("|") : "";
  const rows = [
    "uid,name,phone,email,program,templates,resumeLink,notes",
    `STU-2024-001,John Doe,+91 98765 43210,john.doe@example.com,${programName},${templatesCell},https://drive.google.com/file/sample,Strong candidate`,
    "STU-2024-002,Jane Smith,+91 98765 43211,jane.smith@example.com,,,,",
  ];
  // Every template currently in the system, for quick reference while
  // filling in the real rows above — not itself a data row (blank uid, so
  // handleCSVFile's parser would reject it as "Name is required" rather
  // than silently importing a junk candidate if someone forgets to delete
  // this section before uploading).
  if (templates.length) {
    rows.push("", "# Available template names — copy the exact spelling into the templates column:");
    templates.forEach(t => rows.push(`# ${t.name}${t.program ? ` (program: ${programs.find(p => p.id === t.program)?.name || t.program})` : ""}`));
  }
  const blob = new Blob([rows.join("\n")], { type: "text/csv" });
  const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: "candidates_sample.csv" });
  a.click();
}

function downloadSampleExcel(templates = [], programs = []) {
  const programName = programs[0]?.name || "NIAT";
  const sampleTemplates = templates.slice(0, 2).map(t => t.name);
  const templatesCell = sampleTemplates.length ? sampleTemplates.join("|") : "";
  const rows = [
    { uid: "STU-2024-001", name: "John Doe", phone: "+91 98765 43210", email: "john.doe@example.com", program: programName, templates: templatesCell, resumeLink: "https://drive.google.com/file/sample", notes: "Strong candidate" },
    { uid: "STU-2024-002", name: "Jane Smith", phone: "+91 98765 43211", email: "jane.smith@example.com", program: "", templates: "", resumeLink: "", notes: "" },
  ];
  const header = ["uid", "name", "phone", "email", "program", "templates", "resumeLink", "notes"];
  const ws = XLSX.utils.json_to_sheet(rows, { header });
  ws["!cols"] = [{ wch: 16 }, { wch: 20 }, { wch: 18 }, { wch: 28 }, { wch: 14 }, { wch: 48 }, { wch: 36 }, { wch: 24 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Candidates");
  // Second sheet, purely a reference — every template name currently in
  // the system to copy-paste from, kept out of the main data sheet so it
  // can never be mistaken for (or accidentally re-imported as) a row.
  if (templates.length) {
    const programNameById = new Map(programs.map(p => [p.id, p.name]));
    const refRows = templates.map(t => ({ "Template Name": t.name, "Program": t.program ? (programNameById.get(t.program) || t.program) : "" }));
    const refWs = XLSX.utils.json_to_sheet(refRows, { header: ["Template Name", "Program"] });
    refWs["!cols"] = [{ wch: 40 }, { wch: 20 }];
    XLSX.utils.book_append_sheet(wb, refWs, "Available Templates");
  }
  XLSX.writeFile(wb, "candidates_sample.xlsx");
}

// A candidate's LATEST interview for one template, plus which attempt
// number it represents — same "only a COMPLETED interview advances the
// count" rule the admin Interviews page's own attempt labeling already
// uses (see attemptLabelByInterviewId there), so the two never disagree.
// No interviews at all for this template yet -> "not_started".
async function getLatestTemplateStatus(candidateId, templateId) {
  const list = await getInterviewsForCandidateTemplate(candidateId, templateId).catch(() => []);
  if (!list.length) return { status: "not_started", attemptNumber: 1, note: "", attemptsUsed: 0, noShowCount: 0, cancelCount: 0 };
  const sorted = [...list].sort(compareByInterviewDate);
  let n = 1, attemptNumber = 1, status = sorted[0].status, latest = sorted[0];
  let attemptsUsed = 0, noShowCount = 0, cancelCount = 0;
  for (const iv of sorted) {
    attemptNumber = n;
    status = iv.status;
    latest = iv;
    // Same three tallies the student dashboard itself counts against its
    // limits (api/sso-handler.js) — completed advances both the attempt
    // number AND the attempts-used count; no-show/candidate-cancelled
    // never advance the attempt number (a retry of the same attempt) but
    // still count toward their own separate limits.
    if (iv.status === "completed") { n++; attemptsUsed++; }
    else if (iv.status === "no_show") noShowCount++;
    else if (iv.status === "cancelled" && iv.cancelledBy === "candidate") cancelCount++;
  }
  return { status, attemptNumber, note: timelineDetail(latest, "admin"), attemptsUsed, noShowCount, cancelCount };
}

// Every assigned template's latest status for one candidate, fetched in
// parallel — the thing the Status column and the Status filter both
// ultimately need. Bounded by how many templates a candidate actually has
// (almost always 1-3), not by the candidate list size.
async function getCandidateTemplateStatuses(candidate, templatesById) {
  const assignedIds = candidate.templateIds || [];
  const results = await Promise.all(assignedIds.map(tid => getLatestTemplateStatus(candidate.id, tid)));
  return assignedIds.map((tid, i) => {
    const template = templatesById.get(tid);
    return {
      templateId: tid,
      templateName: template?.name || tid,
      ...results[i],
      ...computeBlocked(template, tid, candidate, results[i]),
    };
  });
}

// Same "only a COMPLETED interview advances the attempt count" rule as
// getLatestTemplateStatus above, computed for every (candidateId,
// templateId) pair found in one already-fetched interview list — O(n) in
// memory instead of one Firestore read per candidate. Keyed by
// "${candidateId}|${templateId}". Paired with getInterviewsForTemplates
// (api/interviews.ts), which fetches every interview across a set of
// templates in a handful of chunked queries regardless of how many
// candidates are assigned to them — this is what lets the Status
// filter/column/export scale with template count (bounded, tens not
// thousands) instead of candidate count, where the old one-query-per-
// candidate approach needed a hard cap (BULK_STATUS_CANDIDATE_CAP) and
// silently only checked whatever was already cached once a list exceeded
// it — which is why e.g. filtering by "No Show" on the unscoped "All" tab
// could show far fewer matches than actually existed.
function computeLatestStatusByPair(interviews) {
  const byPair = new Map();
  interviews.forEach(iv => {
    if (!iv.candidateId || !iv.templateId) return;
    const key = `${iv.candidateId}|${iv.templateId}`;
    if (!byPair.has(key)) byPair.set(key, []);
    byPair.get(key).push(iv);
  });
  const result = new Map();
  byPair.forEach((list, key) => {
    const sorted = [...list].sort(compareByInterviewDate);
    let n = 1, attemptNumber = 1, status = sorted[0].status, latest = sorted[0];
    let attemptsUsed = 0, noShowCount = 0, cancelCount = 0;
    for (const iv of sorted) {
      attemptNumber = n;
      status = iv.status;
      latest = iv;
      if (iv.status === "completed") { n++; attemptsUsed++; }
      else if (iv.status === "no_show") noShowCount++;
      else if (iv.status === "cancelled" && iv.cancelledBy === "candidate") cancelCount++;
    }
    // Reuses the exact same "who/why" wording CandidateTimeline/the
    // admin History modal already show (Cancelled by Admin/Interviewer/
    // Candidate — "reason", declined, dropped off, etc.) rather than a
    // second, differently-worded summary of the same fields.
    result.set(key, { status, attemptNumber, note: timelineDetail(latest, "admin"), attemptsUsed, noShowCount, cancelCount });
  });
  return result;
}

// Same output shape as getCandidateTemplateStatuses above, but reads from
// an already-computed bulk pair map (computeLatestStatusByPair) instead of
// making its own Firestore calls.
function statusesFromBulkPairMap(candidate, templatesById, pairMap) {
  const assignedIds = candidate.templateIds || [];
  return assignedIds.map(tid => {
    const found = pairMap.get(`${candidate.id}|${tid}`);
    const template = templatesById.get(tid);
    const counts = found || { attemptsUsed: 0, noShowCount: 0, cancelCount: 0 };
    return {
      templateId: tid,
      templateName: template?.name || tid,
      status: found?.status || "not_started",
      attemptNumber: found?.attemptNumber || 1,
      note: found?.note || "",
      ...computeBlocked(template, tid, candidate, counts),
    };
  });
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function CandidatesPage() {
  const { currentUser } = useAuth();
  const queryClient = useQueryClient();
  const { data: programs   = [] } = usePrograms();
  const { data: templates  = [] } = useTemplates();
  const [activeProgram,  setActiveProgram]  = useState("all");
  const [search,         setSearch]         = useState("");
  const [showArchived,   setShowArchived]   = useState(false);
  const [showModal,  setShowModal]  = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [form,       setForm]       = useState(EMPTY);
  const [saving,     setSaving]     = useState(false);
  const [toast,      setToast]      = useState(null);
  const [showCSV,    setShowCSV]    = useState(false);
  const [attemptsTarget, setAttemptsTarget] = useState(null);
  const [historyTarget,  setHistoryTarget]  = useState(null);

  // Template (multi), per-template-status (multi), and Date Added (range)
  // filters — all need the real full candidate list to filter against (not
  // just the scoped "fresh 10" page), same as search/Archived/Unassigned
  // already do. Date Added filters on candidate.createdAt — when a
  // candidate's own record was added/imported, not any interview date —
  // for checking the status of a specific upload batch.
  const [filterTemplateIds, setFilterTemplateIds] = useState([]);
  const [filterStatuses,    setFilterStatuses]    = useState([]);
  const [filterDateFrom,    setFilterDateFrom]    = useState("");
  const [filterDateTo,      setFilterDateTo]      = useState("");
  const templatesById = useMemo(() => new Map(templates.map(t => [t.id, t])), [templates]);
  // Latest-attempt status per candidate, keyed by candidate id — a Map of
  // candidateId -> the array getCandidateTemplateStatuses returns. Two
  // distinct populations feed this: the cheap per-page fetch (always, for
  // whatever's actually on screen) and the bounded bulk fetch (only while
  // the Status filter is active or Download is clicked), see the effects
  // below.
  const [statusByCandidateId, setStatusByCandidateId] = useState(new Map());
  const [statusLoading, setStatusLoading] = useState(false);
  const [downloading,   setDownloading]   = useState(false);
  const [downloadingHistory, setDownloadingHistory] = useState(false);

  // The default view only ever reads a handful of "fresh" candidates per
  // Program (see the pageItems state below) instead of the whole
  // collection. Searching, the Unassigned tab (no clean server-side query
  // for "no program"), the Archived toggle, CSV-import duplicate detection,
  // and the Template/Status filters all genuinely need the full list, so
  // only those trigger the real full-collection fetch — see useCandidates's
  // `enabled` param.
  const needsFullList = showArchived || activeProgram === "unassigned" || search.trim() !== "" || showCSV
    || filterTemplateIds.length > 0 || filterStatuses.length > 0 || !!filterDateFrom || !!filterDateTo;
  const { data: candidates = [], isLoading } = useCandidates(needsFullList);
  const programIds = useMemo(() => programs.map(p => p.id), [programs]);
  const { data: counts } = useCandidateCounts(programIds);

  // Server-scoped "fresh 10 per Program" page, with real page-number
  // navigation (see useCursorPagination) instead of an ever-growing
  // "Load more" list — honors the same index-building fallback the old
  // effect did (full fetch, filtered client-side, page 1 only) when the
  // (programs array-contains + createdAt) composite index isn't ready yet
  // (see firestore.indexes.json).
  const fetchCandidatesPage = useCallback(async (cursor) => {
    if (needsFullList) return { items: [], cursor: null, done: true };
    const programId = activeProgram === "all" ? null : activeProgram;
    try {
      return await getCandidatesPage(programId, cursor, 10);
    } catch (err) {
      const isIndexError = /index/i.test(err?.message || "");
      if (isIndexError && programId && !cursor) {
        const all = await getCandidates();
        const activeForProgram = all.filter(c => candidateHasProgram(c, programId) && c.archived !== true);
        return { items: activeForProgram.slice(0, 10), cursor: null, done: true };
      }
      throw err;
    }
  }, [needsFullList, activeProgram]);
  const candPager = useCursorPagination(fetchCandidatesPage, `${needsFullList}|${activeProgram}`, 10);
  const pageItems   = candPager.items;
  const pageLoading = candPager.loading;
  const pageError   = candPager.error;

  // Any create/archive/unarchive/delete/bulk-edit needs to update whichever
  // list is actually driving the current view — plus refresh the (cheap,
  // aggregation-based) tab counts. When the full candidates cache isn't
  // the active view, DON'T patch it with a partial update: React Query
  // would treat that write as "fresh" and skip refetching, so a later
  // search could silently miss real data. Invalidate instead, so it does
  // a real refetch the next time something (search, Archived, Unassigned,
  // CSV import) actually needs it.
  const patchFullList = (updater) => {
    if (needsFullList) {
      queryClient.setQueryData(QK.candidates, prev => updater(prev || []));
    } else {
      queryClient.invalidateQueries({ queryKey: QK.candidates });
    }
  };
  const invalidateCounts = () => queryClient.invalidateQueries({ queryKey: QK.candidateCounts });

  // Add/Edit Candidate modal — only templates belonging to one of the
  // selected Program(s) are selectable, so a candidate can't end up
  // assigned a template from a program they're not enrolled in. A
  // candidate in both Edge 2.0 and Academy sees the union of both
  // programs' templates here, not just one.
  const programTemplates = useMemo(
    () => templates.filter(t => (form.programs || []).includes(t.program)),
    [templates, form.programs]
  );

  // Bulk edit
  const [selected,      setSelected]      = useState(new Set());
  const [showBulk,      setShowBulk]      = useState(false);
  // Always additive — adds these program(s) to whatever each selected
  // candidate already has, never replaces their existing list. A separate
  // "replace" mode would risk silently dropping a program someone's
  // already enrolled in across a batch of candidates who don't all share
  // the same starting set.
  const [bulkPrograms,  setBulkPrograms]  = useState([]);
  const [bulkTemplates, setBulkTemplates] = useState([]);
  const [bulkSaving,    setBulkSaving]    = useState(false);

  // CSV import
  const [csvPreview,   setCsvPreview]   = useState([]);
  const [csvErrors,    setCsvErrors]    = useState([]);
  const [csvImporting, setCsvImporting] = useState(false);
  const [csvMode,      setCsvMode]      = useState(null); // null | "append" | "replace"
  const fileRef = useRef();


  const openNew  = () => { setEditTarget(null); setForm(EMPTY); setShowModal(true); };
  const openEdit = (c) => {
    setEditTarget(c);
    setForm({
      name: c.name, uid: c.uid || "", email: c.email || "",
      phone: c.phone || "", resumeLink: c.resumeLink || "", notes: c.notes || "",
      programs: getCandidateProgramIds(c), templateIds: c.templateIds || [],
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) return setToast({ message: "Name is required.", type: "error" });
    // Untrimmed whitespace here is invisible in the UI but breaks the exact
    // Firestore match (candidates.uid === the Forms/Accounts user_id) that
    // the SSO login flow depends on — a pasted UID with a trailing space
    // looks identical on screen yet silently never logs the student in.
    // Legacy single `program` field written alongside the new array, set to
    // the first of the selected programs — see candidatePrograms.ts for why
    // (Nudge/Settings/Inbound/the SSO backend haven't been migrated off it
    // yet and would otherwise see this candidate as having no program).
    const cleanForm = { ...form, uid: form.uid.trim(), name: form.name.trim(), email: form.email.trim(), phone: form.phone.trim(), program: form.programs[0] || "" };
    setSaving(true);
    try {
      if (editTarget) {
        await updateCandidate(editTarget.id, cleanForm);
        patchFullList(prev => prev.map(c => c.id === editTarget.id ? { ...c, ...cleanForm } : c));
        // pageItems (candPager.items) is a server-fetched cursor page, not
        // local state — there's no array to patch in place without also
        // invalidating the NEXT page's start cursor (computed from this
        // page's original contents), so a full reload of the current page
        // is the only correct way to reflect the edit there.
        if (!needsFullList) candPager.reload();
        setToast({ message: "Candidate updated." });
      } else {
        // Checked against Firestore directly, not whatever's in local
        // state — the default (no search, no archived) view never loads
        // the full candidate list, so a stale/empty local check would miss
        // an existing record here more often than not. See
        // findCandidateByUidOrEmail.
        const existing = await findCandidateByUidOrEmail(cleanForm.uid, cleanForm.email);
        if (existing) {
          const mergedTemplateIds = [...new Set([...(existing.templateIds || []), ...(cleanForm.templateIds || [])])];
          // Same merge as templateIds — adding a candidate who turns out to
          // already exist under a different program shouldn't silently
          // drop that program, it should add this new one alongside it.
          const mergedPrograms = [...new Set([...getCandidateProgramIds(existing), ...(cleanForm.programs || [])])];
          const fieldUpdates = { ...cleanForm, templateIds: mergedTemplateIds, programs: mergedPrograms, program: mergedPrograms[0] || "" };
          await updateCandidate(existing.id, fieldUpdates);
          patchFullList(prev => prev.map(c => c.id === existing.id ? { ...c, ...fieldUpdates } : c));
          if (!needsFullList) candPager.reload();
          queryClient.invalidateQueries({ queryKey: QK.candidates });
          setToast({ message: "A candidate with this email or UID already exists — updated their existing record instead of creating a duplicate." });
        } else {
          const createdAt = new Date().toISOString();
          const id = await createCandidate({ ...cleanForm, createdBy: currentUser.uid });
          const newCandidate = { id, ...cleanForm, createdAt, createdBy: currentUser.uid };
          patchFullList(prev => [newCandidate, ...prev]);
          // Only reload the scoped page view if it actually belongs on the
          // tab currently being viewed — reloads page 1 fresh (cursor pages
          // are ordered newest-first, so a brand-new candidate shows up
          // there; it won't retroactively appear on a later page already
          // being viewed, same inherent cursor-pagination limitation
          // documented in useCursorPagination).
          if (!needsFullList && (activeProgram === "all" || (form.programs || []).includes(activeProgram))) {
            candPager.reload();
          }
          setToast({ message: "Candidate added." });
        }
      }
      invalidateCounts();
      setShowModal(false);
    } catch (e) { setToast({ message: e.message, type: "error" }); }
    setSaving(false);
  };

  const handleDelete = async (c) => {
    if (!confirm(`Delete ${c.name}? This cannot be undone.`)) return;
    await deleteCandidate(c.id);
    patchFullList(prev => prev.filter(x => x.id !== c.id));
    if (!needsFullList) candPager.reload();
    invalidateCounts();
    setToast({ message: "Candidate deleted." });
  };

  const handleArchive = async (c) => {
    await archiveCandidate(c.id);
    patchFullList(prev => prev.map(x => x.id === c.id ? { ...x, archived: true, archivedAt: new Date().toISOString() } : x));
    // The scoped view is active-only, so an archived candidate drops out of it.
    if (!needsFullList) candPager.reload();
    invalidateCounts();
    setToast({ message: "Candidate archived." });
  };

  const handleUnarchive = async (c) => {
    await unarchiveCandidate(c.id);
    patchFullList(prev => prev.map(x => x.id === c.id ? { ...x, archived: false, archivedAt: null } : x));
    invalidateCounts();
    setToast({ message: "Candidate restored to active." });
  };

  const handleSwapNameUID = async (c) => {
    await updateCandidate(c.id, { name: c.uid, uid: c.name });
    patchFullList(prev => prev.map(x => x.id === c.id ? { ...x, name: c.uid, uid: c.name } : x));
    if (!needsFullList) candPager.reload();
    setToast({ message: "Name and UID fixed." });
  };

  const handleBulkSave = async () => {
    if (!bulkPrograms.length && bulkTemplates.length === 0) {
      setToast({ message: "Set at least a program or template.", type: "error" }); return;
    }
    setBulkSaving(true);
    try {
      // Programs are added to each candidate's own existing set — unlike
      // templateIds just below (which stays the pre-existing REPLACE
      // behavior for this bulk action), a shared "same updates object for
      // everyone" approach would silently wipe out whatever program(s) a
      // selected candidate already had that aren't in bulkPrograms. Looked
      // up from `rows` (the currently-rendered list selection checkboxes
      // come from), not re-fetched.
      const updatesById = new Map([...selected].map(id => {
        const existing = rows.find(c => c.id === id);
        const updates = {};
        if (bulkPrograms.length) {
          const merged = [...new Set([...getCandidateProgramIds(existing), ...bulkPrograms])];
          updates.programs = merged;
          updates.program = merged[0] || "";
        }
        if (bulkTemplates.length) updates.templateIds = bulkTemplates;
        return [id, updates];
      }));
      await Promise.all([...updatesById.entries()].map(([id, updates]) => updateCandidate(id, updates)));
      patchFullList(prev => prev.map(c => updatesById.has(c.id) ? { ...c, ...updatesById.get(c.id) } : c));
      if (!needsFullList) candPager.reload();
      invalidateCounts();
      setToast({ message: `Updated ${selected.size} candidate${selected.size !== 1 ? "s" : ""}.` });
      setShowBulk(false);
      setSelected(new Set());
      setBulkPrograms([]); setBulkTemplates([]);
    } catch (e) { setToast({ message: e.message, type: "error" }); }
    setBulkSaving(false);
  };

  const toggleSelect = (id) => setSelected(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  // "Select all" only ever selects what's currently loaded/visible — the
  // scoped page items in the default view, or the full filtered list once
  // search/Archived/Unassigned has pulled everything in.
  const toggleAll = () => {
    const target = needsFullList ? filtered : pageItems;
    if (selected.size === target.length) setSelected(new Set());
    else setSelected(new Set(target.map(c => c.id)));
  };

  const toggleBulkTemplate = (tid) => setBulkTemplates(prev =>
    prev.includes(tid) ? prev.filter(id => id !== tid) : [...prev, tid]
  );

  const findExisting = (row) =>
    candidates.find(c =>
      (row.email && c.email?.toLowerCase() === row.email.toLowerCase()) ||
      (row.uid   && c.uid?.toLowerCase()   === row.uid.toLowerCase())
    );

  const handleCSVFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const { rows, errors } = parseCandidatesCSV(ev.target.result);
      setCsvPreview(rows); setCsvErrors(errors); setCsvMode(null);
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const handleCSVImport = async (mode) => {
    if (!csvPreview.length) return;
    setCsvImporting(true);
    const programMap  = new Map(programs.map(p  => [p.name.toLowerCase(),  p.id]));
    const templateMap = new Map(templates.map(t => [t.name.toLowerCase(), t.id]));

    // The same candidate can legitimately appear across many rows — one row
    // per template/round for them (e.g. row 5 and row 50 are the same
    // student, each naming a different template) — meant to collapse into
    // ONE candidate with every template named for them, not a duplicate per
    // row. Grouped by uid/email BEFORE processing, so this also sidesteps a
    // real race: without grouping, the concurrent Promise.all below reads
    // `candidates` as a single stale snapshot, so two rows for a BRAND NEW
    // candidate would each fail to find the other's not-yet-created doc and
    // create two separate candidates; two rows for an EXISTING candidate
    // would each overwrite templateIds with just their own one row's
    // template, with whichever finishes last silently winning.
    const groups = new Map();
    const order = [];
    csvPreview.forEach((row, i) => {
      const key = (row.uid && row.uid.toLowerCase()) || (row.email && row.email.toLowerCase()) || `__row_${i}`;
      if (!groups.has(key)) { groups.set(key, { ...row, templateNames: [], programNames: [] }); order.push(key); }
      const g = groups.get(key);
      (row.templateNames || []).forEach(name => { if (!g.templateNames.includes(name)) g.templateNames.push(name); });
      // Programs merge the same way templates do — a later row for the same
      // candidate naming a different program ADDS it, never replaces the
      // one an earlier row already named.
      (row.programNames || []).forEach(name => { if (!g.programNames.includes(name)) g.programNames.push(name); });
      // First non-blank value for every other field wins — a later row for
      // the same candidate in a templates-only follow-up CSV typically
      // leaves name/phone/etc. blank, which must never blank out a value
      // an earlier row for that same person already supplied.
      for (const f of ["name", "uid", "email", "phone", "resumeLink", "notes"]) {
        if (!g[f] && row[f]) g[f] = row[f];
      }
    });

    const results = await Promise.all(order.map(async (key) => {
      const row = groups.get(key);
      try {
        const { programNames, templateNames, ...rest } = row;
        const resolvedPrograms = [...new Set(
          programNames.map(name => programMap.get(name.toLowerCase())).filter(Boolean)
        )];
        const newTemplateIds = [...new Set(
          templateNames.map(name => templateMap.get(name.toLowerCase())).filter(Boolean)
        )];
        const existing = findExisting(row);
        if (existing) {
          if (mode !== "replace") return { type: "skipped" };
          // Templates and Programs both always MERGE onto whatever the
          // candidate already has — this is explicitly an "assign more to
          // existing students" pass, never a wipe of what a prior import
          // (or the admin, by hand) already assigned. Every other field
          // only overwrites when the CSV actually supplied a value, so a
          // templates-only follow-up CSV (blank name/phone/program columns)
          // can't blank out real data on the existing record.
          const mergedTemplateIds = [...new Set([...(existing.templateIds || []), ...newTemplateIds])];
          const mergedPrograms = [...new Set([...getCandidateProgramIds(existing), ...resolvedPrograms])];
          const fieldUpdates = {};
          for (const [k, v] of Object.entries(rest)) if (v) fieldUpdates[k] = v;
          // Also keep the legacy single `program` field pointed at the
          // first of the set — Nudge's filters, Settings' delete-program
          // cleanup, Inbound, and the SSO backend still read it directly
          // and haven't been migrated to `programs` yet, so this keeps
          // them working (seeing one of this candidate's programs) rather
          // than silently going blank for anyone touched by this import.
          if (mergedPrograms.length) { fieldUpdates.programs = mergedPrograms; fieldUpdates.program = mergedPrograms[0]; }
          fieldUpdates.templateIds = mergedTemplateIds;
          await updateCandidate(existing.id, fieldUpdates);
          return { type: "updated", row: { id: existing.id, ...existing, ...fieldUpdates } };
        } else {
          const payload = { ...rest, programs: resolvedPrograms, program: resolvedPrograms[0] || "", templateIds: newTemplateIds };
          const createdAt = new Date().toISOString();
          const id = await createCandidate({ ...payload, createdBy: currentUser.uid });
          return { type: "created", row: { id, ...payload, createdAt, createdBy: currentUser.uid } };
        }
      } catch { return { type: "skipped" }; }
    }));

    const newRows    = results.filter(r => r.type === "created").map(r => r.row);
    const updatedRows = results.filter(r => r.type === "updated").map(r => r.row);
    const created = newRows.length;
    const updated = updatedRows.length;
    const skipped = results.filter(r => r.type === "skipped").length;

    patchFullList(prev => {
      const updatedMap = new Map(updatedRows.map(r => [r.id, r]));
      const merged = prev.map(c => updatedMap.has(c.id) ? { ...c, ...updatedMap.get(c.id) } : c);
      return [...newRows, ...merged];
    });
    invalidateCounts();
    // Closing the modal (below) drops `showCSV` out of needsFullList, which
    // re-triggers the scoped page fetch and naturally picks up any newly
    // imported/updated rows for the active tab.
    setCsvImporting(false); setShowCSV(false); setCsvPreview([]); setCsvErrors([]); setCsvMode(null);
    const parts = [];
    if (created) parts.push(`${created} added`);
    if (updated) parts.push(`${updated} updated`);
    if (skipped) parts.push(`${skipped} skipped`);
    setToast({ message: parts.join(", ") + "." });
  };

  const closeCSV = () => { setShowCSV(false); setCsvPreview([]); setCsvErrors([]); setCsvMode(null); };

  const programNameMap = useMemo(
    () => new Map(programs.map(p => [p.id, p.name])),
    [programs]
  );
  const programName = useCallback(
    (id) => programNameMap.get(id) || id || "—",
    [programNameMap]
  );

  // Header/tab counts come from the cheap aggregation query (useCandidateCounts)
  // rather than the loaded `candidates` array, so they stay accurate even
  // when only a handful of candidates have actually been fetched.
  const archivedCount = counts?.archived ?? 0;
  const tabCounts = useMemo(() => {
    if (!counts) return null;
    // "Unassigned" is derived by subtraction (total minus every program's
    // own count) rather than its own query, as a cheap approximation —
    // this badge NUMBER can now undercount slightly once candidates with
    // MULTIPLE programs exist (they're counted once per program they're
    // in, inflating sumTotal), but the actual Unassigned tab's candidate
    // LIST is always exactly correct, since that's filtered client-side
    // from real data (see the `filtered` useMemo above), not from this
    // subtraction. Tightening this further would need its own dedicated
    // "programs is empty" count query — not done here, low priority since
    // it only affects one sidebar number, not any real data.
    const sumTotal    = programs.reduce((s, p) => s + (counts.byProgram[p.id]?.total    || 0), 0);
    const sumArchived = programs.reduce((s, p) => s + (counts.byProgram[p.id]?.archived || 0), 0);
    const unassignedTotal    = Math.max(0, counts.total    - sumTotal);
    const unassignedArchived = Math.max(0, counts.archived - sumArchived);
    const pick = (total, archived) => showArchived ? archived : total - archived;
    return {
      all: pick(counts.total, counts.archived),
      unassigned: pick(unassignedTotal, unassignedArchived),
      byProgram: Object.fromEntries(programs.map(p => {
        const pc = counts.byProgram[p.id] || { total: 0, archived: 0 };
        return [p.id, pick(pc.total, pc.archived)];
      })),
    };
  }, [counts, programs, showArchived]);
  const workingSet = useMemo(
    () => candidates.filter(c => (c.archived === true) === showArchived),
    [candidates, showArchived]
  );

  // The "All Templates" filter used to list every template system-wide
  // regardless of which Program tab was active — picking the Academy tab
  // still showed NIAT/Edge-only templates mixed in, confusing since most
  // of them could never match anyone on this tab. Scoped to the active
  // Program's own templates now; "All"/"Unassigned" keep seeing everything,
  // since neither of those narrows by a single program.
  const templateOptionsForTab = useMemo(() => {
    if (activeProgram === "all" || activeProgram === "unassigned") return templates;
    return templates.filter(t => t.program === activeProgram);
  }, [templates, activeProgram]);

  // A search query bypasses the active Program tab — otherwise a candidate
  // on a different tab than the one you're viewing silently returns zero
  // results, which reads as "search is broken" rather than "search worked,
  // but you're on the wrong tab."
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return workingSet.filter(c => {
      if (filterTemplateIds.length && !(c.templateIds || []).some(tid => filterTemplateIds.includes(tid))) return false;
      // createdAt is a full ISO timestamp; comparing it against a plain
      // YYYY-MM-DD bound as a string still sorts correctly (ISO 8601's
      // lexical order matches chronological order), and filterDateTo is
      // treated as inclusive of the whole day by comparing against its
      // date-only prefix.
      if (filterDateFrom && (!c.createdAt || c.createdAt < filterDateFrom)) return false;
      if (filterDateTo && (!c.createdAt || c.createdAt.slice(0, 10) > filterDateTo)) return false;
      if (q) {
        return (
          c.name?.toLowerCase().includes(q) ||
          c.uid?.toLowerCase().includes(q) ||
          c.email?.toLowerCase().includes(q)
        );
      }
      if (activeProgram === "unassigned" && getCandidateProgramIds(c).length) return false;
      // A multi-program candidate correctly shows up under EVERY one of
      // their program tabs now, not just one — the tab counts no longer
      // have to sum to the "All" total for that reason (see tabCounts).
      if (activeProgram !== "all" && activeProgram !== "unassigned" && !candidateHasProgram(c, activeProgram)) return false;
      return true;
    });
  }, [workingSet, activeProgram, search, filterTemplateIds, filterDateFrom, filterDateTo]);

  // Status can only be checked once per-template latest-status data has
  // actually loaded for these candidates (statusByCandidateId) — see the
  // bulk-fetch effect below, which populates it whenever any status is
  // selected. "Matches"
  // means at least one of the candidate's assigned templates is currently
  // at one of the selected statuses (OR across the selection), so picking
  // "No Interview Taken Yet" surfaces anyone who hasn't completed
  // everything they're assigned yet. NO_TEMPLATE_STATUS is its own pseudo-
  // status for a candidate with zero templates assigned at all — distinct
  // from "No Interview Taken Yet" (which means they DO have a template but
  // haven't started it). Without this bucket, such a candidate matched
  // none of the real statuses, so they counted toward the tab's total but
  // never toward any status count — which is exactly why summing every
  // status count came out lower than the program tab's own total.
  const statusFiltered = useMemo(() => {
    if (filterStatuses.length === 0) return filtered;
    return filtered.filter(c => {
      if (filterStatuses.includes(NO_TEMPLATE_STATUS) && (c.templateIds || []).length === 0) return true;
      const statuses = statusByCandidateId.get(c.id);
      // Once a Template filter is ALSO active, "Cancelled" must mean
      // cancelled on THAT template specifically — checking every assigned
      // template regardless of the Template filter (the old behavior)
      // surfaced candidates whose selected template was actually "No
      // Interview Taken Yet", just because some OTHER template of theirs
      // happened to be cancelled.
      const relevant = filterTemplateIds.length ? statuses?.filter(s => filterTemplateIds.includes(s.templateId)) : statuses;
      // BLOCKED_STATUS isn't a real interview status — it's the derived
      // "hit a limit" flag computeBlocked attaches to each entry.
      return relevant?.some(s => filterStatuses.includes(s.status) || (filterStatuses.includes(BLOCKED_STATUS) && s.blocked));
    });
  }, [filtered, filterStatuses, statusByCandidateId, filterTemplateIds]);

  const { paged: pagedCandidates, page: candPage, setPage: setCandPage, totalPages: candTotalPages, total: candTotal, pageSize: candPageSize } = usePagination(statusFiltered, 10);

  // Which list actually drives the table: the fully-loaded+filtered list
  // once search/Archived/Unassigned/Template/Status pulled everything in,
  // or the scoped "fresh 10 per Program" page otherwise.
  const rows = needsFullList ? pagedCandidates : pageItems;
  const selectAllTarget = needsFullList ? statusFiltered : pageItems;

  // Cheap, always-on: status for whatever's actually on screen right now
  // (~10 candidates), independent of whether the Status filter is engaged
  // — this is what the Status column itself renders from.
  const rowsKey = rows.map(c => c.id).join(",");
  useEffect(() => {
    if (!rows.length) return;
    let cancelled = false;
    const toFetch = rows.filter(c => !statusByCandidateId.has(c.id));
    if (!toFetch.length) return;
    Promise.all(toFetch.map(c => getCandidateTemplateStatuses(c, templatesById))).then(results => {
      if (cancelled) return;
      setStatusByCandidateId(prev => {
        const next = new Map(prev);
        toFetch.forEach((c, i) => next.set(c.id, results[i]));
        return next;
      });
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rowsKey]);

  // Bulk fetch over the Template/Program/search/Archived-narrowed `filtered`
  // set (not the whole collection) — runs any time that set is actually
  // loaded (needsFullList), not just once the Status filter is picked, so
  // the per-status counts in that dropdown (see statusCounts below) are
  // ready before the admin even opens it. Skips candidates already covered
  // by the cheap per-page fetch above. Scales with how many DISTINCT
  // templates are involved (getInterviewsForTemplates), not with how many
  // candidates are in `filtered` — so this covers the entire "All" tab
  // (1800+ candidates) in a handful of queries instead of one per
  // candidate, with nothing silently skipped.
  useEffect(() => {
    if (!needsFullList) return;
    const missing = filtered.filter(c => !statusByCandidateId.has(c.id));
    if (!missing.length) return;
    const neededTemplateIds = [...new Set(missing.flatMap(c => c.templateIds || []))];
    if (!neededTemplateIds.length) return;
    let cancelled = false;
    setStatusLoading(true);
    getInterviewsForTemplates(neededTemplateIds).then(interviews => {
      if (cancelled) return;
      const pairMap = computeLatestStatusByPair(interviews);
      setStatusByCandidateId(prev => {
        const next = new Map(prev);
        missing.forEach(c => next.set(c.id, statusesFromBulkPairMap(c, templatesById, pairMap)));
        return next;
      });
    }).catch(err => {
      if (cancelled) return;
      console.error("Bulk status fetch failed:", err);
      setToast({ message: `Couldn't load candidate statuses: ${err.message}`, type: "error" });
    }).finally(() => { if (!cancelled) setStatusLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needsFullList, filtered, templatesById]);

  // Per-status counts for the filter dropdown (e.g. "No Show (12)") — only
  // meaningful once every candidate in `filtered` has status data loaded
  // (see the effect above); while that's still in flight, options just
  // show their plain label.
  const statusCounts = useMemo(() => {
    if (!needsFullList || !filtered.length) return null;
    if (!filtered.every(c => statusByCandidateId.has(c.id))) return null;
    const counts = {};
    filtered.forEach(c => {
      if ((c.templateIds || []).length === 0) {
        counts[NO_TEMPLATE_STATUS] = (counts[NO_TEMPLATE_STATUS] || 0) + 1;
        return;
      }
      // Same Template-filter scoping as statusFiltered below — otherwise
      // this badge's own number (e.g. "Cancelled (6)") already counts
      // candidates cancelled on some OTHER template, before you even pick
      // a status, which is what made the result look wrong in the first
      // place.
      const statuses = statusByCandidateId.get(c.id) || [];
      const relevant = filterTemplateIds.length ? statuses.filter(s => filterTemplateIds.includes(s.templateId)) : statuses;
      const seen = new Set(relevant.map(s => s.status));
      seen.forEach(status => { counts[status] = (counts[status] || 0) + 1; });
      if (relevant.some(s => s.blocked)) counts[BLOCKED_STATUS] = (counts[BLOCKED_STATUS] || 0) + 1;
    });
    return counts;
  }, [needsFullList, filtered, statusByCandidateId, filterTemplateIds]);

  // Exports exactly what's currently filtered (Program/search/Archived/
  // Template/Status), not just the visible page. In the default scoped
  // view (needsFullList false — no search/filter active), `candidates`
  // itself is disabled/empty (see useCandidates's `enabled` param), so this
  // fetches the full list fresh rather than exporting nothing; it's then
  // scoped to the active Program tab (the only filter that can be live in
  // that branch — search/Archived/Template/Status all force needsFullList).
  // Status is included whenever it can actually be resolved — scales with
  // template count (getInterviewsForTemplates), not candidate count, so
  // there's no longer a size this has to fall back and skip it for.
  const handleDownload = async () => {
    setDownloading(true);
    let target = statusFiltered;
    if (!needsFullList) {
      try {
        const all = await getCandidates();
        target = all.filter(c => c.archived !== true && (activeProgram === "all" || candidateHasProgram(c, activeProgram)));
      } catch (e) {
        setToast({ message: `Couldn't load candidates to export: ${e.message}`, type: "error" });
        setDownloading(false);
        return;
      }
    }
    // Checking specific rows (the "Edit Selected" checkboxes) means "just
    // these", overriding whatever's filtered — same as Edit Selected
    // itself only ever touches the checked rows, not the whole filtered set.
    if (selected.size > 0) target = target.filter(c => selected.has(c.id));
    const missing = target.filter(c => !statusByCandidateId.has(c.id));
    let statusMap = statusByCandidateId;
    if (missing.length) {
      try {
        const neededTemplateIds = [...new Set(missing.flatMap(c => c.templateIds || []))];
        const interviews = neededTemplateIds.length ? await getInterviewsForTemplates(neededTemplateIds) : [];
        const pairMap = computeLatestStatusByPair(interviews);
        statusMap = new Map(statusByCandidateId);
        missing.forEach(c => statusMap.set(c.id, statusesFromBulkPairMap(c, templatesById, pairMap)));
        setStatusByCandidateId(statusMap);
      } catch (e) {
        setToast({ message: `Downloaded without Status — couldn't load it (${e.message}).`, type: "error" });
      }
    }

    // When a Template filter is active, every column below should only
    // ever talk about the selected template(s) — a candidate assigned to
    // 5 templates but filtered down to just "DSA" was still showing every
    // one of their 5 templates/statuses/notes crammed together, which is
    // exactly the "so confusing" complaint: the Templates column already
    // names the template, so repeating "TemplateName: " in Status/Note
    // once there's only one relevant template is pure noise, not clarity.
    const relevantTemplateIds = (c) => {
      const ids = c.templateIds || [];
      return filterTemplateIds.length ? ids.filter(tid => filterTemplateIds.includes(tid)) : ids;
    };

    const statusText = (c) => {
      const relevant = relevantTemplateIds(c);
      const statuses = (statusMap.get(c.id) || []).filter(s => relevant.includes(s.templateId));
      if (!statuses.length) return "";
      const bare = relevant.length === 1;
      return statuses.map(s =>
        `${bare ? "" : `${s.templateName}: `}${s.attemptNumber > 1 ? `${ordinalLabel(s.attemptNumber)} - ` : ""}${STATUS_LABELS[s.status] || s.status}`
      ).join(" | ");
    };
    // Same per-template breakdown as Status, but the "who/why" behind it
    // (cancelled by admin/interviewer/candidate + their reason, declined,
    // dropped off, etc.) — statusesFromBulkPairMap/getLatestTemplateStatus
    // both already attach this via timelineDetail, so it's just surfaced
    // here, not recomputed. Left blank (not "no reason") when the
    // relevant template has no note at all — nothing to show. When blocked,
    // leads with WHY (the limit that was hit) ahead of the latest
    // interview's own note, since that's the actually useful fact here.
    const noteText = (c) => {
      const relevant = relevantTemplateIds(c);
      const statuses = (statusMap.get(c.id) || []).filter(s => relevant.includes(s.templateId) && (s.note || s.blocked));
      if (!statuses.length) return "";
      const bare = relevant.length === 1;
      return statuses.map(s => {
        const text = s.blocked ? (s.note ? `${s.blockReason} — ${s.note}` : s.blockReason) : s.note;
        return bare ? text : `${s.templateName}: ${text}`;
      }).join(" | ");
    };

    const exportRows = target.map(c => ({
      UID: isSwapped(c) ? c.name : (c.uid || ""),
      Name: isSwapped(c) ? c.uid : (c.name || ""),
      Email: c.email || "",
      Phone: c.phone || "",
      Program: getCandidateProgramIds(c).map(programName).join(" | "),
      Templates: relevantTemplateIds(c).map(tid => templatesById.get(tid)?.name).filter(Boolean).join(" | "),
      Status: statusText(c),
      Note: noteText(c),
    }));
    const header = ["UID", "Name", "Email", "Phone", "Program", "Templates", "Status", "Note"];
    const ws = XLSX.utils.json_to_sheet(exportRows, { header });
    ws["!cols"] = header.map(h => ({ wch: h === "Status" || h === "Note" ? 50 : h === "Templates" ? 36 : h === "UID" ? 16 : 22 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Candidates");
    XLSX.writeFile(wb, `candidates_${new Date().toISOString().slice(0, 10)}.xlsx`);
    setDownloading(false);
  };

  // Same filtered candidate set as handleDownload above — ONE ROW PER
  // CANDIDATE (not per attempt, which made a single student's multiple
  // attempts read as unrelated rows scattered through the file) — the
  // full chronological history lives in one "History" cell per candidate,
  // grouped by template, oldest attempt first within each. Reuses
  // buildCandidateTimeline (same data prep as the per-candidate History
  // modal) and timelineDetail (same who/why wording as the Note column
  // above), fetched in one batch across every template any target
  // candidate is assigned to (getInterviewsForTemplates) rather than one
  // Firestore read per candidate.
  const handleDownloadHistory = async () => {
    setDownloadingHistory(true);
    try {
      let historyTargets = statusFiltered;
      if (!needsFullList) {
        const all = await getCandidates();
        historyTargets = all.filter(c => c.archived !== true && (activeProgram === "all" || candidateHasProgram(c, activeProgram)));
      }
      // Checking specific rows means "just these" — same override as
      // handleDownload above.
      if (selected.size > 0) historyTargets = historyTargets.filter(c => selected.has(c.id));
      if (!historyTargets.length) {
        setToast({ message: "No candidates match the current selection/filters.", type: "info" });
        setDownloadingHistory(false);
        return;
      }

      const allTemplateIds = [...new Set(historyTargets.flatMap(c => c.templateIds || []))];
      const interviews = allTemplateIds.length ? await getInterviewsForTemplates(allTemplateIds) : [];
      const byCandidateId = new Map();
      interviews.forEach(iv => {
        if (!iv.candidateId) return;
        if (!byCandidateId.has(iv.candidateId)) byCandidateId.set(iv.candidateId, []);
        byCandidateId.get(iv.candidateId).push(iv);
      });

      const rows = historyTargets.map(c => {
        const timeline = buildCandidateTimeline(byCandidateId.get(c.id) || [])
          // Same scoping as handleDownload's Status/Note columns — a
          // Template filter means ONLY that template's history, not every
          // template this candidate happens to also be assigned to.
          .filter(iv => !filterTemplateIds.length || filterTemplateIds.includes(iv.templateId));

        const byTemplate = new Map();
        timeline.forEach(iv => {
          const key = iv.templateId || "(no template)";
          if (!byTemplate.has(key)) byTemplate.set(key, []);
          byTemplate.get(key).push(iv);
        });

        const lines = [];
        byTemplate.forEach((entries, tid) => {
          const name = templatesById.get(tid)?.name || tid;
          [...entries].sort((a, b) => a.attemptNumber - b.attemptNumber).forEach(iv => {
            const date = iv.scheduledDate
              ? `${formatDate(iv.scheduledDate)}${iv.scheduledTime ? ` ${formatTimeLabel(iv.scheduledTime)}` : ""}`
              : "no date";
            lines.push(`${name} — ${ordinalLabel(iv.attemptNumber)} attempt (${date}): ${timelineDetail(iv, "admin")}`);
          });
        });

        return {
          UID: isSwapped(c) ? c.name : (c.uid || ""),
          Name: isSwapped(c) ? c.uid : (c.name || ""),
          Email: c.email || "",
          History: lines.length ? lines.join("\n") : "No interview history",
        };
      });

      const header = ["UID", "Name", "Email", "History"];
      const ws = XLSX.utils.json_to_sheet(rows, { header });
      ws["!cols"] = header.map(h => ({ wch: h === "History" ? 90 : h === "UID" ? 16 : 22 }));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "History");
      XLSX.writeFile(wb, `candidate_history_${new Date().toISOString().slice(0, 10)}.xlsx`);
    } catch (e) {
      setToast({ message: `Couldn't download history: ${e.message}`, type: "error" });
    }
    setDownloadingHistory(false);
  };

  const inputCls = "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-colors";
  const labelCls = "block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1";
  const setField = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const toggleFormTemplate = (tid) => setField("templateIds",
    form.templateIds.includes(tid) ? form.templateIds.filter(id => id !== tid) : [...form.templateIds, tid]
  );

  return (
    <div className="p-4 sm:p-6 md:p-8">
      <motion.div initial="hidden" animate="visible" variants={fadeUp} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-gray-900 tracking-tight">Candidates</h1>
          <p className="text-sm text-gray-500 mt-1">
            {counts ? `${counts.total - counts.archived} active` : "…"}{archivedCount > 0 && ` · ${archivedCount} archived`}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {selected.size > 0 && (
            <Button variant="secondary" icon={Users} onClick={() => { setBulkPrograms([]); setBulkTemplates([]); setShowBulk(true); }}>
              Edit Selected ({selected.size})
            </Button>
          )}
          <Button variant="secondary" icon={Upload} onClick={() => { setCsvPreview([]); setCsvErrors([]); setShowCSV(true); }}>
            Import CSV
          </Button>
          <Button variant="primary" icon={Plus} onClick={openNew}>
            Add Candidate
          </Button>
        </div>
      </motion.div>

      {/* ── Program Tabs ── */}
      {programs.length > 0 && (
        <motion.div initial="hidden" animate="visible" variants={fadeUp} custom={1} className="flex border-b border-gray-200 mb-5 overflow-x-auto scrollbar-thin">
          {[
            { id: "all",        label: "All",        count: tabCounts ? tabCounts.all : "…" },
            ...programs.map(p => ({ id: p.id, label: p.name, count: tabCounts ? tabCounts.byProgram[p.id] : "…" })),
            { id: "unassigned", label: "Unassigned", count: tabCounts ? tabCounts.unassigned : "…" },
          ].map(tab => ({
            ...tab,
            // Once a Status/Template/Date filter narrows the active tab's
            // own list, its badge should track that — not stay frozen at
            // the whole-tab total while the table below shows far fewer.
            // A search query bypasses the active tab entirely (see the
            // `filtered` useMemo's own comment), so it's excluded here —
            // candTotal wouldn't mean "this tab" while that's active.
            count: (tab.id === activeProgram && !search.trim() &&
              (filterTemplateIds.length > 0 || filterStatuses.length > 0 || !!filterDateFrom || !!filterDateTo))
              ? candTotal : tab.count,
          })).map(tab => (
            <button key={tab.id} onClick={() => { setActiveProgram(tab.id); setCandPage(1); }}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px whitespace-nowrap flex-shrink-0 transition-colors ${
                activeProgram === tab.id
                  ? "border-brand-600 text-brand-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}>
              {tab.label}
              <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded-full ${
                activeProgram === tab.id ? "bg-brand-100 text-brand-700" : "bg-gray-100 text-gray-500"
              }`}>{tab.count}</span>
            </button>
          ))}
        </motion.div>
      )}

      <motion.div initial="hidden" animate="visible" variants={fadeUp} custom={2} className="flex items-center gap-3 mb-5 flex-wrap">
        <div className="relative w-full max-w-sm">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input type="text" placeholder="Search by name, UID, or email…" value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full border border-gray-200 rounded-full pl-9 pr-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-colors" />
        </div>
        <div className="w-52">
          <SkillsSelect
            skills={templateOptionsForTab.map(t => ({ id: t.id, name: t.name }))}
            value={filterTemplateIds}
            onChange={ids => { setFilterTemplateIds(ids); setCandPage(1); }}
            placeholder="All Templates"
            searchPlaceholder="Search templates…"
          />
        </div>
        <div className="w-56">
          <SkillsSelect
            skills={[
              ...["not_started", "scheduled", "completed", "partially_completed", "cancelled", "declined", "no_show", "dropped_off"].map(k => ({
                id: k, name: `${STATUS_LABELS[k]}${statusCounts ? ` (${statusCounts[k] || 0})` : ""}`,
              })),
              // Its own bucket, not folded into "No Interview Taken Yet" —
              // that means "has a template, hasn't booked it"; this means
              // "has no template at all" (e.g. uploaded but never
              // assigned a round). Keeping them separate is also what lets
              // every status count add up to the tab's own total.
              { id: NO_TEMPLATE_STATUS, name: `No Templates Assigned${statusCounts ? ` (${statusCounts[NO_TEMPLATE_STATUS] || 0})` : ""}` },
              // Hit their attempt/no-show/cancellation limit on at least
              // one (Template-filter-scoped) assigned template — the Note
              // column shows exactly which limit and the count once this
              // is picked.
              { id: BLOCKED_STATUS, name: `Blocked${statusCounts ? ` (${statusCounts[BLOCKED_STATUS] || 0})` : ""}` },
            ]}
            value={filterStatuses}
            onChange={ids => { setFilterStatuses(ids); setCandPage(1); }}
            placeholder="Any Status"
            searchPlaceholder="Search statuses…"
          />
        </div>
        {/* Date Added — candidate.createdAt, i.e. when the record itself
           was added/imported, not any interview date. Lets an admin pull
           up just the batch from one CSV upload and check its statuses. */}
        <div className="flex items-center gap-1.5">
          <DatePicker value={filterDateFrom} onChange={e => { setFilterDateFrom(e.target.value); setCandPage(1); }}
            placeholder="Added from"
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 bg-white" />
          <span className="text-gray-400 text-sm">–</span>
          <DatePicker value={filterDateTo} min={filterDateFrom || undefined} onChange={e => { setFilterDateTo(e.target.value); setCandPage(1); }}
            placeholder="to"
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 bg-white" />
        </div>
        {(filterTemplateIds.length > 0 || filterStatuses.length > 0 || filterDateFrom || filterDateTo) && (
          <button onClick={() => { setFilterTemplateIds([]); setFilterStatuses([]); setFilterDateFrom(""); setFilterDateTo(""); setCandPage(1); }}
            className="text-sm text-gray-500 hover:text-gray-800 px-2 transition-colors">
            Clear
          </button>
        )}
        <button
          onClick={() => { setShowArchived(s => !s); setCandPage(1); setSearch(""); }}
          className={`flex items-center gap-1.5 text-sm px-3 py-2 rounded-full border transition-colors whitespace-nowrap ${
            showArchived
              ? "bg-amber-50 text-amber-700 border-amber-200 font-semibold"
              : "text-gray-500 border-gray-200 hover:bg-gray-50"
          }`}>
          {showArchived ? (
            <>Active</>
          ) : (
            <><Archive className="w-3.5 h-3.5" /> {`Archived${archivedCount > 0 ? ` (${archivedCount})` : ""}`}</>
          )}
        </button>
        <button onClick={handleDownload} disabled={downloading}
          className="flex items-center gap-1.5 text-sm px-3 py-2 rounded-full border border-gray-200 text-gray-600 hover:bg-gray-50 hover:border-gray-300 transition-colors disabled:opacity-60 disabled:cursor-not-allowed ml-auto">
          <Download className="w-3.5 h-3.5" /> {downloading ? "Preparing…" : "Download"}
        </button>
        <button onClick={handleDownloadHistory} disabled={downloadingHistory}
          title="Full interview history (every attempt, not just the latest) for whichever candidates match the current filters"
          className="flex items-center gap-1.5 text-sm px-3 py-2 rounded-full border border-gray-200 text-gray-600 hover:bg-gray-50 hover:border-gray-300 transition-colors disabled:opacity-60 disabled:cursor-not-allowed">
          <Download className="w-3.5 h-3.5" /> {downloadingHistory ? "Preparing…" : "Download History"}
        </button>
      </motion.div>

      {!needsFullList && (
        <motion.p initial="hidden" animate="visible" variants={fadeUp} custom={2.5} className="text-xs text-gray-400 mb-2">
          Page {candPager.page} of {activeProgram === "all" ? "all candidates" : "candidates for this Program"} — search by name, UID, or email to find anyone else.
        </motion.p>
      )}

      {!needsFullList && pageError && (
        <motion.div initial="hidden" animate="visible" variants={fadeUp} className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
          <p className="font-semibold">Couldn't load candidates for this Program.</p>
          <p className="text-xs text-red-600 mt-1 break-all">{pageError}</p>
          {pageError.includes("index") && (
            <p className="text-xs text-red-600 mt-1">
              This Firestore composite index hasn't been created yet — check the browser console (F12) for a link Firestore generates to create it automatically, or ask your developer to deploy it.
            </p>
          )}
        </motion.div>
      )}

      <motion.div initial="hidden" animate="visible" variants={fadeUp} custom={3} className="bg-white rounded-[1.75rem] border border-gray-100 shadow-soft overflow-hidden">
        {(needsFullList ? isLoading : pageLoading) ? (
          <div className="p-4"><SkeletonRows count={6} /></div>
        ) : rows.length === 0 ? (
          <p className="text-center text-gray-400 py-12">No candidates found</p>
        ) : (
          <>
            {/* Mobile: one card per candidate instead of a table clipped to
               just the first two columns on a phone screen. */}
            <div className="md:hidden divide-y divide-gray-50">
              {rows.map((c, idx) => (
                <div key={c.id} className={`p-4 ${selected.has(c.id) ? "bg-brand-50" : idx % 2 === 1 ? "bg-gray-50/40" : ""}`}>
                  <div className="flex items-start gap-3">
                    <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggleSelect(c.id)}
                      className="accent-brand-600 w-4 h-4 cursor-pointer mt-1 flex-shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-semibold text-gray-900 truncate">{isSwapped(c) ? c.uid : c.name}</p>
                        <KebabMenu actions={[
                          { label: "Edit",   onClick: () => openEdit(c), show: !showArchived },
                          { label: "Manage Attempts, No-Shows & Cancellations", onClick: () => setAttemptsTarget(c), show: (c.templateIds || []).length > 0 },
                          { label: "History", onClick: () => setHistoryTarget(c) },
                          ...(isSwapped(c) ? [{ label: "Fix: Swap Name ↔ UID", onClick: () => handleSwapNameUID(c), highlight: true }] : []),
                          { label: "Archive",   onClick: () => handleArchive(c),   show: c.archived !== true },
                          { label: "Unarchive", onClick: () => handleUnarchive(c), show: c.archived === true },
                          { label: "Delete", onClick: () => handleDelete(c), danger: true },
                        ]} />
                      </div>
                      <p className="font-mono text-[11px] text-gray-500 mt-1 truncate">{isSwapped(c) ? c.name : (c.uid || "—")}</p>
                      <p className="text-xs text-gray-600 truncate mt-0.5">{c.email || "—"}</p>
                      {c.phone && <p className="text-xs text-gray-400 mt-0.5">{c.phone}</p>}
                      <div className="flex flex-wrap items-center gap-1.5 mt-2">
                        {getCandidateProgramIds(c).map(pid => (
                          <span key={pid} className="text-xs font-semibold bg-violet-50 text-violet-700 border border-violet-200 px-2 py-0.5 rounded-full">{programName(pid)}</span>
                        ))}
                        {(c.templateIds || []).map(tid => {
                          const t = templates.find(x => x.id === tid);
                          return t ? (
                            <span key={tid} className="text-[10px] font-semibold bg-brand-50 text-brand-700 border border-brand-200 px-1.5 py-0.5 rounded-full">{t.name}</span>
                          ) : null;
                        })}
                      </div>
                      {statusByCandidateId.has(c.id) && (
                        <div className="flex flex-col gap-1 mt-2">
                          {statusByCandidateId.get(c.id).map(s => (
                            <span key={s.templateId} className="flex items-center gap-1">
                              <span
                                className={`inline-flex items-center gap-1.5 text-[10px] px-1.5 py-0.5 rounded-full border bg-white w-fit max-w-full ${STATUS_OUTLINE_STYLES[s.status] || "border-gray-300 text-gray-500"}`}>
                                <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${STATUS_DOT_COLORS[s.status] || "bg-gray-400"}`} />
                                <span className="truncate opacity-70 font-medium">{s.templateName}:</span>
                                <span className="font-bold whitespace-nowrap">
                                  {s.attemptNumber > 1 ? `${ordinalLabel(s.attemptNumber)} — ` : ""}{STATUS_LABELS[s.status] || s.status}
                                </span>
                              </span>
                              {/* The real status badge above never says
                                 "Blocked" (that's a derived flag, not a
                                 status), so filtering to Blocked and then
                                 seeing e.g. "No Interview Taken Yet" with
                                 nothing to explain it would look broken. */}
                              {s.blocked && (
                                <span title={s.blockReason} className="text-[9px] font-bold text-red-700 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded-full flex-shrink-0">
                                  Blocked
                                </span>
                              )}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop: unchanged table. */}
            <table className="hidden md:table w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="px-4 py-3 w-8">
                  <input type="checkbox"
                    checked={selectAllTarget.length > 0 && selected.size === selectAllTarget.length}
                    onChange={toggleAll}
                    className="accent-brand-600 w-4 h-4 cursor-pointer" />
                </th>
                {["UID", "Name", "Email", "Program", "Templates", "Status", ""].map(h => (
                  <th key={h} className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide px-4 py-3">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {rows.map((c, idx) => (
                <motion.tr
                  key={c.id}
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: Math.min(idx, 10) * 0.02, duration: 0.2 }}
                  className={`transition-colors ${selected.has(c.id) ? "bg-brand-50" : idx % 2 === 1 ? "bg-gray-50/40 hover:bg-gray-50/70" : "bg-white hover:bg-gray-50/70"}`}
                >
                  <td className="px-4 py-3 w-8">
                    <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggleSelect(c.id)}
                      className="accent-brand-600 w-4 h-4 cursor-pointer" />
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-mono text-xs text-gray-700 bg-gray-100 px-2 py-0.5 rounded">
                      {isSwapped(c) ? c.name : (c.uid || "—")}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-semibold text-gray-900">{isSwapped(c) ? c.uid : c.name}</p>
                    {c.phone && <p className="text-xs text-gray-400">{c.phone}</p>}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{c.email || "—"}</td>
                  <td className="px-4 py-3">
                    {getCandidateProgramIds(c).length
                      ? (
                        <div className="flex flex-wrap gap-1">
                          {getCandidateProgramIds(c).map(pid => (
                            <span key={pid} className="text-xs font-semibold bg-violet-50 text-violet-700 border border-violet-200 px-2 py-0.5 rounded-full whitespace-nowrap">{programName(pid)}</span>
                          ))}
                        </div>
                      )
                      : <span className="text-xs text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    {(c.templateIds || []).length === 0 ? (
                      <span className="text-xs text-gray-300">—</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {(c.templateIds || []).map(tid => {
                          const t = templates.find(x => x.id === tid);
                          return t ? (
                            <span key={tid} className="text-[10px] font-semibold bg-brand-50 text-brand-700 border border-brand-200 px-1.5 py-0.5 rounded-full">{t.name}</span>
                          ) : null;
                        })}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 min-w-[14rem]">
                    {(c.templateIds || []).length === 0 ? (
                      <span className="text-xs text-gray-300">—</span>
                    ) : !statusByCandidateId.has(c.id) ? (
                      <span className="text-xs text-gray-300">…</span>
                    ) : (
                      <div className="flex flex-col gap-1">
                        {/* Outline, not filled — a colored background
                           behind both the template name AND the bolded
                           status word read as two overlapping highlight
                           blocks instead of one clean badge. A border +
                           colored text + dot stays just as distinct at a
                           glance without that clash. Template name kept
                           but de-emphasized (the Templates column already
                           shows it in full) so the eye catches the colored
                           status first. */}
                        {statusByCandidateId.get(c.id).map(s => (
                          <span key={s.templateId} className="flex items-center gap-1">
                            <span
                              title={`${s.templateName}: ${STATUS_LABELS[s.status] || s.status}`}
                              className={`inline-flex items-center gap-1.5 text-[10px] px-1.5 py-0.5 rounded-full border bg-white w-fit max-w-full ${STATUS_OUTLINE_STYLES[s.status] || "border-gray-300 text-gray-500"}`}>
                              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${STATUS_DOT_COLORS[s.status] || "bg-gray-400"}`} />
                              <span className="truncate opacity-70 font-medium">{s.templateName}:</span>
                              <span className="font-bold whitespace-nowrap">
                                {s.attemptNumber > 1 ? `${ordinalLabel(s.attemptNumber)} — ` : ""}{STATUS_LABELS[s.status] || s.status}
                              </span>
                            </span>
                            {/* The real status badge above never says
                               "Blocked" (that's a derived flag, not a
                               status), so filtering to Blocked and then
                               seeing e.g. "No Interview Taken Yet" with
                               nothing to explain it would look broken. */}
                            {s.blocked && (
                              <span title={s.blockReason} className="text-[9px] font-bold text-red-700 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded-full flex-shrink-0">
                                Blocked
                              </span>
                            )}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 w-12">
                    <KebabMenu actions={[
                      { label: "Edit",   onClick: () => openEdit(c), show: !showArchived },
                      { label: "Manage Attempts, No-Shows & Cancellations", onClick: () => setAttemptsTarget(c), show: (c.templateIds || []).length > 0 },
                      { label: "History", onClick: () => setHistoryTarget(c) },
                      ...(isSwapped(c) ? [{ label: "Fix: Swap Name ↔ UID", onClick: () => handleSwapNameUID(c), highlight: true }] : []),
                      { label: "Archive",   onClick: () => handleArchive(c),   show: c.archived !== true },
                      { label: "Unarchive", onClick: () => handleUnarchive(c), show: c.archived === true },
                      { label: "Delete", onClick: () => handleDelete(c), danger: true },
                    ]} />
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
          </>
        )}
        {needsFullList ? (
          <Pagination page={candPage} totalPages={candTotalPages} total={candTotal} pageSize={candPageSize} onPageChange={setCandPage} />
        ) : (
          <CursorPagination
            page={candPager.page}
            maxReachedPage={candPager.maxReachedPage}
            done={candPager.done}
            total={activeProgram === "all" ? tabCounts?.all : activeProgram === "unassigned" ? tabCounts?.unassigned : tabCounts?.byProgram?.[activeProgram]}
            pageSize={10}
            loading={candPager.loading}
            onPageChange={candPager.goToPage}
          />
        )}
      </motion.div>

      {/* Status color legend — the Status column's colors otherwise have
         no explanation anywhere on the page (what's amber vs. orange vs.
         red isn't self-evident at a glance). Same STATUS_DOT_COLORS map
         the Status pills themselves use, so the two can never drift apart. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-4 px-1">
        {["not_started", "scheduled", "completed", "partially_completed", "cancelled", "declined", "no_show", "dropped_off"].map(k => (
          <span key={k} className="flex items-center gap-1.5 text-xs text-gray-400">
            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${STATUS_DOT_COLORS[k] || "bg-gray-300"}`} />
            {STATUS_LABELS[k] || k}
          </span>
        ))}
      </div>

      {/* Add / Edit modal */}
      <Modal open={showModal} onClose={() => setShowModal(false)} title={editTarget ? "Edit Candidate" : "Add Candidate"} wide>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>UID</label>
              <input value={form.uid} onChange={e => setField("uid", e.target.value)} placeholder="e.g. STU-2024-001" className={inputCls} />
              <p className="text-[11px] text-gray-400 mt-1">
                If this candidate will log in via the Forms/SSO link, this must exactly match their Accounts user ID — not a roll number you choose yourself.
              </p>
            </div>
            <div>
              <label className={labelCls}>Full Name *</label>
              <input value={form.name} onChange={e => setField("name", e.target.value)} placeholder="John Doe" className={inputCls} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Phone</label>
              <input value={form.phone} onChange={e => setField("phone", e.target.value)} placeholder="+91 98765 43210" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Email</label>
              <input type="email" value={form.email} onChange={e => setField("email", e.target.value)} placeholder="john@example.com" className={inputCls} />
            </div>
          </div>
          <div>
            <label className={labelCls}>Resume Link</label>
            <input type="url" value={form.resumeLink} onChange={e => setField("resumeLink", e.target.value)} placeholder="https://drive.google.com/…" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Notes</label>
            <textarea rows={2} value={form.notes} onChange={e => setField("notes", e.target.value)} placeholder="Any notes…" className={`${inputCls} resize-none`} />
          </div>

          {/* Program(s) + Templates */}
          <div className="border-t border-gray-100 pt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Program(s)</label>
              <SkillsSelect
                skills={programs.map(p => ({ id: p.id, name: p.name }))}
                value={form.programs}
                onChange={(ids) => setForm(f => ({
                  ...f,
                  programs: ids,
                  // Only drop template selections that no longer belong to
                  // any of the (possibly still multiple) selected programs
                  // — adding a second program shouldn't wipe out valid
                  // picks already made for the first one.
                  templateIds: f.templateIds.filter(tid => {
                    const t = templates.find(x => x.id === tid);
                    return t && ids.includes(t.program);
                  }),
                }))}
                placeholder="— None —"
              />
            </div>
            <div>
              <label className={labelCls}>Templates ({form.templateIds.length} selected)</label>
              <div className="border border-gray-200 rounded-lg overflow-hidden max-h-32 overflow-y-auto">
                {!form.programs.length ? (
                  <p className="text-xs text-gray-400 text-center py-3">Select at least one program first</p>
                ) : programTemplates.length === 0 ? (
                  <p className="text-xs text-gray-400 text-center py-3">No templates for this program</p>
                ) : programTemplates.map(t => (
                  <label key={t.id} className={`flex items-center gap-2 px-3 py-1.5 cursor-pointer border-b border-gray-50 last:border-0 text-xs transition-colors ${form.templateIds.includes(t.id) ? "bg-brand-50" : "hover:bg-gray-50"}`}>
                    <input type="checkbox" checked={form.templateIds.includes(t.id)} onChange={() => toggleFormTemplate(t.id)} className="accent-brand-600" />
                    <span className="font-medium text-gray-800">{t.name}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          <div className="flex gap-3 pt-1">
            <Button variant="primary" size="lg" className="flex-1" onClick={handleSave} disabled={saving}>
              {saving ? "Saving…" : editTarget ? "Update" : "Add Candidate"}
            </Button>
            <Button variant="secondary" size="lg" onClick={() => setShowModal(false)}>Cancel</Button>
          </div>
        </div>
      </Modal>

      {/* Bulk Edit modal */}
      <Modal open={showBulk} onClose={() => setShowBulk(false)} title={`Bulk Edit — ${selected.size} candidates`} wide>
        <div className="space-y-5">
          <p className="text-sm text-gray-500">Only filled fields will be updated. Leave blank to keep existing values.</p>
          <div>
            <label className={labelCls}>Add Program(s)</label>
            <p className="text-xs text-gray-400 mb-1.5">Added to each candidate's existing program(s) — never removes one they already have.</p>
            <SkillsSelect
              skills={programs.map(p => ({ id: p.id, name: p.name }))}
              value={bulkPrograms}
              onChange={setBulkPrograms}
              placeholder="— Keep existing —"
            />
          </div>
          <div>
            <label className={labelCls}>Assign Templates ({bulkTemplates.length} selected)</label>
            <div className="border border-gray-200 rounded-xl overflow-hidden max-h-48 overflow-y-auto">
              {templates.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-6">No templates</p>
              ) : templates.map(t => (
                <label key={t.id} className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer border-b border-gray-50 last:border-0 transition-colors ${bulkTemplates.includes(t.id) ? "bg-brand-50" : "hover:bg-gray-50"}`}>
                  <input type="checkbox" checked={bulkTemplates.includes(t.id)} onChange={() => toggleBulkTemplate(t.id)} className="accent-brand-600" />
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{t.name}</p>
                    {t.program && <p className="text-xs text-gray-400">{t.program}</p>}
                  </div>
                </label>
              ))}
            </div>
            {bulkTemplates.length > 0 && (
              <p className="text-xs text-amber-600 mt-1.5 flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" /> This will replace existing template assignments for selected candidates.
              </p>
            )}
          </div>
          <div className="flex gap-3 pt-1">
            <Button variant="primary" size="lg" className="flex-1" onClick={handleBulkSave} disabled={bulkSaving}>
              {bulkSaving ? "Saving…" : `Update ${selected.size} Candidates`}
            </Button>
            <Button variant="secondary" size="lg" onClick={() => setShowBulk(false)}>Cancel</Button>
          </div>
        </div>
      </Modal>

      {/* CSV Import modal */}
      <Modal open={showCSV} onClose={closeCSV} title="Import Candidates from CSV" wide>
        <div className="space-y-5">
          <div className="px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl">
            <p className="text-sm font-semibold text-gray-700 mb-0.5">Template format</p>
            <p className="text-xs text-gray-400 mb-3">
              Columns: <span className="font-mono">uid, name, phone, email, program, templates, resumeLink, notes</span>
              <br />Use <span className="font-mono">|</span> to separate multiple templates — or multiple programs — on one row (e.g. <span className="font-mono">Template A|Template B</span>, <span className="font-mono">Edge 2.0|Academy</span>) — or repeat the same uid/email across several rows, one per row; either way, matching rows for the same candidate are combined. Program and template values must match exact names in the system.
              <br />Re-uploading with just <span className="font-mono">uid</span>/<span className="font-mono">email</span> + <span className="font-mono">templates</span> filled in (other columns blank) adds those templates to the matching existing candidate without touching anything else — choose "Update existing + add new" below.
            </p>
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" icon={FileSpreadsheet} onClick={() => downloadSampleExcel(templates, programs)}
                className="!text-emerald-700 !border-emerald-200 hover:!bg-emerald-50">
                Download Excel (.xlsx)
              </Button>
              <Button variant="secondary" size="sm" icon={FileText} onClick={() => downloadSampleCSV(templates, programs)}
                className="!text-brand-600 !border-brand-200 hover:!bg-brand-50">
                Download CSV
              </Button>
            </div>
            {templates.length > 0 && (
              <div className="mt-3 pt-3 border-t border-gray-200">
                {/* Live, not baked into a downloaded file — always reflects
                   whatever templates exist right now, so there's nothing to
                   re-download just because a template got added/renamed. */}
                <p className="text-[11px] font-semibold text-gray-500 mb-1.5">Available template names (exact spelling, for the templates column):</p>
                <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                  {templates.map(t => (
                    <span key={t.id} className="text-[11px] font-mono bg-white text-gray-600 border border-gray-200 px-2 py-0.5 rounded-full">
                      {t.name}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {isLoading ? (
            <div className="border-2 border-dashed border-gray-200 rounded-xl p-8 flex flex-col items-center gap-2">
              <p className="text-sm font-semibold text-gray-500">Loading candidate list for duplicate checking…</p>
            </div>
          ) : (
            <div onClick={() => fileRef.current?.click()}
              className="border-2 border-dashed border-gray-200 rounded-xl p-8 flex flex-col items-center gap-2 cursor-pointer hover:border-brand-300 hover:bg-brand-50 transition-colors">
              <UploadCloud className="w-8 h-8 text-gray-300" strokeWidth={1.5} />
              <p className="text-sm font-semibold text-gray-600">Click to choose a CSV file</p>
              <p className="text-xs text-gray-400">.csv files only</p>
              <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleCSVFile} />
            </div>
          )}

          {csvErrors.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 space-y-1">
              <p className="text-xs font-bold text-red-700 uppercase tracking-wide flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5" /> Errors
              </p>
              {csvErrors.map((e, i) => <p key={i} className="text-xs text-red-600">• {e}</p>)}
            </div>
          )}

          {csvPreview.length > 0 && (() => {
            const dupeCount = csvPreview.filter(r => findExisting(r)).length;
            return dupeCount > 0 && csvMode === null ? (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3">
                <p className="text-sm font-semibold text-amber-800 flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                  {dupeCount} of {csvPreview.length} candidate{dupeCount !== 1 ? "s" : ""} already exist{dupeCount === 1 ? "s" : ""} (matched by email or UID).
                </p>
                <p className="text-xs text-amber-700">How would you like to handle duplicates?</p>
                <div className="flex gap-2">
                  <button onClick={() => setCsvMode("append")}
                    className="flex-1 py-2 bg-white border border-amber-300 text-amber-800 text-xs font-semibold rounded-lg hover:bg-amber-100 transition-colors">
                    Skip duplicates — only add {csvPreview.length - dupeCount} new
                  </button>
                  <button onClick={() => setCsvMode("replace")}
                    className="flex-1 py-2 bg-amber-600 text-white text-xs font-semibold rounded-lg hover:bg-amber-700 transition-colors">
                    Update existing + add new
                  </button>
                </div>
              </div>
            ) : null;
          })()}

          {csvPreview.length > 0 && (
            <div>
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">{csvPreview.length} candidates ready to import</p>
              <div className="border border-gray-200 rounded-xl overflow-hidden max-h-60 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-gray-50">
                    <tr className="border-b border-gray-200">
                      {["Name", "UID", "Email", "Program", "Templates"].map(h => (
                        <th key={h} className="text-left font-semibold text-gray-400 uppercase tracking-wide px-3 py-2">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {csvPreview.map((r, i) => (
                      <tr key={i} className="hover:bg-gray-50">
                        <td className="px-3 py-2 font-semibold text-gray-800">{r.name}</td>
                        <td className="px-3 py-2 font-mono text-gray-600">{r.uid || "—"}</td>
                        <td className="px-3 py-2 text-gray-600">{r.email || "—"}</td>
                        <td className="px-3 py-2 text-gray-600">{r.programNames?.length ? r.programNames.join(", ") : "—"}</td>
                        <td className="px-3 py-2 text-gray-600">
                          {r.templateNames?.length
                            ? r.templateNames.map((t, j) => (
                                <span key={j} className="inline-block text-[10px] bg-brand-50 text-brand-700 border border-brand-200 px-1.5 py-0.5 rounded-full mr-1 mb-0.5">{t}</span>
                              ))
                            : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <Button variant="secondary" size="lg" className="flex-1" onClick={closeCSV}>Cancel</Button>
            {csvPreview.length > 0 && (() => {
              const hasDupes = csvPreview.some(r => findExisting(r));
              const needsChoice = hasDupes && csvMode === null;
              const effectiveMode = csvMode || (hasDupes ? null : "append");
              return (
                <Button
                  variant="primary" size="lg" className="flex-1"
                  onClick={() => effectiveMode && handleCSVImport(effectiveMode)}
                  disabled={csvImporting || csvPreview.length === 0 || needsChoice}
                >
                  {csvImporting ? "Importing…" : needsChoice ? "Choose how to handle duplicates ↑" : `Import ${csvPreview.length} Candidates`}
                </Button>
              );
            })()}
          </div>
        </div>
      </Modal>

      <AttemptOverridesModal
        candidate={attemptsTarget}
        templates={templates}
        onClose={() => setAttemptsTarget(null)}
      />

      <CandidateHistoryModal
        candidate={historyTarget}
        onClose={() => setHistoryTarget(null)}
      />

      {toast && <Toast message={toast.message} type={toast.type} onDone={() => setToast(null)} />}
    </div>
  );
}
