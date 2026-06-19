const STEPS = [
  {
    num: 1,
    title: "Dashboard",
    path: "/interviewer/dashboard",
    color: "emerald",
    icon: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6",
    summary: "Your home screen — an at-a-glance view of your interview activity.",
    steps: [
      "See summary stats: total interviews conducted, upcoming count, and pending feedback.",
      "Today's scheduled interviews are listed with candidate name, time, and a direct Google Meet link.",
      "Interviews needing action (pending feedback, attendance marking) appear in a separate 'Needs Action' section.",
      "Click any interview row to open the detail page and take action.",
    ],
  },
  {
    num: 2,
    title: "My Availability",
    path: "/interviewer/availability",
    color: "blue",
    icon: "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z",
    summary: "Tell the system when you're free so the admin can schedule candidates with you.",
    steps: [
      "Pick a date from the calendar and add one or more time slots for that day.",
      "Each slot shows as 'Free' until a candidate books it, after which it appears as 'Booked'.",
      "Remove any unwanted free slot by clicking the × next to it.",
      "The admin sees your free slots in real time when planning scheduling campaigns — keep your availability up to date.",
      "Booked slots cannot be removed; coordinate with the admin if a reschedule is needed.",
    ],
  },
  {
    num: 3,
    title: "My Interviews",
    path: "/interviewer/interviews",
    color: "indigo",
    icon: "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z",
    summary: "View all interviews assigned to you, past and upcoming.",
    steps: [
      "Switch between Upcoming, Past, and All tabs to focus on the interviews that matter now.",
      "Filter by status (Scheduled, Completed, Cancelled, etc.) using the dropdown.",
      "Click 'View' on any row to open the interview detail page.",
      "On the detail page, mark whether the candidate joined (attendance), then submit your feedback using the structured form.",
      "The feedback form is based on the template assigned to that interview — fill all scored fields carefully as they feed the verdict.",
    ],
  },
  {
    num: 4,
    title: "Interview Detail & Feedback",
    path: "/interviewer/interviews/:id",
    color: "violet",
    icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2",
    summary: "Submit structured feedback after each interview.",
    steps: [
      "Open an interview from My Interviews and review the candidate and slot details at the top.",
      "Mark attendance: indicate whether the candidate joined.",
      "Fill out the feedback form domain by domain — Theory, Coding, Project, Resume, etc. (fields vary by template).",
      "Scored dropdowns automatically update the computed score as you fill them.",
      "Add qualitative notes in text fields for each domain.",
      "Submit the feedback when complete — the verdict is calculated automatically from your scores.",
      "You can reopen and edit submitted feedback at any time before the admin finalises the result.",
    ],
  },
  {
    num: 5,
    title: "Notifications",
    path: "/interviewer/notifications",
    color: "rose",
    icon: "M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9",
    summary: "Respond to admin nudges asking you to add availability for upcoming sessions.",
    steps: [
      "A red badge on the Notifications nav item means you have unread nudges.",
      "Open each nudge to see the template name, requested date range, and the admin's message.",
      "Click 'I'm Available' to signal availability — then go to My Availability and add your free slots for those dates.",
      "Click 'Not Available' if you cannot take sessions in that period — your response is sent to the admin.",
      "Nudges also appear by email if the admin sends them via the email integration.",
    ],
  },
  {
    num: 6,
    title: "My Profile",
    path: "/interviewer/profile",
    color: "amber",
    icon: "M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z",
    summary: "Keep your professional details current so admins can match you with the right interviews.",
    steps: [
      "Update your display name, phone number, and LinkedIn profile URL.",
      "Set your current company and role title.",
      "Enter your years of experience.",
      "Your skills are managed by the admin — contact them if your skill tags need updating.",
      "Profile changes take effect immediately across the platform.",
    ],
  },
];

const COLOR_MAP = {
  emerald: { bg: "bg-emerald-50", border: "border-emerald-200", icon: "text-emerald-600", num: "bg-emerald-600" },
  blue:    { bg: "bg-blue-50",    border: "border-blue-200",    icon: "text-blue-600",    num: "bg-blue-600" },
  indigo:  { bg: "bg-indigo-50",  border: "border-indigo-200",  icon: "text-indigo-600",  num: "bg-indigo-600" },
  violet:  { bg: "bg-violet-50",  border: "border-violet-200",  icon: "text-violet-600",  num: "bg-violet-600" },
  rose:    { bg: "bg-rose-50",    border: "border-rose-200",    icon: "text-rose-600",    num: "bg-rose-600" },
  amber:   { bg: "bg-amber-50",   border: "border-amber-200",   icon: "text-amber-600",   num: "bg-amber-600" },
};

function StepCard({ step }) {
  const c = COLOR_MAP[step.color] || COLOR_MAP.emerald;
  return (
    <div className={`rounded-xl border ${c.border} ${c.bg} p-6`}>
      <div className="flex items-start gap-4 mb-4">
        <div className={`w-9 h-9 rounded-lg ${c.num} flex items-center justify-center flex-shrink-0`}>
          <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d={step.icon} />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={`text-xs font-bold uppercase tracking-widest ${c.icon}`}>Step {step.num}</span>
          </div>
          <h3 className="text-base font-bold text-gray-900 leading-snug">{step.title}</h3>
          <p className="text-sm text-gray-500 mt-0.5">{step.summary}</p>
        </div>
      </div>
      <ol className="space-y-2 ml-1">
        {step.steps.map((s, i) => (
          <li key={i} className="flex items-start gap-2.5 text-sm text-gray-700">
            <span className={`w-5 h-5 rounded-full ${c.num} text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5`}>
              {i + 1}
            </span>
            {s}
          </li>
        ))}
      </ol>
    </div>
  );
}

export default function AboutPage() {
  return (
    <div className="p-8 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Interviewer Guide</h1>
        <p className="text-sm text-gray-500 mt-1">
          Step-by-step walkthrough of everything you can do in the Interviewer Portal.
        </p>
      </div>

      <div className="space-y-5">
        {STEPS.map(step => <StepCard key={step.num} step={step} />)}
      </div>

      <div className="mt-8 rounded-xl border border-gray-200 bg-white p-6">
        <h2 className="text-sm font-bold text-gray-700 mb-3">Quick Tips</h2>
        <ul className="space-y-2 text-sm text-gray-600">
          {[
            "Keep your availability updated weekly — the admin relies on it to schedule candidates with you.",
            "Submit feedback as soon as the interview ends while details are fresh.",
            "The red badge on Notifications means an admin has sent you a nudge requiring a response.",
            "Your verdict score is computed automatically — focus on filling the scored fields accurately.",
            "Contact the admin if a scheduled interview needs to be rescheduled or cancelled.",
          ].map((tip, i) => (
            <li key={i} className="flex items-start gap-2">
              <svg className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {tip}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
