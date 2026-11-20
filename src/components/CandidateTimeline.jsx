import { CalendarClock, CheckCircle2, XCircle, AlertTriangle, Clock3, RefreshCw } from "lucide-react";
import { buildCandidateTimeline, timelineDetail } from "../utils/candidateTimeline";
import { ordinalLabel } from "../utils/strings";

// Shared by the Student Dashboard's own "History" tab and the admin
// Candidates page's per-candidate History modal — the "Nth Attempt" badge
// here uses the exact same counting rule as everywhere else in the app
// (InterviewsPage.jsx, the Student Dashboard's own attempt-limit messaging):
// a cancelled/no-show/declined interview shares its predecessor's attempt
// number instead of starting a new one — see candidateTimeline.js.
const STATUS_BADGE = {
  pending_acceptance:  { label: "Scheduling In Progress", style: "bg-amber-50 text-amber-700 border-amber-200",     icon: Clock3,       detailColor: "text-amber-700" },
  scheduled:           { label: "Scheduled",              style: "bg-blue-50 text-blue-700 border-blue-200",       icon: CalendarClock, detailColor: "text-blue-700" },
  completed:           { label: "Completed",              style: "bg-emerald-50 text-emerald-700 border-emerald-200", icon: CheckCircle2, detailColor: "text-emerald-700" },
  partially_completed: { label: "Partially Completed",    style: "bg-sky-50 text-sky-700 border-sky-200",          icon: CheckCircle2,  detailColor: "text-sky-700" },
  cancelled:           { label: "Cancelled",              style: "bg-gray-100 text-gray-500 border-gray-200",      icon: XCircle,        detailColor: "text-gray-700" },
  declined:            { label: "Declined by Interviewer", style: "bg-violet-50 text-violet-700 border-violet-200", icon: RefreshCw,      detailColor: "text-violet-700" },
  no_show:             { label: "No-Show",                style: "bg-orange-50 text-orange-600 border-orange-200", icon: AlertTriangle,  detailColor: "text-orange-700" },
};

export default function CandidateTimeline({ interviews, emptyMessage = "No interview history yet.", audience = "admin" }) {
  const timeline = buildCandidateTimeline(interviews || []);

  if (timeline.length === 0) {
    return <p className="text-sm text-gray-400 text-center py-8">{emptyMessage}</p>;
  }

  return (
    <div>
      {timeline.map((iv, i) => {
        const badge = STATUS_BADGE[iv.status] || STATUS_BADGE.scheduled;
        const Icon = badge.icon;
        const detail = timelineDetail(iv, audience);
        return (
          <div key={iv.id} className="relative pl-9 pb-6 last:pb-0">
            {i !== timeline.length - 1 && (
              <div className="absolute left-[13px] top-7 bottom-0 w-px bg-gray-200" />
            )}
            <div className={`absolute left-0 top-0 w-7 h-7 rounded-full flex items-center justify-center border ${badge.style}`}>
              <Icon className="w-3.5 h-3.5" />
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <p className="font-semibold text-gray-900 text-sm">{iv.templateName || "Interview"}</p>
              <span className="text-[10px] font-bold uppercase tracking-wide text-violet-600 bg-violet-50 border border-violet-200 px-1.5 py-0.5 rounded-full">
                {ordinalLabel(iv.attemptNumber)}
              </span>
              <span className={`text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full border ${badge.style}`}>
                {badge.label}
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              {iv.scheduledDate
                ? `Booked for ${iv.scheduledDate}${iv.scheduledTime ? ` · ${iv.scheduledTime}` : ""}`
                : "No date set"}
            </p>
            {detail && <p className={`text-xs font-medium mt-0.5 ${badge.detailColor}`}>{detail}</p>}
          </div>
        );
      })}
    </div>
  );
}
