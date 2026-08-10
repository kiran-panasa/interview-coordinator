import { useState, useEffect, useCallback, useMemo } from "react";
import { motion } from "framer-motion";
import {
  Plus, Upload, X, Video, Archive, ArchiveRestore, Inbox, Link2, Search, FileSpreadsheet,
} from "lucide-react";
import { formatDate, parseInterviewStart, compareTimeLabels } from "../../utils/dates";
import { parseImportCSV, parseLinksCSV, downloadImportTemplate, callAppsScript, VERDICT_MAP } from "../../utils/interviewImport";
import { exportFeedbackToExcel } from "../../utils/feedbackExport";
import { buildFeedbackFromCSV } from "../../services/import.service";
import { useAuth } from "../../AuthContext";
import {
  createInterview, updateInterview, deleteInterview,
  archiveInterview, unarchiveInterview,
  getInterviewerAvailability, markSlotBooked, markSlotFree,
  getTemplate, DEFAULT_ROUNDS, importCompletedInterview, importScheduledInterview,
  createNotification, subscribeToBlockedDates, getInterviewIntegrity, getPreInterviewResources,
  logInterviewHistory, getInterviewHistory,
  getScheduleInviteByInterviewId, updateScheduleInvite,
} from "../../api/firestore";
import { useInterviews } from "../../hooks/subscriptions";
import { useTemplates, usePrograms, useCandidates, useUsers } from "../../hooks/queries";
import Badge from "../../components/Badge";
import Toast from "../../components/Toast";
import KebabMenu from "../../components/KebabMenu";
import Pagination from "../../components/Pagination";
import Button from "../../components/Button";
import { usePagination } from "../../hooks/usePagination";
import ScheduleInterviewModal from "../../features/interviews/ScheduleInterviewModal";
import FeedbackViewModal from "../../features/interviews/FeedbackViewModal";
import ImportModal from "../../features/interviews/ImportModal";
import UploadLinksModal from "../../features/interviews/UploadLinksModal";
import DatePicker from "../../components/DatePicker";
import FeedbackEditModal from "../../features/interviews/FeedbackEditModal";
import AssignmentLinksModal from "../../features/interviews/AssignmentLinksModal";
import InterviewHistoryModal from "../../features/interviews/InterviewHistoryModal";
import CopyButton from "../../components/CopyButton";
import AiReportModal from "../../features/interviews/AiReportModal";

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

const isUUID = (s) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s || "");

// Builds the field-level diff logged to interviews/{id}/history on every
// edit — human-readable labels/values, not raw ids, since this is what an
// admin reviewing the change log actually wants to read.
function buildInterviewChanges(before, after) {
  const changes = [];
  const push = (field, label, from, to) => {
    if ((from ?? "") !== (to ?? "")) changes.push({ field, label, from: from ?? null, to: to ?? null });
  };
  push("candidateId",   "Candidate",           before.candidateName,   after.candidateName);
  push("interviewerId", "Interviewer",         before.interviewerName, after.interviewerName);
  push("scheduledDate", "Date",                before.scheduledDate,   after.scheduledDate);
  push("scheduledTime", "Time",                before.scheduledTime,   after.scheduledTime);
  push("duration",      "Duration (minutes)",  before.duration,        after.duration);
  push("round",         "Round",               before.round,          after.round);
  push("templateId",    "Evaluation Template", before.templateName,   after.templateName);
  push("notes",         "Notes",               before.notes,          after.notes);
  return changes;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function InterviewsPage() {
  const { currentUser, userProfile } = useAuth();
  const { data: candidates  = [] } = useCandidates();
  const { data: usersAll    = [] } = useUsers();
  const { data: templates   = [] } = useTemplates();
  const { data: programs    = [] } = usePrograms();
  const interviewers = useMemo(() =>
    usersAll.filter(u => (u.role === "interviewer" || u.role === "interviewer_content") && u.status === "active"),
    [usersAll]
  );
  const interviews = useInterviews();
  const [blockedDates, setBlockedDates] = useState([]);
  useEffect(() => subscribeToBlockedDates(setBlockedDates), []);
  const [activeProgram, setActiveProgram] = useState("all");
  const [filterStatus,   setFilterStatus]   = useState("All");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo,   setFilterDateTo]   = useState("");
  const [filterIvr,      setFilterIvr]      = useState("All");
  const [filterTemplate, setFilterTemplate] = useState("All");
  const [candSearch,     setCandSearch]     = useState("");
  const [showModal,     setShowModal]     = useState(false);
  const [editTarget,    setEditTarget]    = useState(null);
  const [form,          setForm]          = useState(EMPTY_FORM);
  const [slots,         setSlots]         = useState([]);
  const [availDates,    setAvailDates]    = useState([]);
  const [availTimes,    setAvailTimes]    = useState([]);
  const [saving,        setSaving]        = useState(false);
  const [inviting,      setInviting]      = useState({});  // { [interviewId]: true }
  const [feedbackModal,     setFeedbackModal]     = useState(null); // { interview, template }
  const [feedbackEditModal, setFeedbackEditModal] = useState(null); // interview
  const [feedbackEditForm,  setFeedbackEditForm]  = useState({ overallRecommendation: "", comments: "", markCompleted: true });
  const [feedbackEditSaving, setFeedbackEditSaving] = useState(false);
  const [assignmentLinksModal,   setAssignmentLinksModal]   = useState(null); // interview
  const [assignmentLinksForm,    setAssignmentLinksForm]    = useState([]);
  const [assignmentLinksSaving,  setAssignmentLinksSaving]  = useState(false);
  const [toast,         setToast]         = useState(null);
  const [showImport,      setShowImport]      = useState(false);
  const [csvText,         setCsvText]         = useState("");
  const [parsedRows,      setParsedRows]      = useState(null);
  const [importing,       setImporting]       = useState(false);
  const [dlTemplateId,    setDlTemplateId]    = useState("");
  const [showArchived,    setShowArchived]    = useState(false);
  const [showUploadLinks, setShowUploadLinks] = useState(false);
  const [linksCsvText,    setLinksCsvText]    = useState("");
  const [linksParsedRows, setLinksParsedRows] = useState(null);
  const [linksImporting,  setLinksImporting]  = useState(false);
  const [transcriptLoading, setTranscriptLoading] = useState({}); // { [interviewId]: true }
  const [recordingLoading,  setRecordingLoading]  = useState({}); // { [interviewId]: true }
  const [aiReportTarget,    setAiReportTarget]    = useState(null); // interview being viewed/generated
  const [aiReportLoading,   setAiReportLoading]   = useState(false);
  const [aiReportStatus,    setAiReportStatus]    = useState(null); // { status: "processing"|"not_found", message }
  const [historyModal,      setHistoryModal]      = useState(null); // interview
  const [historyEntries,    setHistoryEntries]    = useState([]);
  const [historyLoading,    setHistoryLoading]    = useState(false);

  useEffect(() => {
    if (!form.interviewerId) { setSlots([]); setAvailDates([]); setAvailTimes([]); return; }
    getInterviewerAvailability(form.interviewerId).then(s => {
      const todayStr = new Date().toISOString().slice(0, 10);
      // Only future slots are ever schedulable — a slot dated before today
      // can never be booked, regardless of time.
      const free = s.filter(x => !x.isBooked && x.date >= todayStr);
      setSlots(s);
      setAvailDates([...new Set(free.map(x => x.date))].sort());
      setAvailTimes([]);
    });
  }, [form.interviewerId]);

  useEffect(() => {
    if (!form.scheduledDate || !form.interviewerId) { setAvailTimes([]); return; }
    const now = new Date();
    const free = slots.filter(s => {
      if (s.date !== form.scheduledDate || s.isBooked) return false;
      const start = parseInterviewStart(s.date, s.time);
      // For today, only show times still ahead of the current time.
      return !start || start > now;
    });
    setAvailTimes(free.map(s => s.time).sort(compareTimeLabels));
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
    const chosenStart = parseInterviewStart(form.scheduledDate, form.scheduledTime);
    if (chosenStart && chosenStart < new Date())
      return setToast({ message: "Cannot schedule an interview in the past — please pick a future date and time.", type: "error" });
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
        const candidateChanged   = editTarget.candidateId   !== form.candidateId;
        const interviewerChanged = editTarget.interviewerId !== form.interviewerId;
        const dateChanged        = editTarget.scheduledDate !== form.scheduledDate;
        const timeChanged        = editTarget.scheduledTime !== form.scheduledTime;
        const durationChanged    = (editTarget.duration || 60)   !== (form.duration || 60);
        const roundChanged       = (editTarget.round || "")      !== (form.round || "");
        const templateChanged    = (editTarget.templateId || "") !== (form.templateId || "");
        const notesChanged       = (editTarget.notes || "")      !== (form.notes || "");
        const anyChanged = candidateChanged || interviewerChanged || dateChanged || timeChanged ||
          durationChanged || roundChanged || templateChanged || notesChanged;
        const calendarRelevantChange = candidateChanged || interviewerChanged || dateChanged || timeChanged || durationChanged;

        if (!anyChanged) {
          setToast({ message: "No changes to save." });
          setShowModal(false);
          setSaving(false);
          return;
        }

        if (dateChanged || timeChanged || interviewerChanged) {
          const oldSlotId = `${editTarget.scheduledDate}_${editTarget.scheduledTime.replace(/[: ]/g, "")}`;
          await markSlotFree(editTarget.interviewerId, oldSlotId).catch(() => {});
          const newSlotId = `${form.scheduledDate}_${form.scheduledTime.replace(/[: ]/g, "")}`;
          await markSlotBooked(form.interviewerId, newSlotId, editTarget.id).catch(() => {});
        }

        // Reassigning the panelist restarts their Accept/Decline — they
        // shouldn't inherit the previous panelist's acceptance of a slot
        // they never agreed to. Only for interviews still in flight; never
        // touch the status of a completed/cancelled/no-show/declined record.
        if (interviewerChanged && ["scheduled", "pending_acceptance"].includes(editTarget.status)) {
          data.status = "pending_acceptance";
        }

        await updateInterview(editTarget.id, data);

        let calendarSyncStatus = "not_applicable";
        let calendarSyncError  = "";
        let notificationStatus = "not_applicable";

        // Reschedule the EXISTING Calendar event/Meet space in place — never
        // delete+recreate, so the same Meet link stays associated with this
        // interview (single source of truth, no duplicate calendar events).
        if (calendarRelevantChange && editTarget.eventId && APPS_SCRIPT_URL) {
          try {
            await callAppsScript(APPS_SCRIPT_URL, APPS_SCRIPT_SECRET, {
              action:              "reschedule",
              eventId:             editTarget.eventId,
              date:                form.scheduledDate,
              startTime:           form.scheduledTime,
              durationMinutes:     form.duration || 60,
              candidateEmail:      data.candidateEmail,
              candidateName:       data.candidateName,
              interviewerEmail:    data.interviewerEmail,
              interviewerName:     data.interviewerName,
              round:               form.round,
              prevCandidateEmail:  candidateChanged   ? editTarget.candidateEmail   : "",
              prevInterviewerEmail: interviewerChanged ? editTarget.interviewerEmail : "",
            });
            calendarSyncStatus = "synced";
          } catch (e) {
            calendarSyncStatus = "failed";
            calendarSyncError  = e.message || String(e);
            console.error("Calendar reschedule failed:", e);
          }
        }

        // Notify whoever's affected: current candidate/interviewer of the
        // update, plus anyone who was just removed from the interview.
        try {
          const recipients = [];
          if ((dateChanged || timeChanged || interviewerChanged) && data.candidateEmail) {
            recipients.push({ email: data.candidateEmail, name: data.candidateName || "Candidate", kind: "updated" });
          }
          if ((dateChanged || timeChanged || candidateChanged) && !interviewerChanged && data.interviewerEmail) {
            recipients.push({ email: data.interviewerEmail, name: data.interviewerName || "Panelist", kind: "updated" });
          }
          if (interviewerChanged && data.interviewerEmail) {
            recipients.push({ email: data.interviewerEmail, name: data.interviewerName || "Panelist", kind: "assigned" });
          }
          if (interviewerChanged && editTarget.interviewerEmail) {
            recipients.push({ email: editTarget.interviewerEmail, name: editTarget.interviewerName || "Panelist", kind: "removed" });
          }
          if (candidateChanged && editTarget.candidateEmail) {
            recipients.push({ email: editTarget.candidateEmail, name: editTarget.candidateName || "Candidate", kind: "removed" });
          }

          if (APPS_SCRIPT_URL && recipients.length) {
            await Promise.all(recipients.map(r => callAppsScript(APPS_SCRIPT_URL, APPS_SCRIPT_SECRET, {
              action: "sendEmail",
              subject: r.kind === "removed"
                ? `Interview Update: ${form.round || "Interview"}`
                : r.kind === "assigned"
                  ? "Action Required: Interview Assigned"
                  : `Interview Updated: ${form.round || "Interview"}`,
              body: r.kind === "removed"
                ? `Hi ${r.name},\n\nYou are no longer on this interview — it has been reassigned.\n\n` +
                  `If this is unexpected, please reach out to the interview coordination team.\n\n— NxtWave Team`
                : `Hi ${r.name},\n\nThis interview has been updated:\n\n` +
                  `Candidate: ${data.candidateName || "—"}\nRound: ${form.round}\n` +
                  `Date: ${formatDate(form.scheduledDate)}\nTime: ${form.scheduledTime}\n` +
                  (data.meetLink ? `Meeting Link: ${data.meetLink}\n` : "") +
                  (r.kind === "assigned" ? `\nPlease log in to accept or decline:\n${window.location.origin}/interviewer/interviews/${editTarget.id}\n` : "") +
                  `\n— NxtWave Team`,
              recipients: [{ email: r.email, name: r.name }],
            })));
            notificationStatus = "sent";
          }
        } catch (e) {
          notificationStatus = "failed";
          console.error("Interview update notification failed:", e);
        }

        if (interviewerChanged && form.interviewerId) {
          createNotification({
            type:           "interview_approval",
            recipientId:    form.interviewerId,
            recipientEmail: data.interviewerEmail,
            interviewId:    editTarget.id,
            candidateName:  data.candidateName,
            message:        `You've been assigned to an interview with ${data.candidateName || "a candidate"} on ${formatDate(form.scheduledDate)} at ${form.scheduledTime} — please Accept or Decline.`,
            status:         "unread",
          }).catch(() => {});
        }

        // Keep the linked Nudge invite (if any) pointing at the same
        // booking — the Candidate Portal reads scheduleInvites, not
        // interviews directly, so this is what keeps it accurate.
        if (dateChanged || timeChanged || interviewerChanged) {
          try {
            const linkedInvite = await getScheduleInviteByInterviewId(editTarget.id);
            if (linkedInvite) {
              await updateScheduleInvite(linkedInvite.id, {
                bookedDate:          form.scheduledDate,
                bookedTime:          form.scheduledTime,
                bookedInterviewerId: form.interviewerId,
              });
            }
          } catch (e) {
            console.error("Failed to sync linked invite after interview edit:", e);
          }
        }

        await logInterviewHistory(editTarget.id, {
          changes:            buildInterviewChanges(editTarget, data),
          changedBy:          currentUser.uid,
          changedByName:      userProfile?.displayName || userProfile?.email || currentUser.email || "Admin",
          calendarSyncStatus,
          calendarSyncError,
          notificationStatus,
        }).catch(() => {});

        if (calendarSyncStatus === "failed") {
          setToast({ message: `Interview updated, but the calendar event couldn't be synced: ${calendarSyncError}`, type: "info" });
        } else {
          setToast({ message: "Interview updated." });
        }
      } else {
        const id = await createInterview({ ...data, createdBy: currentUser.uid });
        const slotId = `${form.scheduledDate}_${form.scheduledTime.replace(/[: ]/g, "")}`;
        await markSlotBooked(form.interviewerId, slotId, id).catch(() => {});

        // New interview needs the interviewer's Accept/Decline — notify them
        if (form.interviewerId) {
          createNotification({
            type:           "interview_approval",
            recipientId:    form.interviewerId,
            recipientEmail: data.interviewerEmail,
            interviewId:    id,
            candidateName:  data.candidateName,
            message:        `You have a new interview with ${data.candidateName || "a candidate"} on ${formatDate(form.scheduledDate)} at ${form.scheduledTime} — please Accept or Decline.`,
            status:         "unread",
          }).catch(() => {});
          if (APPS_SCRIPT_URL && data.interviewerEmail) {
            callAppsScript(APPS_SCRIPT_URL, APPS_SCRIPT_SECRET, {
              action:  "sendEmail",
              subject: "Action Required: Interview Assigned",
              body:
                `Hi ${data.interviewerName || "there"},\n\nYou have a new interview scheduled:\n\n` +
                `Candidate: ${data.candidateName || "—"}\nRound: ${form.round}\n` +
                `Date: ${formatDate(form.scheduledDate)}\nTime: ${form.scheduledTime}\n` +
                (data.meetLink ? `Meeting Link: ${data.meetLink}\n` : "") +
                `\nPlease log in to accept or decline:\n${window.location.origin}/interviewer/interviews/${id}\n\n` +
                `Thank you.`,
              recipients: [{ email: data.interviewerEmail, name: data.interviewerName || data.interviewerEmail }],
            }).catch(() => {});
          }
        }

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
      const result = await callAppsScript(APPS_SCRIPT_URL, APPS_SCRIPT_SECRET, {
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
        recallBotId: result.recallBotId || "",
        inviteSentAt: new Date().toISOString(),
      });
      if (result.meetLink && iv.interviewerEmail) {
        callAppsScript(APPS_SCRIPT_URL, APPS_SCRIPT_SECRET, {
          action:  "sendEmail",
          subject: "Action Required: Interview Assigned",
          body:
            `Hi ${iv.interviewerName || "there"},\n\nYour interview meeting link is ready:\n\n` +
            `Candidate: ${iv.candidateName || "—"}\nRound: ${iv.round || iv.templateName || "Interview"}\n` +
            `Date: ${formatDate(iv.scheduledDate)}\nTime: ${iv.scheduledTime}\n` +
            `Meeting Link: ${result.meetLink}\n\n` +
            `Thank you.`,
          recipients: [{ email: iv.interviewerEmail, name: iv.interviewerName || iv.interviewerEmail }],
        }).catch(() => {});
      }

      // Candidate confirmation — separate from the interviewer email above,
      // and (same as the Nudge confirm flow) the only place the admin-managed
      // pre-interview resources get attached. Interviewers never see this.
      if (result.meetLink && iv.candidateEmail) {
        const resources = await getPreInterviewResources().catch(() => null);
        const instructionLines = [];
        if (resources?.videoGuideUrl) {
          instructionLines.push(`${resources.videoGuideLabel || "Video Setup Guide"}: ${resources.videoGuideUrl}`);
        }
        (resources?.documents || [])
          .filter(d => d.type === "instruction" && d.url)
          .forEach(d => instructionLines.push(`${d.label || "Interview Instructions"}: ${d.url}`));
        const referenceLines = (resources?.documents || [])
          .filter(d => d.type === "reference" && d.url)
          .map(d => `${d.label || "Reference Document"}: ${d.url}`);

        const instructionsBlock = instructionLines.length
          ? `\nPlease review the following before joining your interview:\n${instructionLines.map(l => `• ${l}`).join("\n")}\n`
          : "";
        const referenceBlock = referenceLines.length
          ? `\nAdditional Reference Documents:\n${referenceLines.map(l => `• ${l}`).join("\n")}\n`
          : "";

        callAppsScript(APPS_SCRIPT_URL, APPS_SCRIPT_SECRET, {
          action:  "sendEmail",
          subject: `Interview Confirmed — ${iv.round || iv.templateName || "Interview"}`,
          body:
            `Hi ${iv.candidateName || "there"},\n\nYour interview has been confirmed:\n\n` +
            `Round: ${iv.round || iv.templateName || "Interview"}\nDate: ${formatDate(iv.scheduledDate)}\nTime: ${iv.scheduledTime}\n` +
            `Meeting Link: ${result.meetLink}\n` +
            instructionsBlock + referenceBlock +
            `\nNxtWave Interview Team`,
          recipients: [{ email: iv.candidateEmail, name: iv.candidateName || iv.candidateEmail }],
        }).catch(() => {});
      }

      if (result.hostManagementWarning) {
        console.error("Host management warning:", result.hostManagementWarning);
        setToast({ message: "Invite sent, but couldn't enable panelist recording access — see browser console for details.", type: "info" });
      } else {
        setToast({ message: "Calendar invite sent! Meet link saved." });
      }
    } catch (e) {
      setToast({ message: "Failed to send invite: " + e.message, type: "error" });
    }
    setInviting(s => ({ ...s, [iv.id]: false }));
  };

  // ── Transcript ───────────────────────────────────────────────────────────────

  const handleViewTranscript = async (iv) => {
    if (iv.transcriptUrl) { window.open(iv.transcriptUrl, "_blank", "noopener"); return; }
    if (!iv.eventId && !iv.meetLink) {
      setToast({ message: "No Meet link/event on this interview — nothing to look up.", type: "error" });
      return;
    }
    setTranscriptLoading(s => ({ ...s, [iv.id]: true }));
    try {
      const result = await callAppsScript(APPS_SCRIPT_URL, APPS_SCRIPT_SECRET, {
        action:       "getTranscript",
        eventId:      iv.eventId || "",
        meetLink:     iv.meetLink || "",
        recallBotId:  iv.recallBotId || "",
        candidateName: iv.candidateName,
      });
      if (result?.status === "ready" && result.transcriptUrl) {
        await updateInterview(iv.id, { transcriptUrl: result.transcriptUrl });
        window.open(result.transcriptUrl, "_blank", "noopener");
      } else if (result?.status === "processing") {
        console.log("Recording not yet available.");
        console.log("Waiting for recording processing to complete.");
        console.log("Transcript generation queued.");
        setToast({ message: result.message || "Recording is still being processed — check back in a few minutes.", type: "info" });
      } else {
        throw new Error(result?.message || result?.error || "Transcript not available for this interview.");
      }
    } catch (e) {
      setToast({ message: "Couldn't open transcript: " + e.message, type: "error" });
    }
    setTranscriptLoading(s => ({ ...s, [iv.id]: false }));
  };

  // ── Meet Recording ───────────────────────────────────────────────────────────

  const handleViewRecording = async (iv) => {
    if (iv.meetingRecordingUrl) { window.open(iv.meetingRecordingUrl, "_blank", "noopener"); return; }
    if (!iv.eventId && !iv.meetLink) {
      setToast({ message: "No Meet link/event on this interview — nothing to look up.", type: "error" });
      return;
    }
    setRecordingLoading(s => ({ ...s, [iv.id]: true }));
    try {
      const result = await callAppsScript(APPS_SCRIPT_URL, APPS_SCRIPT_SECRET, {
        action:        "getRecording",
        eventId:       iv.eventId || "",
        meetLink:      iv.meetLink || "",
        recallBotId:   iv.recallBotId || "",
        transcriptUrl: iv.transcriptUrl || "",
      });
      if (result?.status === "ready" && result.recordingUrl) {
        await updateInterview(iv.id, { meetingRecordingUrl: result.recordingUrl });
        window.open(result.recordingUrl, "_blank", "noopener");
      } else if (result?.status === "processing") {
        console.log("Recording processing in progress");
        setToast({ message: result.message || "Recording is still being processed — check back in a few minutes.", type: "info" });
      } else if (result?.status === "not_found") {
        setToast({ message: result.message || "No recording available for this interview.", type: "info" });
      } else {
        throw new Error(result?.message || result?.error || "Recording not available for this interview.");
      }
    } catch (e) {
      setToast({ message: "Couldn't open recording: " + e.message, type: "error" });
    }
    setRecordingLoading(s => ({ ...s, [iv.id]: false }));
  };

  // ── AI Report ────────────────────────────────────────────────────────────────

  const handleViewAiReport = async (iv) => {
    setAiReportTarget(iv);
    setAiReportStatus(null);
    if (iv.aiReport) return; // already cached — modal renders it directly
    if (!iv.eventId && !iv.meetLink && !iv.transcriptUrl) {
      setToast({ message: "No Meet link/event/transcript on this interview — can't fetch a transcript to analyze.", type: "error" });
      setAiReportTarget(null);
      return;
    }
    setAiReportLoading(true);
    try {
      const result = await callAppsScript(APPS_SCRIPT_URL, APPS_SCRIPT_SECRET, {
        action:         "generateAiReport",
        eventId:        iv.eventId || "",
        meetLink:       iv.meetLink || "",
        transcriptUrl:  iv.transcriptUrl || "",
        recallBotId:    iv.recallBotId || "",
        candidateName:  iv.candidateName,
        round:          iv.round || iv.templateName || "Interview",
        templateName:   iv.templateName || "",
      });
      if (result?.status === "ready" && result.report) {
        const aiReport = { ...result.report, generatedAt: new Date().toISOString() };
        await updateInterview(iv.id, { aiReport });
        setAiReportTarget({ ...iv, aiReport });
      } else if (result?.status === "processing" || result?.status === "not_found") {
        console.log(result.status === "processing" ? "Waiting for recording processing to complete." : "Recording not yet available.");
        console.log("Transcript generation queued.");
        console.log("AI report generation queued.");
        setAiReportStatus({ status: result.status, message: result.message });
      } else {
        throw new Error(result?.message || result?.error || "No report returned.");
      }
    } catch (e) {
      setToast({ message: "Couldn't generate AI report: " + e.message, type: "error" });
      setAiReportTarget(null);
    }
    setAiReportLoading(false);
  };

  const handleRegenerateAiReport = async () => {
    if (!aiReportTarget) return;
    const iv = { ...aiReportTarget, aiReport: undefined };
    await handleViewAiReport(iv);
  };

  const handleRetryAiReport = () => {
    if (aiReportTarget) handleViewAiReport(aiReportTarget);
  };

  // ── Cancel interview (+ calendar event) ────────────────────────────────────

  const handleCancel = async (iv) => {
    if (!confirm(`Cancel interview with ${iv.candidateName}? This will also delete the calendar event and notify attendees.`)) return;
    try {
      if (iv.eventId) {
        await callAppsScript(APPS_SCRIPT_URL, APPS_SCRIPT_SECRET, { action: "cancel", eventId: iv.eventId }).catch(() => {});
      }
      await updateInterview(iv.id, { status: "cancelled", eventId: null, meetLink: "" });
      const slotId = `${iv.scheduledDate}_${iv.scheduledTime.replace(/[: ]/g, "")}`;
      await markSlotFree(iv.interviewerId, slotId).catch(() => {});

      const recipients = [
        iv.candidateEmail   && { email: iv.candidateEmail,   name: iv.candidateName   || "Candidate" },
        iv.interviewerEmail && { email: iv.interviewerEmail, name: iv.interviewerName || "Panelist"  },
      ].filter(Boolean);
      if (APPS_SCRIPT_URL && recipients.length) {
        callAppsScript(APPS_SCRIPT_URL, APPS_SCRIPT_SECRET, {
          action:  "sendEmail",
          subject: `Interview Cancelled: ${iv.round || iv.templateName || "Interview"}`,
          body:
            `Hi {{name}},\n\nThe following interview has been cancelled:\n\n` +
            `Candidate: ${iv.candidateName || "—"}\nRound: ${iv.round || iv.templateName || "Interview"}\n` +
            `Date: ${formatDate(iv.scheduledDate)}\nTime: ${iv.scheduledTime}\n\n` +
            `If you have any questions, please reach out to the interview coordination team.\n\n— NxtWave Team`,
          recipients,
        }).catch(() => {});
      }

      notifyAdmins("interview_cancelled", `Interview with ${iv.candidateName} on ${formatDate(iv.scheduledDate)} was cancelled.`, iv);
      setToast({ message: "Interview cancelled and both parties notified by email." });
    } catch (e) {
      setToast({ message: e.message, type: "error" });
    }
  };

  const handleDelete = async (iv) => {
    const label = `${iv.candidateName} — ${iv.round} on ${formatDate(iv.scheduledDate)}`;
    if (!confirm(`Permanently delete interview:\n"${label}"?\n\nThis cannot be undone.`)) return;
    try {
      if (iv.eventId) {
        await callAppsScript(APPS_SCRIPT_URL, APPS_SCRIPT_SECRET, { action: "cancel", eventId: iv.eventId }).catch(() => {});
      }
      const slotId = `${iv.scheduledDate}_${(iv.scheduledTime || "").replace(/[: ]/g, "")}`;
      await markSlotFree(iv.interviewerId, slotId).catch(() => {});
      await deleteInterview(iv.id);
      setToast({ message: "Interview deleted." });
    } catch (e) {
      setToast({ message: e.message, type: "error" });
    }
  };

  // Fans a single in-app notification out to every active admin — same
  // "loop over admins, create one notification each" shape used for the
  // interviewer-facing interview_approval notification above.
  const notifyAdmins = (type, message, iv) => {
    usersAll
      .filter(u => u.role === "admin" && u.status === "active")
      .forEach(a => {
        createNotification({
          type,
          recipientId:    a.id,
          recipientEmail: a.email,
          interviewId:    iv.id,
          candidateName:  iv.candidateName,
          message,
          status:         "unread",
        }).catch(() => {});
      });
  };

  const handleMarkNoShow = async (iv) => {
    if (!confirm(`Mark "${iv.candidateName}" as no-show?`)) return;
    try {
      await updateInterview(iv.id, { status: "no_show" });
      notifyAdmins("no_show", `${iv.candidateName} was marked as a no-show for their interview on ${formatDate(iv.scheduledDate)}.`, iv);
      setToast({ message: "Marked as no-show." });
    } catch (e) {
      setToast({ message: e.message, type: "error" });
    }
  };

  const handleArchive = async (iv) => {
    try {
      await archiveInterview(iv.id);
      setToast({ message: "Interview archived." });
    } catch (e) { setToast({ message: e.message, type: "error" }); }
  };

  const handleUnarchive = async (iv) => {
    try {
      await unarchiveInterview(iv.id);
      setToast({ message: "Interview restored to active." });
    } catch (e) { setToast({ message: e.message, type: "error" }); }
  };

  // When candidateName was stored as a UUID (name/uid swap at import time),
  // resolve the real name from the candidates list for display.
  const resolvedName = (iv) => {
    if (!isUUID(iv.candidateName)) return iv.candidateName;
    const c = candidates.find(c => c.id === iv.candidateId);
    if (!c) return iv.candidateName;
    return isUUID(c.name) && c.uid ? c.uid : c.name;
  };

  const handleFixName = async (iv) => {
    const correctName = resolvedName(iv);
    if (correctName === iv.candidateName) return;
    try {
      await updateInterview(iv.id, { candidateName: correctName });
      setToast({ message: "Candidate name corrected." });
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
    const results = await Promise.all(validRows.map(async (row) => {
      try {
        const {
          candidate, interviewer, template, scheduledDate, scheduledTime, verdict, domainData, hasDomainFeedback,
          existingInterview, meetingLink, meetingRecordingLink,
        } = row.resolved;
        const linkFields = {
          ...(meetingLink          ? { meetLink: meetingLink }                     : {}),
          ...(meetingRecordingLink ? { meetingRecordingUrl: meetingRecordingLink } : {}),
        };

        // Row matches an interview that already exists (completed or still
        // scheduled) — update it in place instead of creating a duplicate.
        // This is how meeting/recording links get attached after the fact,
        // for both past completed interviews and upcoming scheduled ones.
        if (existingInterview) {
          const update = { ...linkFields };
          if (verdict || hasDomainFeedback) {
            update.feedback = buildFeedbackFromCSV(template, domainData, verdict, row.raw.notes);
            update.status = "completed";
            update.candidateJoined = true;
          }
          if (Object.keys(update).length > 0) await updateInterview(existingInterview.id, update);
          return { ok: true };
        }

        const interviewerEmail = interviewer?.email || row.raw.interviewerEmail;
        const interviewerName  = interviewer?.displayName || row.raw.interviewerEmail;
        const interviewerId    = interviewer?.id || "";
        const base = {
          candidateId:      candidate.id,
          candidateName:    candidate.name,
          candidateEmail:   candidate.email,
          interviewerId,
          interviewerEmail,
          interviewerName,
          templateId:       template?.id   || "",
          templateName:     template?.name || "",
          scheduledDate,
          scheduledTime,
          round:    row.raw.round,
          meetLink: meetingLink || "",
          ...(meetingRecordingLink ? { meetingRecordingUrl: meetingRecordingLink } : {}),
        };
        if (verdict || hasDomainFeedback) {
          const feedback = buildFeedbackFromCSV(template, domainData, verdict, row.raw.notes);
          await importCompletedInterview({ ...base, feedback });
        } else {
          await importScheduledInterview(base);
        }
        return { ok: true };
      } catch (e) {
        return { ok: false, msg: `Row ${row.rowNum}: ${e.message}` };
      }
    }));
    setImporting(false);
    const done   = results.filter(r => r.ok).length;
    const failed = results.filter(r => !r.ok).map(r => r.msg);
    if (failed.length) {
      setToast({ message: `${done} imported, ${failed.length} failed. Check console.`, type: "error" });
    } else {
      setToast({ message: `${done} interview${done !== 1 ? "s" : ""} imported successfully.` });
      setShowImport(false); setCsvText(""); setParsedRows(null);
    }
  };

  // ── Upload meeting/recording links for existing interviews ─────────────────

  const handleParseLinksCSV = () => {
    const result = parseLinksCSV(linksCsvText, candidates, templates, interviews);
    if (result.globalError) { setToast({ message: result.globalError, type: "error" }); return; }
    setLinksParsedRows(result.rows);
  };

  const handleImportLinks = async () => {
    const validRows = linksParsedRows.filter(r => r.errors.length === 0);
    setLinksImporting(true);
    const results = await Promise.all(validRows.map(async (row) => {
      try {
        const { existingInterview, meetingLink, meetingRecordingLink, transcriptLink } = row.resolved;
        const update = {
          ...(meetingLink          ? { meetLink: meetingLink }                     : {}),
          ...(meetingRecordingLink ? { meetingRecordingUrl: meetingRecordingLink } : {}),
          ...(transcriptLink       ? { transcriptUrl: transcriptLink }             : {}),
        };
        await updateInterview(existingInterview.id, update);
        return { ok: true };
      } catch (e) {
        return { ok: false, msg: `Row ${row.rowNum}: ${e.message}` };
      }
    }));
    setLinksImporting(false);
    const done   = results.filter(r => r.ok).length;
    const failed = results.filter(r => !r.ok).map(r => r.msg);
    if (failed.length) {
      setToast({ message: `${done} updated, ${failed.length} failed. Check console.`, type: "error" });
      console.error("Link upload failures:", failed);
    } else {
      setToast({ message: `${done} interview${done !== 1 ? "s" : ""} updated with links.` });
      setShowUploadLinks(false); setLinksCsvText(""); setLinksParsedRows(null);
    }
  };

  const setField = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const templateProgramMap = useMemo(
    () => new Map(templates.map(t => [t.id, t.program || ""])),
    [templates]
  );
  const templateProgram = useCallback(
    (templateId) => templateProgramMap.get(templateId) || "",
    [templateProgramMap]
  );

  const archivedCount = useMemo(
    () => interviews.filter(i => i.archived === true).length,
    [interviews]
  );
  const workingSet = useMemo(
    () => interviews.filter(i => (i.archived === true) === showArchived),
    [interviews, showArchived]
  );

  const programWorkingSet = useMemo(() => workingSet.filter(i => {
    if (activeProgram === "unassigned") return !templateProgram(i.templateId);
    if (activeProgram !== "all") return templateProgram(i.templateId) === activeProgram;
    return true;
  }), [workingSet, activeProgram, templateProgram]);

  const filtered = useMemo(() => programWorkingSet.filter(i => {
    if (filterStatus !== "All" && i.status !== filterStatus) return false;
    if (filterDateFrom && i.scheduledDate < filterDateFrom) return false;
    if (filterDateTo   && i.scheduledDate > filterDateTo)   return false;
    if (filterIvr      !== "All" && i.interviewerEmail !== filterIvr) return false;
    if (filterTemplate !== "All" && i.templateName    !== filterTemplate) return false;
    if (candSearch) {
      const q = candSearch.trim().toLowerCase();
      const hay = [i.candidateName, i.candidateEmail].filter(Boolean).join(" ").toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  }), [programWorkingSet, filterStatus, filterDateFrom, filterDateTo, filterIvr, filterTemplate, candSearch]);

  const { paged: pagedInterviews, page: ivrPage, setPage: setIvrPage, totalPages: ivrTotalPages, total: ivrTotal, pageSize: ivrPageSize } = usePagination(filtered, 10);

  const uniqueIvrs = useMemo(
    () => [...new Set(programWorkingSet.map(i => i.interviewerEmail))].filter(Boolean).sort(),
    [programWorkingSet]
  );
  const ivrNameByEmail = useMemo(() => {
    const map = {};
    usersAll.forEach(u => { if (u.email) map[u.email] = u.displayName || u.email; });
    return map;
  }, [usersAll]);

  const uniqueTemplates = useMemo(
    () => [...new Set(programWorkingSet.map(i => i.templateName))].filter(Boolean).sort(),
    [programWorkingSet]
  );

  function openFeedbackEdit(iv) {
    setFeedbackEditForm({
      overallRecommendation: iv.feedback?.overallRecommendation || "",
      comments:              iv.feedback?.comments || "",
      markCompleted:         iv.status !== "completed",
    });
    setFeedbackEditModal(iv);
  }

  async function handleSaveFeedbackEdit() {
    if (!feedbackEditModal) return;
    setFeedbackEditSaving(true);
    try {
      const feedback = {
        ...(feedbackEditModal.feedback || {}),
        overallRecommendation: feedbackEditForm.overallRecommendation,
        comments:              feedbackEditForm.comments,
        submittedAt:           feedbackEditModal.feedback?.submittedAt || new Date().toISOString(),
      };
      const update = { feedback };
      if (feedbackEditForm.markCompleted) {
        update.status           = "completed";
        update.candidateJoined  = true;
      }
      await updateInterview(feedbackEditModal.id, update);
      if (feedbackEditForm.markCompleted) {
        notifyAdmins("interview_completed", `Interview with ${feedbackEditModal.candidateName} has been completed.`, feedbackEditModal);
      }
      setToast({ message: "Feedback saved.", type: "success" });
      setFeedbackEditModal(null);
    } catch (e) {
      setToast({ message: e.message, type: "error" });
    }
    setFeedbackEditSaving(false);
  }

  function openAssignmentLinks(iv) {
    setAssignmentLinksForm(iv.assignmentLinks?.length ? [...iv.assignmentLinks] : [""]);
    setAssignmentLinksModal(iv);
  }

  async function handleSaveAssignmentLinks() {
    if (!assignmentLinksModal) return;
    setAssignmentLinksSaving(true);
    try {
      const links = assignmentLinksForm.map(l => l.trim()).filter(Boolean);
      await updateInterview(assignmentLinksModal.id, { assignmentLinks: links });
      setToast({ message: "Assignment links saved." });
      setAssignmentLinksModal(null);
    } catch (e) {
      setToast({ message: e.message, type: "error" });
    }
    setAssignmentLinksSaving(false);
  }

  async function openHistory(iv) {
    setHistoryModal(iv);
    setHistoryLoading(true);
    try {
      const entries = await getInterviewHistory(iv.id);
      setHistoryEntries(entries);
    } catch (e) {
      setToast({ message: e.message, type: "error" });
    }
    setHistoryLoading(false);
  }

  const handleDownloadFeedback = async () => {
    if (filtered.length === 0) {
      setToast({ message: "No interviews match the current filters.", type: "error" });
      return;
    }
    const integrity = await getInterviewIntegrity().catch(() => null);
    exportFeedbackToExcel(filtered, templates, programs, undefined, integrity?.domainFields);
  };

  const handleDownloadSingleFeedback = async (iv) => {
    const slug = (iv.candidateName || "candidate").replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "_");
    const integrity = await getInterviewIntegrity().catch(() => null);
    exportFeedbackToExcel([iv], templates, programs, `feedback_${slug}`, integrity?.domainFields);
  };

  return (
    <div className="p-8">
      <motion.div
        initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}
        className="flex items-center justify-between mb-6"
      >
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Interviews</h1>
          <p className="text-sm text-gray-500 mt-1">
            {interviews.length - archivedCount} active{archivedCount > 0 && ` · ${archivedCount} archived`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" icon={Link2}
            onClick={() => { setShowUploadLinks(true); setLinksCsvText(""); setLinksParsedRows(null); }}>
            Upload Links
          </Button>
          <Button variant="secondary" icon={Upload}
            onClick={() => { setShowImport(true); setCsvText(""); setParsedRows(null); }}>
            Import from Sheet
          </Button>
          <Button variant="primary" icon={Plus} onClick={openNew}>
            Schedule Interview
          </Button>
        </div>
      </motion.div>

      {/* ── Program Tabs ── */}
      {programs.length > 0 && (
        <div className="flex border-b border-gray-200 mb-5">
          {[
            { id: "all",        label: "All",        count: workingSet.length },
            ...programs.map(p => ({ id: p.id, label: p.name, count: workingSet.filter(i => templateProgram(i.templateId) === p.id).length })),
            { id: "unassigned", label: "Unassigned", count: workingSet.filter(i => !templateProgram(i.templateId)).length },
          ].map(tab => (
            <button key={tab.id} onClick={() => { setActiveProgram(tab.id); setFilterTemplate("All"); setIvrPage(1); }}
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
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-3 mb-5 flex-wrap items-center">
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input type="text" value={candSearch}
            onChange={e => { setCandSearch(e.target.value); setIvrPage(1); }}
            placeholder="Search candidate…"
            className="border border-gray-200 rounded-lg pl-8 pr-3 py-1.5 text-sm text-gray-700 w-48 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500" />
        </div>
        <select value={filterStatus} onChange={e => { setFilterStatus(e.target.value); setIvrPage(1); }}
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500">
          {STATUSES.map(s => <option key={s} value={s}>{s === "All" ? "All Statuses" : s.replace(/_/g," ")}</option>)}
        </select>
        <div className="flex items-center gap-1.5">
          <DatePicker value={filterDateFrom} onChange={e => { setFilterDateFrom(e.target.value); setIvrPage(1); }} blockedDates={blockedDates}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500" />
          <span className="text-gray-400 text-sm">–</span>
          <DatePicker value={filterDateTo} min={filterDateFrom || undefined} onChange={e => { setFilterDateTo(e.target.value); setIvrPage(1); }} blockedDates={blockedDates}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500" />
        </div>
        <select value={filterTemplate} onChange={e => { setFilterTemplate(e.target.value); setIvrPage(1); }}
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500">
          <option value="All">All Templates</option>
          {uniqueTemplates.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <select value={filterIvr} onChange={e => { setFilterIvr(e.target.value); setIvrPage(1); }}
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500">
          <option value="All">All Interviewers</option>
          {uniqueIvrs.map(e => <option key={e} value={e}>{ivrNameByEmail[e] || e}</option>)}
        </select>
        {(filterStatus !== "All" || filterDateFrom || filterDateTo || filterIvr !== "All" || filterTemplate !== "All" || candSearch) && (
          <button onClick={() => { setFilterStatus("All"); setFilterDateFrom(""); setFilterDateTo(""); setFilterIvr("All"); setFilterTemplate("All"); setCandSearch(""); setIvrPage(1); }}
            className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 px-2 transition-colors">
            <X className="w-3.5 h-3.5" /> Clear
          </button>
        )}
        <div className="ml-auto flex items-center gap-2">
          <button onClick={handleDownloadFeedback}
            className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 hover:border-gray-300 transition-colors">
            <FileSpreadsheet className="w-3.5 h-3.5" />
            Download Feedback{filtered.length !== workingSet.length ? ` (${filtered.length})` : ""}
          </button>
          <button
            onClick={() => { setShowArchived(s => !s); setIvrPage(1); }}
            className={`flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border transition-colors ${
              showArchived
                ? "bg-amber-50 text-amber-700 border-amber-200 font-semibold"
                : "text-gray-500 border-gray-200 hover:bg-gray-50"
            }`}>
            {showArchived
              ? <><ArchiveRestore className="w-3.5 h-3.5" /> Active</>
              : <><Archive className="w-3.5 h-3.5" /> Archived{archivedCount > 0 ? ` (${archivedCount})` : ""}</>}
          </button>
        </div>
      </div>

      {/* Table */}
      <motion.div
        initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.1 }}
        className="bg-white rounded-2xl border border-gray-100 shadow-soft overflow-hidden"
      >
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50/60">
              {["Candidate", "Interviewer", "Template", "Round", "Date & Time", "Meet", "Status", ""].map(h => (
                <th key={h} className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide px-4 py-3">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {filtered.length === 0 ? (
              <tr><td colSpan={8} className="py-16">
                <div className="flex flex-col items-center gap-2 text-gray-400">
                  <Inbox className="w-8 h-8 text-gray-300" />
                  <p className="text-sm">No interviews found</p>
                </div>
              </td></tr>
            ) : pagedInterviews.map((iv, idx) => (
              <motion.tr
                key={iv.id}
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2, delay: idx * 0.02 }}
                className="hover:bg-gray-50/70 transition-colors"
              >
                <td className="px-4 py-3">
                  <p className="font-semibold text-gray-900">{resolvedName(iv)}</p>
                  <p className="text-xs text-gray-400">{iv.candidateEmail}</p>
                </td>
                <td className="px-4 py-3 text-gray-700 text-xs">
                  <p>{iv.interviewerName || iv.interviewerEmail}</p>
                </td>
                <td className="px-4 py-3 text-gray-600 text-xs max-w-[140px]">
                  <span className="line-clamp-2">{iv.templateName || "—"}</span>
                </td>
                <td className="px-4 py-3 text-gray-600">{iv.round}</td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <p className="text-gray-700">{formatDate(iv.scheduledDate)}</p>
                  <p className="text-xs text-gray-400">{iv.scheduledTime}{iv.duration ? ` · ${iv.duration}m` : ""}</p>
                </td>
                <td className="px-4 py-3">
                  {iv.meetLink ? (
                    <div className="inline-flex items-center gap-1">
                      <a href={iv.meetLink} target="_blank" rel="noreferrer"
                        className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full hover:bg-emerald-100 transition-colors">
                        <Video className="w-3 h-3" />
                        Join Meet
                      </a>
                      <CopyButton value={iv.meetLink} />
                    </div>
                  ) : (
                    <span className="text-xs text-gray-300">—</span>
                  )}
                </td>
                <td className="px-4 py-3"><Badge value={iv.status} /></td>
                <td className="px-4 py-3 w-12">
                  <KebabMenu actions={[
                    { label: "Edit", onClick: () => openEdit(iv) },
                    {
                      label: "Fix: Correct Name",
                      onClick: () => handleFixName(iv),
                      show: isUUID(iv.candidateName),
                      highlight: true,
                    },
                    {
                      label: inviting[iv.id] ? "Sending…" : iv.eventId ? "✓ Invite Sent" : "Send Invite",
                      onClick: () => { if (!iv.eventId && !inviting[iv.id]) sendInvite(iv); },
                      show: iv.status !== "cancelled" && iv.status !== "completed" && iv.status !== "no_show",
                    },
                    {
                      label: iv.assignmentLinks?.length ? `Assignment Links (${iv.assignmentLinks.length})` : "Assignment Links",
                      onClick: () => openAssignmentLinks(iv),
                      show: iv.status !== "cancelled",
                    },
                    { label: "View History", onClick: () => openHistory(iv) },
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
                      label: "Download Feedback",
                      onClick: () => handleDownloadSingleFeedback(iv),
                      show: iv.status === "completed" && !!iv.feedback,
                    },
                    {
                      label: iv.feedback?.overallRecommendation ? "Edit Feedback" : "Add Feedback",
                      onClick: () => openFeedbackEdit(iv),
                      show: iv.status !== "cancelled" && iv.status !== "no_show",
                    },
                    {
                      label: recordingLoading[iv.id] ? "Opening Recording…" : "Meet Recording",
                      onClick: () => { if (!recordingLoading[iv.id]) handleViewRecording(iv); },
                      show: iv.status === "completed",
                      copyValue: iv.meetingRecordingUrl || undefined,
                    },
                    {
                      label: transcriptLoading[iv.id] ? "Opening Transcript…" : "Transcript",
                      onClick: () => { if (!transcriptLoading[iv.id]) handleViewTranscript(iv); },
                      show: iv.status === "completed",
                      copyValue: iv.transcriptUrl || undefined,
                    },
                    {
                      label: "AI Report",
                      onClick: () => handleViewAiReport(iv),
                      show: iv.status === "completed",
                      highlight: true,
                    },
                    {
                      label: "Archive",
                      onClick: () => handleArchive(iv),
                      show: iv.archived !== true && (iv.status === "completed" || iv.status === "cancelled" || iv.status === "no_show"),
                    },
                    {
                      label: "Unarchive",
                      onClick: () => handleUnarchive(iv),
                      show: iv.archived === true,
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
              </motion.tr>
            ))}
          </tbody>
        </table>
        <Pagination page={ivrPage} totalPages={ivrTotalPages} total={ivrTotal} pageSize={ivrPageSize} onPageChange={setIvrPage} />
      </motion.div>

      <ScheduleInterviewModal
        open={showModal} onClose={() => setShowModal(false)}
        editTarget={editTarget} form={form} setField={setField}
        handleSave={handleSave} saving={saving}
        candidates={candidates} interviewers={interviewers} templates={templates}
        availDates={availDates} availTimes={availTimes}
        DEFAULT_ROUNDS={DEFAULT_ROUNDS} DURATIONS={DURATIONS}
        blockedDates={blockedDates}
      />

      <FeedbackViewModal
        feedbackModal={feedbackModal}
        onClose={() => setFeedbackModal(null)}
      />

      <ImportModal
        open={showImport} onClose={() => setShowImport(false)}
        csvText={csvText} setCsvText={setCsvText}
        parsedRows={parsedRows} setParsedRows={setParsedRows}
        dlTemplateId={dlTemplateId} setDlTemplateId={setDlTemplateId}
        templates={templates}
        handleParseCSV={handleParseCSV} handleImport={handleImport} importing={importing}
        downloadImportTemplate={downloadImportTemplate}
      />

      <UploadLinksModal
        open={showUploadLinks} onClose={() => setShowUploadLinks(false)}
        csvText={linksCsvText} setCsvText={setLinksCsvText}
        parsedRows={linksParsedRows} setParsedRows={setLinksParsedRows}
        handleParseCSV={handleParseLinksCSV} handleImport={handleImportLinks} importing={linksImporting}
      />

      <FeedbackEditModal
        feedbackEditModal={feedbackEditModal}
        onClose={() => setFeedbackEditModal(null)}
        feedbackEditForm={feedbackEditForm}
        setFeedbackEditForm={setFeedbackEditForm}
        handleSaveFeedbackEdit={handleSaveFeedbackEdit}
        feedbackEditSaving={feedbackEditSaving}
      />

      <AssignmentLinksModal
        assignmentLinksModal={assignmentLinksModal}
        onClose={() => setAssignmentLinksModal(null)}
        assignmentLinksForm={assignmentLinksForm}
        setAssignmentLinksForm={setAssignmentLinksForm}
        handleSaveAssignmentLinks={handleSaveAssignmentLinks}
        assignmentLinksSaving={assignmentLinksSaving}
      />

      <InterviewHistoryModal
        historyModal={historyModal}
        onClose={() => setHistoryModal(null)}
        entries={historyEntries}
        loading={historyLoading}
      />

      <AiReportModal
        interview={aiReportTarget}
        loading={aiReportLoading}
        status={aiReportStatus}
        onClose={() => setAiReportTarget(null)}
        onRegenerate={handleRegenerateAiReport}
        onRetry={handleRetryAiReport}
      />

      {toast && <Toast message={toast.message} type={toast.type} onDone={() => setToast(null)} />}
    </div>
  );
}
