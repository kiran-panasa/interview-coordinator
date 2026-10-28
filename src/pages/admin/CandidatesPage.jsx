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
  getCandidatesPage, getCandidates, getInterviewsForCandidateTemplate,
} from "../../api/firestore";
import { usePrograms, useTemplates, useCandidates, useCandidateCounts, QK } from "../../hooks/queries";
import { ordinalLabel } from "../../utils/strings";
import Modal from "../../components/Modal";
import Toast from "../../components/Toast";
import Button from "../../components/Button";
import KebabMenu from "../../components/KebabMenu";
import Pagination from "../../components/Pagination";
import { SkeletonRows } from "../../components/Skeleton";
import SkillsSelect from "../../components/SkillsSelect";
import { STYLES as STATUS_STYLES, LABELS as STATUS_LABELS } from "../../components/Badge";
import { usePagination } from "../../hooks/usePagination";
import AttemptOverridesModal from "../../features/candidates/AttemptOverridesModal";

const fadeUp = {
  hidden:  { opacity: 0, y: 12 },
  visible: (i = 0) => ({ opacity: 1, y: 0, transition: { delay: i * 0.05, duration: 0.3, ease: "easeOut" } }),
};

const EMPTY = { name: "", uid: "", email: "", phone: "", resumeLink: "", notes: "", program: "", templateIds: [] };

import { isUUID } from "../../utils/strings";
import { splitCSVRow } from "../../utils/csv";

const isSwapped = (c) => isUUID(c.name) && !!c.uid && !isUUID(c.uid);

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
      programName:   programIdx   >= 0 ? c[programIdx]?.trim()   || "" : "",
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
  if (!list.length) return { status: "not_started", attemptNumber: 1 };
  const sorted = [...list].sort((a, b) =>
    (a.createdAt || `${a.scheduledDate}T${a.scheduledTime || ""}`).localeCompare(b.createdAt || `${b.scheduledDate}T${b.scheduledTime || ""}`)
  );
  let n = 1, attemptNumber = 1, status = sorted[0].status;
  for (const iv of sorted) {
    attemptNumber = n;
    status = iv.status;
    if (iv.status === "completed") n++;
  }
  return { status, attemptNumber };
}

// Every assigned template's latest status for one candidate, fetched in
// parallel — the thing the Status column and the Status filter both
// ultimately need. Bounded by how many templates a candidate actually has
// (almost always 1-3), not by the candidate list size.
async function getCandidateTemplateStatuses(candidate, templatesById) {
  const assignedIds = candidate.templateIds || [];
  const results = await Promise.all(assignedIds.map(tid => getLatestTemplateStatus(candidate.id, tid)));
  return assignedIds.map((tid, i) => ({
    templateId: tid,
    templateName: templatesById.get(tid)?.name || tid,
    ...results[i],
  }));
}

// A plain request can genuinely wait on at most this many candidates'
// worth of per-template status lookups at once — each candidate costs
// roughly one Firestore query per assigned template, so beyond this the
// Status filter/Download-with-status would fire an unreasonable number of
// parallel reads for one admin action. Narrowing with the Program tab,
// search, or the Template filter is the way back under this.
const BULK_STATUS_CANDIDATE_CAP = 150;

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

  // Template (multi) and per-template-status (single) filters — both need
  // the real full candidate list to filter against (not just the scoped
  // "fresh 10" page), same as search/Archived/Unassigned already do.
  const [filterTemplateIds, setFilterTemplateIds] = useState([]);
  const [filterStatus,      setFilterStatus]      = useState("all");
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

  // The default view only ever reads a handful of "fresh" candidates per
  // Program (see the pageItems state below) instead of the whole
  // collection. Searching, the Unassigned tab (no clean server-side query
  // for "no program"), the Archived toggle, CSV-import duplicate detection,
  // and the Template/Status filters all genuinely need the full list, so
  // only those trigger the real full-collection fetch — see useCandidates's
  // `enabled` param.
  const needsFullList = showArchived || activeProgram === "unassigned" || search.trim() !== "" || showCSV
    || filterTemplateIds.length > 0 || filterStatus !== "all";
  const { data: candidates = [], isLoading } = useCandidates(needsFullList);
  const programIds = useMemo(() => programs.map(p => p.id), [programs]);
  const { data: counts } = useCandidateCounts(programIds);

  // Server-scoped "fresh 10 per Program" page — see getCandidatesPage.
  const [pageItems,       setPageItems]       = useState([]);
  const [pageCursor,      setPageCursor]      = useState(null);
  const [pageDone,        setPageDone]        = useState(false);
  const [pageLoading,     setPageLoading]     = useState(false);
  const [pageLoadingMore, setPageLoadingMore] = useState(false);
  const [pageError,       setPageError]       = useState(null);

  useEffect(() => {
    if (needsFullList) return;
    let cancelled = false;
    setPageLoading(true);
    setPageItems([]); setPageCursor(null); setPageDone(false); setPageError(null);
    const programId = activeProgram === "all" ? null : activeProgram;
    getCandidatesPage(programId, null, 10).then(res => {
      if (cancelled) return;
      setPageItems(res.items); setPageCursor(res.cursor); setPageDone(res.done);
    }).catch(async (err) => {
      if (cancelled) return;
      // The composite index (program + createdAt) may still be building —
      // that's a one-time, self-resolving state, not a real failure. Fall
      // back to a full fetch filtered client-side so the tab still shows
      // correct data immediately; once the index finishes building, the
      // next tab switch/reload picks the fast scoped query back up.
      const isIndexError = /index/i.test(err?.message || "");
      if (isIndexError && programId) {
        try {
          const all = await getCandidates();
          if (cancelled) return;
          const activeForProgram = all.filter(c => c.program === programId && c.archived !== true);
          setPageItems(activeForProgram.slice(0, 10));
          setPageDone(true); // fallback mode has no cursor — "Load more" stays hidden
          return;
        } catch (fallbackErr) {
          if (cancelled) return;
          console.error("Candidates fallback fetch failed:", fallbackErr);
          setPageError(fallbackErr.message || String(fallbackErr));
          return;
        }
      }
      console.error("getCandidatesPage failed:", err);
      setPageError(err.message || String(err));
    }).finally(() => { if (!cancelled) setPageLoading(false); });
    return () => { cancelled = true; };
  }, [needsFullList, activeProgram]);

  const loadMorePage = async () => {
    if (pageDone || pageLoadingMore) return;
    setPageLoadingMore(true);
    try {
      const programId = activeProgram === "all" ? null : activeProgram;
      const res = await getCandidatesPage(programId, pageCursor, 10);
      setPageItems(prev => [...prev, ...res.items]);
      setPageCursor(res.cursor); setPageDone(res.done);
    } catch (err) {
      console.error("getCandidatesPage (load more) failed:", err);
      setPageError(err.message || String(err));
    }
    setPageLoadingMore(false);
  };

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

  // Add/Edit Candidate modal — only templates belonging to the selected
  // Program are selectable, so a candidate can't end up assigned a template
  // from an unrelated program.
  const programTemplates = useMemo(
    () => templates.filter(t => t.program === form.program),
    [templates, form.program]
  );

  // Bulk edit
  const [selected,      setSelected]      = useState(new Set());
  const [showBulk,      setShowBulk]      = useState(false);
  const [bulkProgram,   setBulkProgram]   = useState("");
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
      program: c.program || "", templateIds: c.templateIds || [],
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) return setToast({ message: "Name is required.", type: "error" });
    // Untrimmed whitespace here is invisible in the UI but breaks the exact
    // Firestore match (candidates.uid === the Forms/Accounts user_id) that
    // the SSO login flow depends on — a pasted UID with a trailing space
    // looks identical on screen yet silently never logs the student in.
    const cleanForm = { ...form, uid: form.uid.trim(), name: form.name.trim(), email: form.email.trim(), phone: form.phone.trim() };
    setSaving(true);
    try {
      if (editTarget) {
        await updateCandidate(editTarget.id, cleanForm);
        patchFullList(prev => prev.map(c => c.id === editTarget.id ? { ...c, ...cleanForm } : c));
        setPageItems(prev => prev.map(c => c.id === editTarget.id ? { ...c, ...cleanForm } : c)
          .filter(c => c.id !== editTarget.id || activeProgram === "all" || c.program === activeProgram));
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
          const fieldUpdates = { ...cleanForm, templateIds: mergedTemplateIds };
          await updateCandidate(existing.id, fieldUpdates);
          patchFullList(prev => prev.map(c => c.id === existing.id ? { ...c, ...fieldUpdates } : c));
          setPageItems(prev => prev.map(c => c.id === existing.id ? { ...c, ...fieldUpdates } : c));
          queryClient.invalidateQueries({ queryKey: QK.candidates });
          setToast({ message: "A candidate with this email or UID already exists — updated their existing record instead of creating a duplicate." });
        } else {
          const createdAt = new Date().toISOString();
          const id = await createCandidate({ ...cleanForm, createdBy: currentUser.uid });
          const newCandidate = { id, ...cleanForm, createdAt, createdBy: currentUser.uid };
          patchFullList(prev => [newCandidate, ...prev]);
          // Only show it in the scoped page view if it actually belongs on
          // the tab currently being viewed.
          if (!needsFullList && (activeProgram === "all" || activeProgram === form.program)) {
            setPageItems(prev => [newCandidate, ...prev]);
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
    setPageItems(prev => prev.filter(x => x.id !== c.id));
    invalidateCounts();
    setToast({ message: "Candidate deleted." });
  };

  const handleArchive = async (c) => {
    await archiveCandidate(c.id);
    patchFullList(prev => prev.map(x => x.id === c.id ? { ...x, archived: true, archivedAt: new Date().toISOString() } : x));
    // The scoped view is active-only, so an archived candidate drops out of it.
    setPageItems(prev => prev.filter(x => x.id !== c.id));
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
    setPageItems(prev => prev.map(x => x.id === c.id ? { ...x, name: c.uid, uid: c.name } : x));
    setToast({ message: "Name and UID fixed." });
  };

  const handleBulkSave = async () => {
    if (!bulkProgram && bulkTemplates.length === 0) {
      setToast({ message: "Set at least a program or template.", type: "error" }); return;
    }
    setBulkSaving(true);
    try {
      const updates = {};
      if (bulkProgram)           updates.program     = bulkProgram;
      if (bulkTemplates.length)  updates.templateIds = bulkTemplates;
      await Promise.all([...selected].map(id => updateCandidate(id, updates)));
      patchFullList(prev => prev.map(c => selected.has(c.id) ? { ...c, ...updates } : c));
      setPageItems(prev => {
        const mapped = prev.map(c => selected.has(c.id) ? { ...c, ...updates } : c);
        // Reassigning to a different Program means it no longer belongs
        // on a Program-scoped tab.
        return updates.program && activeProgram !== "all"
          ? mapped.filter(c => c.program === activeProgram)
          : mapped;
      });
      invalidateCounts();
      setToast({ message: `Updated ${selected.size} candidate${selected.size !== 1 ? "s" : ""}.` });
      setShowBulk(false);
      setSelected(new Set());
      setBulkProgram(""); setBulkTemplates([]);
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
      if (!groups.has(key)) { groups.set(key, { ...row, templateNames: [] }); order.push(key); }
      const g = groups.get(key);
      (row.templateNames || []).forEach(name => { if (!g.templateNames.includes(name)) g.templateNames.push(name); });
      // First non-blank value for every other field wins — a later row for
      // the same candidate in a templates-only follow-up CSV typically
      // leaves name/phone/etc. blank, which must never blank out a value
      // an earlier row for that same person already supplied.
      for (const f of ["name", "uid", "email", "phone", "resumeLink", "notes", "programName"]) {
        if (!g[f] && row[f]) g[f] = row[f];
      }
    });

    const results = await Promise.all(order.map(async (key) => {
      const row = groups.get(key);
      try {
        const { programName, templateNames, ...rest } = row;
        const resolvedProgram = programName ? (programMap.get(programName.toLowerCase()) || "") : "";
        const newTemplateIds = [...new Set(
          templateNames.map(name => templateMap.get(name.toLowerCase())).filter(Boolean)
        )];
        const existing = findExisting(row);
        if (existing) {
          if (mode !== "replace") return { type: "skipped" };
          // Templates always MERGE onto whatever the candidate already has
          // — this is explicitly an "assign more templates to existing
          // students" pass, never a wipe of templates a prior import (or
          // the admin, by hand) already assigned. Every other field only
          // overwrites when the CSV actually supplied a value, so a
          // templates-only follow-up CSV (blank name/phone/program columns)
          // can't blank out real data on the existing record.
          const mergedTemplateIds = [...new Set([...(existing.templateIds || []), ...newTemplateIds])];
          const fieldUpdates = {};
          for (const [k, v] of Object.entries(rest)) if (v) fieldUpdates[k] = v;
          if (resolvedProgram) fieldUpdates.program = resolvedProgram;
          fieldUpdates.templateIds = mergedTemplateIds;
          await updateCandidate(existing.id, fieldUpdates);
          return { type: "updated", row: { id: existing.id, ...existing, ...fieldUpdates } };
        } else {
          const payload = { ...rest, program: resolvedProgram, templateIds: newTemplateIds };
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
    const sumTotal    = programs.reduce((s, p) => s + (counts.byProgram[p.id]?.total    || 0), 0);
    const sumArchived = programs.reduce((s, p) => s + (counts.byProgram[p.id]?.archived || 0), 0);
    const unassignedTotal    = counts.total    - sumTotal;
    const unassignedArchived = counts.archived - sumArchived;
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

  // A search query bypasses the active Program tab — otherwise a candidate
  // on a different tab than the one you're viewing silently returns zero
  // results, which reads as "search is broken" rather than "search worked,
  // but you're on the wrong tab."
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return workingSet.filter(c => {
      if (filterTemplateIds.length && !(c.templateIds || []).some(tid => filterTemplateIds.includes(tid))) return false;
      if (q) {
        return (
          c.name?.toLowerCase().includes(q) ||
          c.uid?.toLowerCase().includes(q) ||
          c.email?.toLowerCase().includes(q)
        );
      }
      if (activeProgram === "unassigned" && c.program) return false;
      if (activeProgram !== "all" && activeProgram !== "unassigned" && c.program !== activeProgram) return false;
      return true;
    });
  }, [workingSet, activeProgram, search, filterTemplateIds]);

  // Status can only be checked once per-template latest-status data has
  // actually loaded for these candidates (statusByCandidateId) — see the
  // bulk-fetch effect below, which populates it (bounded by
  // BULK_STATUS_CANDIDATE_CAP) whenever filterStatus is active. "Matches"
  // means at least one of the candidate's assigned templates is currently
  // at that status, so picking "Not Started" surfaces anyone who hasn't
  // completed everything they're assigned yet.
  const statusFiltered = useMemo(() => {
    if (filterStatus === "all") return filtered;
    return filtered.filter(c => {
      const statuses = statusByCandidateId.get(c.id);
      return statuses?.some(s => s.status === filterStatus);
    });
  }, [filtered, filterStatus, statusByCandidateId]);

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

  // Bounded bulk fetch — only runs while the Status filter is actually
  // selected, over the Template/Program/search-narrowed `filtered` set (not
  // the whole collection). Skips candidates already covered by the cheap
  // per-page fetch above. Refuses outright past BULK_STATUS_CANDIDATE_CAP
  // rather than silently firing hundreds of parallel reads — the toast
  // tells the admin how to narrow down instead.
  useEffect(() => {
    if (filterStatus === "all") return;
    const missing = filtered.filter(c => !statusByCandidateId.has(c.id));
    if (!missing.length) return;
    if (filtered.length > BULK_STATUS_CANDIDATE_CAP) {
      setToast({
        message: `Status filter needs ${filtered.length} candidates checked — narrow down with Program, search, or the Template filter first (max ${BULK_STATUS_CANDIDATE_CAP} at a time).`,
        type: "error",
      });
      return;
    }
    let cancelled = false;
    setStatusLoading(true);
    Promise.all(missing.map(c => getCandidateTemplateStatuses(c, templatesById))).then(results => {
      if (cancelled) return;
      setStatusByCandidateId(prev => {
        const next = new Map(prev);
        missing.forEach((c, i) => next.set(c.id, results[i]));
        return next;
      });
    }).finally(() => { if (!cancelled) setStatusLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterStatus, filtered]);

  // Exports exactly what's currently filtered (Program/search/Archived/
  // Template/Status), not just the visible page. In the default scoped
  // view (needsFullList false — no search/filter active), `candidates`
  // itself is disabled/empty (see useCandidates's `enabled` param), so this
  // fetches the full list fresh rather than exporting nothing; it's then
  // scoped to the active Program tab (the only filter that can be live in
  // that branch — search/Archived/Template/Status all force needsFullList).
  // Status is included when it's cheap to get (already loaded, or the set
  // is within BULK_STATUS_CANDIDATE_CAP) — otherwise the download still
  // goes out, just without that column, rather than blocking the admin.
  const handleDownload = async () => {
    setDownloading(true);
    let target = statusFiltered;
    if (!needsFullList) {
      try {
        const all = await getCandidates();
        target = all.filter(c => c.archived !== true && (activeProgram === "all" || c.program === activeProgram));
      } catch (e) {
        setToast({ message: `Couldn't load candidates to export: ${e.message}`, type: "error" });
        setDownloading(false);
        return;
      }
    }
    const missing = target.filter(c => !statusByCandidateId.has(c.id));
    let statusMap = statusByCandidateId;
    let includeStatus = true;
    if (missing.length) {
      if (target.length > BULK_STATUS_CANDIDATE_CAP) {
        includeStatus = false;
        setToast({
          message: `Downloaded without Status — ${target.length} candidates is over the ${BULK_STATUS_CANDIDATE_CAP} limit for that. Narrow down with Program, search, or the Template filter to include it.`,
          type: "error",
        });
      } else {
        const results = await Promise.all(missing.map(c => getCandidateTemplateStatuses(c, templatesById)));
        statusMap = new Map(statusByCandidateId);
        missing.forEach((c, i) => statusMap.set(c.id, results[i]));
        setStatusByCandidateId(statusMap);
      }
    }

    const statusText = (c) => {
      const statuses = statusMap.get(c.id);
      if (!statuses?.length) return "";
      return statuses.map(s =>
        `${s.templateName}: ${s.attemptNumber > 1 ? `${ordinalLabel(s.attemptNumber)} - ` : ""}${STATUS_LABELS[s.status] || s.status}`
      ).join(" | ");
    };

    const exportRows = target.map(c => ({
      UID: isSwapped(c) ? c.name : (c.uid || ""),
      Name: isSwapped(c) ? c.uid : (c.name || ""),
      Email: c.email || "",
      Program: c.program ? programName(c.program) : "",
      Templates: (c.templateIds || []).map(tid => templatesById.get(tid)?.name).filter(Boolean).join(" | "),
      ...(includeStatus ? { Status: statusText(c) } : {}),
      Phone: c.phone || "",
    }));
    const header = ["UID", "Name", "Email", "Program", "Templates", ...(includeStatus ? ["Status"] : []), "Phone"];
    const ws = XLSX.utils.json_to_sheet(exportRows, { header });
    ws["!cols"] = header.map(h => ({ wch: h === "Status" ? 50 : h === "Templates" ? 36 : h === "UID" ? 16 : 22 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Candidates");
    XLSX.writeFile(wb, `candidates_${new Date().toISOString().slice(0, 10)}.xlsx`);
    setDownloading(false);
  };

  const inputCls = "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-colors";
  const labelCls = "block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1";
  const setField = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const toggleFormTemplate = (tid) => setField("templateIds",
    form.templateIds.includes(tid) ? form.templateIds.filter(id => id !== tid) : [...form.templateIds, tid]
  );

  return (
    <div className="p-8">
      <motion.div initial="hidden" animate="visible" variants={fadeUp} className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Candidates</h1>
          <p className="text-sm text-gray-500 mt-1">
            {counts ? `${counts.total - counts.archived} active` : "…"}{archivedCount > 0 && ` · ${archivedCount} archived`}
          </p>
        </div>
        <div className="flex gap-2">
          {selected.size > 0 && (
            <Button variant="secondary" icon={Users} onClick={() => { setBulkProgram(""); setBulkTemplates([]); setShowBulk(true); }}>
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
        <motion.div initial="hidden" animate="visible" variants={fadeUp} custom={1} className="flex border-b border-gray-200 mb-5">
          {[
            { id: "all",        label: "All",        count: tabCounts ? tabCounts.all : "…" },
            ...programs.map(p => ({ id: p.id, label: p.name, count: tabCounts ? tabCounts.byProgram[p.id] : "…" })),
            { id: "unassigned", label: "Unassigned", count: tabCounts ? tabCounts.unassigned : "…" },
          ].map(tab => (
            <button key={tab.id} onClick={() => { setActiveProgram(tab.id); setCandPage(1); }}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors ${
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
            skills={templates.map(t => ({ id: t.id, name: t.name }))}
            value={filterTemplateIds}
            onChange={ids => { setFilterTemplateIds(ids); setCandPage(1); }}
            placeholder="All Templates"
            searchPlaceholder="Search templates…"
          />
        </div>
        <select value={filterStatus} onChange={e => { setFilterStatus(e.target.value); setCandPage(1); }}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 bg-white cursor-pointer">
          <option value="all">Any Status</option>
          {Object.keys(STATUS_LABELS).filter(k => ["not_started", "pending_acceptance", "scheduled", "completed", "partially_completed", "cancelled", "declined", "no_show"].includes(k)).map(k => (
            <option key={k} value={k}>{STATUS_LABELS[k]}</option>
          ))}
        </select>
        {(filterTemplateIds.length > 0 || filterStatus !== "all") && (
          <button onClick={() => { setFilterTemplateIds([]); setFilterStatus("all"); setCandPage(1); }}
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
      </motion.div>

      {!needsFullList && (
        <motion.p initial="hidden" animate="visible" variants={fadeUp} custom={2.5} className="text-xs text-gray-400 mb-2">
          Showing the {pageItems.length} most recent {activeProgram === "all" ? "" : "candidates for this Program"} — search by name, UID, or email to find anyone else.
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
        ) : (
          <table className="w-full text-sm">
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
              {rows.length === 0 ? (
                <tr><td colSpan={8} className="text-center text-gray-400 py-12">No candidates found</td></tr>
              ) : rows.map((c, idx) => (
                <motion.tr
                  key={c.id}
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: Math.min(idx, 10) * 0.02, duration: 0.2 }}
                  className={`hover:bg-gray-50/70 transition-colors ${selected.has(c.id) ? "bg-brand-50" : ""}`}
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
                    {c.program
                      ? <span className="text-xs font-semibold bg-violet-50 text-violet-700 border border-violet-200 px-2 py-0.5 rounded-full whitespace-nowrap">{programName(c.program)}</span>
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
                        {statusByCandidateId.get(c.id).map(s => (
                          <span key={s.templateId}
                            className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full w-fit ${STATUS_STYLES[s.status] || "bg-gray-100 text-gray-500"}`}>
                            {s.templateName}: {s.attemptNumber > 1 ? `${ordinalLabel(s.attemptNumber)} — ` : ""}{STATUS_LABELS[s.status] || s.status}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 w-12">
                    <KebabMenu actions={[
                      { label: "Edit",   onClick: () => openEdit(c), show: !showArchived },
                      { label: "Manage Attempts & No-Shows", onClick: () => setAttemptsTarget(c), show: (c.templateIds || []).length > 0 },
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
        )}
        {needsFullList ? (
          <Pagination page={candPage} totalPages={candTotalPages} total={candTotal} pageSize={candPageSize} onPageChange={setCandPage} />
        ) : !pageLoading && !pageDone && (
          <div className="flex justify-center py-4 border-t border-gray-50">
            <Button variant="secondary" onClick={loadMorePage} disabled={pageLoadingMore}>
              {pageLoadingMore ? "Loading…" : "Load 10 more"}
            </Button>
          </div>
        )}
      </motion.div>

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

          {/* Program + Templates */}
          <div className="border-t border-gray-100 pt-4 grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Program</label>
              <select
                value={form.program}
                onChange={e => setForm(f => ({ ...f, program: e.target.value, templateIds: [] }))}
                className={inputCls}
              >
                <option value="">— None —</option>
                {programs.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Templates ({form.templateIds.length} selected)</label>
              <div className="border border-gray-200 rounded-lg overflow-hidden max-h-32 overflow-y-auto">
                {!form.program ? (
                  <p className="text-xs text-gray-400 text-center py-3">Select a program first</p>
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
            <label className={labelCls}>Assign Program</label>
            <select value={bulkProgram} onChange={e => setBulkProgram(e.target.value)} className={inputCls}>
              <option value="">— Keep existing —</option>
              {programs.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
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
              <br />Use <span className="font-mono">|</span> to separate multiple templates on one row (e.g. <span className="font-mono">Template A|Template B</span>) — or repeat the same uid/email across several rows, one template per row; either way, matching rows for the same candidate are combined. Program and template values must match exact names in the system.
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
                        <td className="px-3 py-2 text-gray-600">{r.programName || "—"}</td>
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

      {toast && <Toast message={toast.message} type={toast.type} onDone={() => setToast(null)} />}
    </div>
  );
}
