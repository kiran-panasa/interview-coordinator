export const INTERVIEW_STATUS = {
  PENDING_ACCEPTANCE: "pending_acceptance",
  SCHEDULED:          "scheduled",
  COMPLETED:          "completed",
  DECLINED:           "declined",
  NO_SHOW:            "no_show",
};

// Labels for display
export const INTERVIEW_STATUS_LABELS = {
  pending_acceptance: "Pending Acceptance",
  scheduled:          "Scheduled",
  completed:          "Completed",
  declined:           "Declined",
  no_show:            "No Show",
};

// Tailwind classes for status badges
export const INTERVIEW_STATUS_STYLES = {
  pending_acceptance: "bg-amber-50 text-amber-700 border-amber-200",
  scheduled:          "bg-blue-50 text-blue-700 border-blue-200",
  completed:          "bg-green-50 text-green-700 border-green-200",
  declined:           "bg-red-50 text-red-700 border-red-200",
  no_show:            "bg-gray-50 text-gray-500 border-gray-200",
};
