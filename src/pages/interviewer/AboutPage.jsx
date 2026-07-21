import { useEffect } from "react";
import { Printer, CheckCircle2 } from "lucide-react";
import Button from "../../components/Button";

const PRINT_CSS = `
@media print {
  aside, nav, .print-hide { display: none !important; }
  main { margin-left: 0 !important; }
  * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
  .print-avoid { break-inside: avoid; }
}
`;

function injectPrintCSS() {
  if (document.getElementById("interviewer-about-css")) return;
  const s = document.createElement("style");
  s.id = "interviewer-about-css";
  s.textContent = PRINT_CSS;
  document.head.appendChild(s);
}

function HowStep({ num, color, title, desc }) {
  const bg = { indigo:"bg-brand-600", emerald:"bg-emerald-500", violet:"bg-violet-600", amber:"bg-amber-500", blue:"bg-blue-600", teal:"bg-teal-600" };
  return (
    <div className="flex gap-4">
      <div className={`w-8 h-8 rounded-full ${bg[color]||bg.indigo} text-white text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5 shadow-soft`}>
        {num}
      </div>
      <div className="flex-1 pb-5">
        <h3 className="text-sm font-bold text-gray-900">{title}</h3>
        <p className="text-sm text-gray-500 mt-0.5">{desc}</p>
      </div>
    </div>
  );
}

function Section({ title, sub, children }) {
  return (
    <div className="mb-8">
      <h2 className="text-lg font-bold text-gray-900 mb-0.5 tracking-tight">{title}</h2>
      {sub && <p className="text-sm text-gray-400 mb-4">{sub}</p>}
      {children}
    </div>
  );
}

function PageCard({ title, path, children, note }) {
  return (
    <div className="print-avoid bg-white rounded-2xl border border-gray-100 shadow-soft p-5 mb-4">
      <div className="flex items-baseline gap-2 mb-3">
        <h3 className="text-sm font-bold text-gray-900">{title}</h3>
        <code className="text-[10px] font-mono text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">{path}</code>
      </div>
      <div className="text-sm text-gray-600 space-y-1.5">{children}</div>
      {note && (
        <div className="mt-3 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          <p className="text-xs text-amber-700"><span className="font-bold">⚠</span> {note}</p>
        </div>
      )}
    </div>
  );
}

function Bullet({ children }) {
  return (
    <div className="flex items-start gap-2">
      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0 mt-1.5" />
      <span className="text-sm text-gray-600">{children}</span>
    </div>
  );
}

function SubHeading({ children }) {
  return <p className="font-semibold text-gray-700 mt-3 mb-1 text-sm">{children}</p>;
}

function ConceptCard({ title, children }) {
  return (
    <div className="print-avoid bg-white rounded-2xl border border-gray-100 shadow-soft p-4">
      <h3 className="text-sm font-bold text-gray-800 mb-1">{title}</h3>
      <p className="text-xs text-gray-500 leading-relaxed">{children}</p>
    </div>
  );
}

export default function AboutPage() {
  useEffect(() => {
    injectPrintCSS();
    return () => document.getElementById("interviewer-about-css")?.remove();
  }, []);

  return (
    <div className="p-8 max-w-4xl">

      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Interviewer Guide</h1>
          <p className="text-sm text-gray-400 mt-0.5">Interview Coordinator — NxtWave Internal Tool</p>
        </div>
        <Button variant="primary" size="sm" icon={Printer} onClick={() => window.print()}
          className="print-hide !bg-emerald-600 hover:!bg-emerald-700">
          Print / PDF
        </Button>
      </div>

      {/* What is this */}
      <div className="bg-gray-50 border border-gray-100 rounded-2xl p-5 mb-8 text-sm text-gray-600 leading-relaxed">
        <p>
          <strong className="text-gray-900">Interview Coordinator</strong> is your workspace for managing interview assignments at NxtWave.
          You receive interview requests based on your availability, conduct structured interviews with a question checklist and domain-level
          scoring rubric, and submit evaluations — all in one place.
        </p>
        <p className="mt-2">
          The admin schedules interviews based on the time slots you set in My Availability.
          Keeping your calendar updated is the most important thing you can do to stay in the interview pool.
        </p>
      </div>

      {/* Workflow */}
      <Section title="Your Workflow" sub="The end-to-end journey from receiving a request to completing an interview.">
        <div className="space-y-0">
          <HowStep num={1} color="teal"    title="Set Your Availability"      desc="Add your free time slots in My Availability. The admin sees these in real time and uses them to send candidates self-scheduling links." />
          <HowStep num={2} color="violet"  title="Receive an Interview"       desc="Once a candidate picks your slot, a pending interview is created and you get a notification." />
          <HowStep num={3} color="indigo"  title="Accept or Decline"          desc="Open the interview in My Interviews and respond. Declining frees the slot back for the admin to reassign." />
          <HowStep num={4} color="amber"   title="Conduct the Interview"      desc="Join the interview link at the scheduled time. Ask questions from the checklist and take notes." />
          <HowStep num={5} color="blue"    title="Mark Attendance & Evaluate" desc="After the start time, confirm the candidate joined (unlocks the form) or mark a no-show. Then fill in Questions Asked and the domain-by-domain Evaluation." />
          <HowStep num={6} color="emerald" title="Mark as Completed"          desc="Once evaluation is saved and attendance is confirmed as joined, click Mark as Completed to lock the record." />
        </div>
      </Section>

      {/* Page-by-page */}
      <Section title="Page-by-Page Guide" sub="What each page does and how to use it.">

        <PageCard title="Dashboard" path="/interviewer/dashboard">
          <Bullet>Summary stats: total interviews, upcoming today, pending feedback, completed.</Bullet>
          <Bullet>Today's scheduled interviews with direct meeting links — no need to search.</Bullet>
          <Bullet>Quick list of interviews that need action from you (pending acceptance, attendance to mark, feedback to submit).</Bullet>
        </PageCard>

        <PageCard
          title="My Availability"
          path="/interviewer/availability"
          note="Keep your availability up to date. The admin cannot send scheduling invites for dates where you have no free slots."
        >
          <Bullet>Pick a date and add one or more time slots (e.g., 10:00 AM, 2:00 PM).</Bullet>
          <Bullet>Slots start as <strong>Free</strong>. Once a candidate books a slot it becomes <strong>Booked</strong> and cannot be removed.</Bullet>
          <Bullet>Remove free slots using the × button — booked slots are locked.</Bullet>
          <Bullet>The admin sees your free slots across the full date range they're scheduling for.</Bullet>
        </PageCard>

        <PageCard title="My Interviews" path="/interviewer/interviews">
          <Bullet>All interviews assigned to you, sorted by date. Status flow: <strong>Pending Acceptance → Scheduled → Completed / No-show / Declined</strong>.</Bullet>
          <Bullet>Filter by status to focus on interviews that need attention.</Bullet>
          <Bullet>Click any row to open the Interview Detail page.</Bullet>
        </PageCard>

        <PageCard title="Interview Detail" path="/interviewer/interviews/:id">
          <p className="text-sm text-gray-500 mb-2">The main action page for a single interview. Sections appear progressively as conditions are met.</p>

          <SubHeading>1 · Accept / Decline</SubHeading>
          <Bullet>Respond to a <strong>Pending Acceptance</strong> interview. Declining frees the slot immediately and notifies the admin.</Bullet>

          <SubHeading>2 · Attendance Gate</SubHeading>
          <Bullet>Appears after the interview start time has passed.</Bullet>
          <Bullet><strong>Candidate Joined</strong> — unlocks the Questions Asked and Evaluation sections.</Bullet>
          <Bullet><strong>No-show</strong> — sets the status to No-show. No evaluation is required.</Bullet>

          <SubHeading>3 · Questions Asked</SubHeading>
          <Bullet>Shown when the interview template has questions assigned to it. Questions are grouped by domain section.</Bullet>
          <Bullet>Check each question you asked. A remarks field appears when you check a question — add brief notes there.</Bullet>
          <Bullet><strong>Asked before</strong> badge (amber) — this question was asked to the same candidate in a prior interview. Not a blocker, just a heads-up.</Bullet>
          <Bullet><strong>Add your own question</strong> — submit a question you asked that isn't in the bank. It goes to the content team's review queue for potential inclusion.</Bullet>
          <Bullet>Click <strong>Save Questions</strong> to persist. Saving atomically increments the usage count for each checked question. You can update this any time before the interview is Completed.</Bullet>

          <SubHeading>4 · Evaluation</SubHeading>
          <Bullet>Domain-by-domain structured feedback form (Theory, Coding, Project, Resume, etc. — fields vary by template).</Bullet>
          <Bullet>Scored dropdowns are weighted; the computed domain score updates as you fill them.</Bullet>
          <Bullet>Text fields for qualitative observations per domain.</Bullet>
          <Bullet>The final domain (<code>overall_feedback</code>) is where you enter your hiring recommendation: Proceed / Hold / Reject.</Bullet>
          <Bullet>Save as a draft any time — you can update until you click Mark as Completed.</Bullet>

          <SubHeading>5 · Mark as Completed</SubHeading>
          <Bullet>Enabled only when <strong>all three</strong> conditions are met: evaluation saved + interview time has passed + attendance is <em>joined</em>.</Bullet>
          <Bullet>Completing the interview locks the record. The admin can then view your full evaluation.</Bullet>
        </PageCard>

        <PageCard title="Notifications" path="/interviewer/notifications">
          <Bullet>In-app alerts from the admin — typically nudges to add availability for specific date ranges or templates.</Bullet>
          <Bullet>A red badge in the nav bar = unread notifications. Open each to see the requested dates and template.</Bullet>
          <Bullet>Respond to nudges by adding free slots in My Availability for those dates.</Bullet>
        </PageCard>

        <PageCard title="Profile" path="/interviewer/profile">
          <Bullet>Update your display name, phone number, LinkedIn URL, company, role/title, and years of experience.</Bullet>
          <Bullet>Your skill tags are managed by the admin — contact them if your profile skills need updating.</Bullet>
        </PageCard>

      </Section>

      {/* Key concepts */}
      <Section title="Key Concepts" sub="Terms you'll encounter throughout the app.">
        <div className="grid grid-cols-2 gap-3">
          <ConceptCard title="Attendance Gate">
            A confirmation step that appears once the interview start time passes. You must mark attendance before the evaluation form becomes available. This prevents submitting feedback for an interview that never happened.
          </ConceptCard>
          <ConceptCard title="Feedback Draft">
            Your evaluation is always saved as a draft until you click "Mark as Completed." You can return and update it as many times as needed — nothing locks until you explicitly complete the interview.
          </ConceptCard>
          <ConceptCard title="Questions Asked vs Evaluation">
            Two separate, independent saves. Saving Questions Asked does not submit the evaluation, and vice versa. Both can be updated at any time while the interview is in Scheduled status.
          </ConceptCard>
          <ConceptCard title="Asked Before Badge">
            The amber badge checks only prior completed interviews with this specific candidate — not the current session. It's a reminder to vary questioning across rounds, not a restriction.
          </ConceptCard>
          <ConceptCard title="Ad-hoc Question">
            A question you asked during the interview that isn't in the template question bank. When submitted, it goes to the content team's review queue. They may add it to the central bank with proper tags.
          </ConceptCard>
          <ConceptCard title="usageCount">
            Each time you save Questions Asked, the system atomically increments a counter for every checked question. This tracks which questions are used most across all interviews — it's used for content analytics.
          </ConceptCard>
        </div>
      </Section>

      {/* Tips */}
      <Section title="Tips for a Smooth Interview">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-soft p-5 space-y-3">
          {[
            { tip: "Update availability at least a week ahead", desc: "Admins run scheduling campaigns weekly. If your calendar is empty for an upcoming period, you won't be included in the invite pool." },
            { tip: "Save Questions Asked before submitting Evaluation", desc: "These are separate saves. Saving questions increments usage counters, giving the content team accurate data on question frequency." },
            { tip: "The evaluation saves as a draft — revisit it", desc: "You can start the evaluation right after marking attendance and come back to refine it before clicking Mark as Completed." },
            { tip: "Add ad-hoc questions even if unsure they belong", desc: "The content team reviews everything. A good question you asked in the moment is exactly the kind of content they want to add to the bank." },
            { tip: "Mark No-show promptly", desc: "Marking a no-show immediately frees the admin to reschedule the candidate or reallocate the slot to another interviewer." },
          ].map(({ tip, desc }) => (
            <div key={tip} className="flex gap-3">
              <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center flex-shrink-0 mt-0.5">
                <CheckCircle2 className="w-3 h-3" strokeWidth={3} />
              </span>
              <div>
                <p className="text-sm font-semibold text-gray-800">{tip}</p>
                <p className="text-xs text-gray-500 mt-0.5">{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </Section>

    </div>
  );
}
