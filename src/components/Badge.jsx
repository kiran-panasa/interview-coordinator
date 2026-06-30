const STYLES = {
  pending_acceptance: "bg-amber-50 text-amber-700 ring-amber-200",
  scheduled:          "bg-blue-50  text-blue-700  ring-blue-200",
  completed:          "bg-emerald-50 text-emerald-700 ring-emerald-200",
  cancelled:          "bg-gray-100  text-gray-500  ring-gray-200",
  declined:           "bg-red-50   text-red-600   ring-red-200",
  no_show:            "bg-orange-50 text-orange-600 ring-orange-200",
  active:             "bg-emerald-50 text-emerald-700 ring-emerald-200",
  pending:            "bg-amber-50 text-amber-700 ring-amber-200",
  admin:              "bg-indigo-50 text-indigo-700 ring-indigo-200",
  interviewer:        "bg-teal-50  text-teal-700  ring-teal-200",
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

export default function Badge({ value }) {
  const cls = STYLES[value] || "bg-gray-100 text-gray-600 ring-gray-200";
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 whitespace-nowrap ${cls}`}>
      {LABELS[value] ?? value}
    </span>
  );
}
