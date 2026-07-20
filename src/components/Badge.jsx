const STYLES = {
  pending_acceptance: "bg-amber-50 text-amber-700 ring-amber-200 [&>span]:bg-amber-500",
  scheduled:          "bg-blue-50  text-blue-700  ring-blue-200 [&>span]:bg-blue-500",
  completed:          "bg-emerald-50 text-emerald-700 ring-emerald-200 [&>span]:bg-emerald-500",
  cancelled:          "bg-gray-100  text-gray-500  ring-gray-200 [&>span]:bg-gray-400",
  declined:           "bg-red-50   text-red-600   ring-red-200 [&>span]:bg-red-500",
  no_show:            "bg-orange-50 text-orange-600 ring-orange-200 [&>span]:bg-orange-500",
  active:             "bg-emerald-50 text-emerald-700 ring-emerald-200 [&>span]:bg-emerald-500",
  pending:            "bg-amber-50 text-amber-700 ring-amber-200 [&>span]:bg-amber-500",
  admin:              "bg-brand-50 text-brand-700 ring-brand-200 [&>span]:bg-brand-500",
  interviewer:        "bg-teal-50  text-teal-700  ring-teal-200 [&>span]:bg-teal-500",
};

const LABELS = {
  pending_acceptance: "Pending Acceptance",
  scheduled:          "Scheduled",
  completed:          "Completed",
  cancelled:          "Cancelled",
  declined:           "Declined",
  no_show:            "No Show",
  active:             "Active",
  pending:            "Pending",
  admin:              "Admin",
  interviewer:        "Interviewer",
};

import { memo } from "react";

function Badge({ value }) {
  const cls = STYLES[value] || "bg-gray-100 text-gray-600 ring-gray-200 [&>span]:bg-gray-400";
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset whitespace-nowrap ${cls}`}>
      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" />
      {LABELS[value] ?? value}
    </span>
  );
}

export default memo(Badge);
