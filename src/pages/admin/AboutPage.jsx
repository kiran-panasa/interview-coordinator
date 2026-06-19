import { useAuth } from "../../AuthContext";

const ADMIN_STEPS = [
  {
    num: 1,
    title: "Dashboard",
    path: "/admin/dashboard",
    color: "indigo",
    icon: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6",
    summary: "The home screen gives you a live snapshot of everything happening.",
    steps: [
      "View summary stats: total interviews, candidates, and interviewers at a glance.",
      "See today's scheduled interviews with their status and meeting links.",
      "Review pending user approvals that need your action.",
    ],
  },
  {
    num: 2,
    title: "Candidates",
    path: "/admin/candidates",
    color: "violet",
    icon: "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0",
    summary: "Manage the pool of candidates who will be invited for interviews.",
    steps: [
      "Import candidates in bulk using CSV or Excel — download the sample template to see the required format.",
      "Search candidates by name, UID, or email using the search bar.",
      "Assign interview templates to candidates so they're eligible for the right interview type.",
      "Use the kebab menu (⋮) on each row to edit, invite, or remove a candidate.",
    ],
  },
  {
    num: 3,
    title: "Interviewers",
    path: "/admin/interviewers",
    color: "emerald",
    icon: "M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z",
    summary: "View and manage all interviewers on the platform.",
    steps: [
      "Search interviewers by name, email, or company.",
      "Click the kebab menu (⋮) on any row to edit an interviewer's skills and assigned templates.",
      "View an interviewer's upcoming availability slots to know when they're free.",
      "Remove an interviewer from the platform if needed — their past interview records are preserved.",
    ],
  },
  {
    num: 4,
    title: "Interview Templates",
    path: "/admin/templates",
    color: "amber",
    icon: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z",
    summary: "Create structured feedback templates that interviewers fill out after each interview.",
    steps: [
      "Create a new template and define its domains (theory, coding, project, resume, etc.).",
      "Add scored dropdowns, text fields, and rating scales to each domain.",
      "Set weights for each domain to automatically compute an overall verdict score.",
      "Import templates from CSV or Excel for bulk setup.",
      "Templates are assigned to both interviewers and candidates to link the right evaluator with the right candidate.",
    ],
  },
  {
    num: 5,
    title: "Nudge — Step 1: Collect Interviewer Slots",
    path: "/admin/nudge",
    color: "rose",
    icon: "M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9",
    summary: "Send notifications to interviewers asking them to mark their available slots.",
    steps: [
      "Go to the Nudge page and select the Interviewers tab.",
      "Choose the interview template and set a date range for the campaign.",
      "The system automatically shows interviewers whose skills match the template.",
      "Click 'Nudge All' or select specific interviewers, then customise the message and send.",
      "Watch the free slot count update in real time as interviewers add their availability.",
      "Responses from interviewers appear in the Responses section below.",
    ],
  },
  {
    num: 6,
    title: "Nudge — Step 2: Invite Candidates to Schedule",
    path: "/admin/nudge",
    color: "teal",
    icon: "M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z",
    summary: "Send scheduling invites to candidates once slots are confirmed.",
    steps: [
      "Switch to the Candidates tab in Nudge.",
      "Set the date range, template (required), and invite expiry duration.",
      "Filter candidates by program or template and check the available slot count per template.",
      "Select candidates and click 'Send Invites' — each candidate gets a unique scheduling link by email.",
      "Candidates pick a slot on the public scheduling page; the booking appears under 'Sent Invites'.",
      "When a candidate selects a slot, it appears as 'Pending Confirmation' — click Confirm to create the interview and send calendar invites automatically.",
    ],
  },
  {
    num: 7,
    title: "Interviews",
    path: "/admin/interviews",
    color: "blue",
    icon: "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z",
    summary: "View and manage all interviews across the platform.",
    steps: [
      "Use the Status, Date, and Interviewer filters to narrow down the list.",
      "Each row shows the candidate, interviewer, round, date/time, Meet link, and current status.",
      "Click the kebab menu (⋮) to mark attendance, update status, or delete an interview.",
      "Interview status flows: Scheduled → Completed / No Show / Cancelled.",
    ],
  },
  {
    num: 8,
    title: "Admin Panel",
    path: "/admin/panel",
    color: "gray",
    icon: "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z",
    summary: "Manage users, roles, and pending sign-up approvals.",
    steps: [
      "Review pending sign-ups: approve with a selected role or reject them.",
      "Change any active user's role at any time using the dropdown in the All Users table.",
      "Revoke a user's access to move them back to pending.",
      "Invite new members via 'Invite' button — get a one-time signup link to share.",
      "Bulk-invite users by importing a CSV or Excel file with name, email, phone, and role columns.",
      "Manage platform-wide skills — add, rename, or delete skills used for interviewer–template matching.",
    ],
  },
];

const CONTENT_STEPS = [
  {
    num: 1,
    title: "Interview Templates",
    path: "/admin/templates",
    color: "amber",
    icon: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z",
    summary: "Create and manage structured feedback templates for interviews.",
    steps: [
      "Click 'New Template' to start building an evaluation form from scratch.",
      "Choose which evaluation domains to include: Theory, Coding, Project, Resume, Communication, etc.",
      "Within each domain, add card fields (per-question scores) and domain fields (overall domain assessment).",
      "Use 'Scored Dropdown' field type to assign numeric weights that feed into the automatic verdict calculation.",
      "Set each domain's weight in the final verdict so the system can compute a pass/fail score automatically.",
      "Preview the template using 'Preview Form' before publishing.",
      "Import/export templates via CSV or Excel for bulk editing.",
      "Templates are assigned to interviewers and candidates by the admin for use in scheduling.",
    ],
  },
  {
    num: 2,
    title: "Programs",
    path: "/admin/templates",
    color: "violet",
    icon: "M4 6h16M4 10h16M4 14h16M4 18h16",
    summary: "Manage the programs that candidates belong to.",
    steps: [
      "Programs group candidates (e.g. Full Stack, Data Science, DevOps).",
      "Add new programs from the Templates page sidebar.",
      "Programs are used when filtering candidates during invite campaigns.",
    ],
  },
];

const COLOR_MAP = {
  indigo: { bg: "bg-indigo-50", border: "border-indigo-200", icon: "text-indigo-600", num: "bg-indigo-600", dot: "bg-indigo-400" },
  violet: { bg: "bg-violet-50", border: "border-violet-200", icon: "text-violet-600", num: "bg-violet-600", dot: "bg-violet-400" },
  emerald: { bg: "bg-emerald-50", border: "border-emerald-200", icon: "text-emerald-600", num: "bg-emerald-600", dot: "bg-emerald-400" },
  amber: { bg: "bg-amber-50", border: "border-amber-200", icon: "text-amber-600", num: "bg-amber-600", dot: "bg-amber-400" },
  rose: { bg: "bg-rose-50", border: "border-rose-200", icon: "text-rose-600", num: "bg-rose-600", dot: "bg-rose-400" },
  teal: { bg: "bg-teal-50", border: "border-teal-200", icon: "text-teal-600", num: "bg-teal-600", dot: "bg-teal-400" },
  blue: { bg: "bg-blue-50", border: "border-blue-200", icon: "text-blue-600", num: "bg-blue-600", dot: "bg-blue-400" },
  gray: { bg: "bg-gray-50", border: "border-gray-200", icon: "text-gray-600", num: "bg-gray-600", dot: "bg-gray-400" },
};

function StepCard({ step }) {
  const c = COLOR_MAP[step.color] || COLOR_MAP.indigo;
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
  const { userProfile } = useAuth();
  const role = userProfile?.role;
  const isContent = role === "content_team";
  const steps = isContent ? CONTENT_STEPS : ADMIN_STEPS;

  return (
    <div className="p-8 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">
          {isContent ? "Content Team Guide" : "Admin Guide"}
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          {isContent
            ? "Step-by-step walkthrough of the Templates and Programs features available to content team members."
            : "Step-by-step walkthrough of every feature in the Interview Coordinator admin portal."}
        </p>
      </div>

      <div className="space-y-5">
        {steps.map(step => <StepCard key={step.num} step={step} />)}
      </div>

      <div className="mt-8 rounded-xl border border-gray-200 bg-white p-6">
        <h2 className="text-sm font-bold text-gray-700 mb-3">Role Overview</h2>
        <div className="grid grid-cols-2 gap-3 text-sm">
          {[
            { role: "Admin", color: "purple", desc: "Full access — manage everything: users, candidates, interviewers, templates, scheduling, and interviews." },
            { role: "Content Team", color: "blue", desc: "Templates page only — create and maintain the feedback forms interviewers use during evaluations." },
            { role: "Interviewer + Content", color: "teal", desc: "Interviewer portal access plus the Templates page for teams that both interview and build templates." },
            { role: "Interviewer", color: "emerald", desc: "Interviewer portal only — view assigned interviews, set availability, and submit feedback." },
          ].map(({ role, color, desc }) => (
            <div key={role} className="flex gap-3 p-3 rounded-lg bg-gray-50 border border-gray-100">
              <span className={`w-2 h-2 rounded-full bg-${color}-400 flex-shrink-0 mt-1.5`} />
              <div>
                <p className="font-semibold text-gray-800 text-xs">{role}</p>
                <p className="text-gray-500 text-xs mt-0.5">{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
