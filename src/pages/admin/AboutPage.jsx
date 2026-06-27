import { useEffect } from "react";
import { useAuth } from "../../AuthContext";

// ── Print helpers ──────────────────────────────────────────────────────────────

const PRINT_CSS = `
@media print {
  aside, .print-hide { display: none !important; }
  main { margin-left: 0 !important; }
  * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
  .print-break { page-break-before: always; }
  .print-avoid { break-inside: avoid; }
}
`;

function injectPrintCSS() {
  if (document.getElementById("about-print-css")) return;
  const s = document.createElement("style");
  s.id = "about-print-css";
  s.textContent = PRINT_CSS;
  document.head.appendChild(s);
}

const BASE_HTML_STYLES = `
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#111827;padding:48px;max-width:880px;margin:0 auto;line-height:1.55}
  h1{font-size:2rem;font-weight:800;margin-bottom:6px;color:#111827}
  .app-sub{font-size:.9rem;color:#6b7280;margin-bottom:10px}
  .desc-box{background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;padding:18px 20px;margin:0 0 36px;font-size:.875rem;color:#374151;line-height:1.65}
  h2{font-size:1.25rem;font-weight:700;color:#111827;margin-top:36px;margin-bottom:4px}
  .sec-sub{font-size:.825rem;color:#6b7280;margin-bottom:18px}
  .step-row{display:flex;gap:14px;align-items:flex-start;margin-bottom:16px}
  .step-num{width:28px;height:28px;border-radius:50%;background:#4f46e5;color:#fff;font-size:.75rem;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:2px}
  .step-body h3{font-size:.95rem;font-weight:700;color:#4f46e5;margin-bottom:4px}
  .step-body p{font-size:.875rem;color:#374151}
  .grid2{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px}
  .card{border:1px solid #e5e7eb;border-radius:10px;padding:18px 20px;margin-bottom:14px;break-inside:avoid}
  .card h3{font-size:.95rem;font-weight:700;color:#111827;margin-bottom:6px}
  .card p,.card li{font-size:.85rem;color:#4b5563;line-height:1.6;margin-bottom:4px}
  .card ul{padding-left:18px;margin-top:6px}
  .tag{display:inline-block;font-size:.7rem;font-weight:600;padding:2px 8px;border-radius:20px;background:#ede9fe;color:#5b21b6;margin-right:4px;margin-bottom:4px}
  .note{background:#fffbeb;border:1px solid #fcd34d;border-radius:8px;padding:12px 16px;margin:10px 0;font-size:.8rem;color:#92400e}
  code{font-family:'SF Mono',Menlo,monospace;font-size:.78rem;background:#f3f4f6;padding:1px 6px;border-radius:4px;color:#374151}
  table{width:100%;border-collapse:collapse;margin:12px 0;font-size:.8rem}
  th{background:#f9fafb;text-align:left;padding:8px 12px;border:1px solid #e5e7eb;font-weight:600;color:#374151}
  td{padding:8px 12px;border:1px solid #e5e7eb;color:#374151;vertical-align:top}
  .arch-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:14px}
  @media print{body{padding:20px}.card{break-inside:avoid}}
`;

function openPrintWindow(title, bodyHTML) {
  const w = window.open("", "_blank");
  if (!w) { alert("Please allow popups for this site to download guides."); return; }
  w.document.write(`<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/><title>${title}</title><style>${BASE_HTML_STYLES}</style></head><body>${bodyHTML}<script>window.onload=function(){setTimeout(function(){window.print();},500);}<\/script></body></html>`);
  w.document.close();
}

function buildStepRow(num, color, title, desc) {
  return `<div class="step-row"><div class="step-num" style="background:${color}">${num}</div><div class="step-body"><h3>${title}</h3><p>${desc}</p></div></div>`;
}

// ── Interviewer guide HTML ─────────────────────────────────────────────────────

function getInterviewerHTML() {
  return `
<h1>Interviewer Guide</h1>
<p class="app-sub">Interview Coordinator — NxtWave Internal Tool</p>
<div class="desc-box">
  <p>Your workspace for managing interview assignments. You receive interview requests, set your available time slots, conduct structured interviews with question tracking, and submit domain-by-domain evaluations — all from one place.</p>
</div>

<h2>Your Workflow</h2>
<p class="sec-sub">The end-to-end journey from receiving a request to completing an interview.</p>
${buildStepRow(1,"#10b981","Set Availability","Go to My Availability and add your free time slots for upcoming dates. The admin relies on this calendar to send scheduling invites to candidates.")}
${buildStepRow(2,"#6366f1","Receive Interview Request","Once a candidate picks your slot, you receive a pending interview. You'll also get a notification.")}
${buildStepRow(3,"#8b5cf6","Accept or Decline","Open the interview from My Interviews and accept or decline. Declining frees the slot back.")}
${buildStepRow(4,"#f59e0b","Attend & Mark Attendance","After the interview start time passes, mark whether the candidate joined or was a no-show. This unlocks the evaluation form.")}
${buildStepRow(5,"#3b82f6","Record Questions & Submit Feedback","Check off which questions you asked, add remarks, then fill in the domain-by-domain evaluation form and save.")}
${buildStepRow(6,"#10b981","Mark as Completed","Once feedback is saved and the interview time has passed, mark the interview as Completed.")}

<h2 class="print-break">Page-by-Page Guide</h2>
<p class="sec-sub">What each page does and how to use it.</p>

<div class="card">
  <h3>Dashboard &nbsp;<code>/interviewer/dashboard</code></h3>
  <p>At-a-glance view of your activity. Shows summary stats (total, upcoming, pending feedback, completed), today's scheduled interviews with direct Meet links, and a quick-access list of interviews that need action from you.</p>
</div>

<div class="card">
  <h3>My Availability &nbsp;<code>/interviewer/availability</code></h3>
  <p>Set the time slots when you're free for interviews. Slots appear as <strong>Free</strong> until a candidate books them, after which they become <strong>Booked</strong> and cannot be removed.</p>
  <ul>
    <li>Pick a date from the calendar and add one or more time slots.</li>
    <li>Remove unwanted free slots with the × button — booked slots are locked.</li>
    <li>The admin sees your free slots in real time when planning invite campaigns.</li>
  </ul>
  <div class="note">⚠ Keep your availability updated regularly. The admin cannot send scheduling invites for dates where you have no free slots.</div>
</div>

<div class="card">
  <h3>My Interviews &nbsp;<code>/interviewer/interviews</code></h3>
  <p>Full list of all interviews assigned to you. Statuses: <strong>Pending Acceptance</strong> → <strong>Scheduled</strong> → <strong>Completed</strong> / <strong>No-show</strong> / <strong>Declined</strong>. Click any row to open the Interview Detail page.</p>
</div>

<div class="card">
  <h3>Interview Detail &nbsp;<code>/interviewer/interviews/:id</code></h3>
  <p>The full action page for a single interview. Contains up to four sections that appear progressively:</p>
  <ul>
    <li><strong>Accept / Decline</strong> — Respond to a pending interview. Declining frees the slot immediately.</li>
    <li><strong>Attendance Gate</strong> — Appears after the interview start time. Mark the candidate as joined (unlocks evaluation) or no-show (sets status automatically; no evaluation needed).</li>
    <li><strong>Questions Asked</strong> — Visible only if the template has questions assigned. Shows all template questions grouped by domain section.
      <ul>
        <li>Check each question you asked during the interview.</li>
        <li>Add remarks in the text box that appears when a question is checked.</li>
        <li><strong>Asked before</strong> badge (amber) — shown when this question was already asked to the same candidate in a previous interview.</li>
        <li><strong>Add your own question</strong> — Submit a question you asked that isn't in the bank. It goes to the content team's review queue.</li>
        <li>Click <strong>Save Questions</strong> to persist. This atomically increments the usage count for each checked question.</li>
      </ul>
    </li>
    <li><strong>Evaluation</strong> — Domain-by-domain structured feedback form based on the template. Scored dropdowns, text fields, and dropdown selects. Save at any time as a draft — you can update it until the interview is marked Completed.</li>
    <li><strong>Mark as Completed</strong> — Enabled only when: evaluation is saved AND interview time has passed AND attendance is confirmed as <em>joined</em>.</li>
  </ul>
</div>

<div class="card">
  <h3>Notifications &nbsp;<code>/interviewer/notifications</code></h3>
  <p>In-app alerts. Red badge in the nav = unread nudges from the admin. Open each nudge to see the requested date range and template, then respond "I'm Available" or "Not Available" and add your slots in My Availability.</p>
</div>

<div class="card">
  <h3>Profile &nbsp;<code>/interviewer/profile</code></h3>
  <p>Update your display name, phone, LinkedIn, company, role title, and years of experience. Skills are managed by the admin — contact them if your skill tags need updating.</p>
</div>

<h2>Key Concepts</h2>
<p class="sec-sub">Terms you'll encounter throughout the app.</p>
<div class="grid2">
  <div class="card"><h3>Questions Asked vs Evaluation</h3><p>These are two separate saves. You can save Questions Asked independently of the Evaluation, and vice versa. Both can be updated at any time while the interview is scheduled.</p></div>
  <div class="card"><h3>Feedback Draft</h3><p>Your evaluation is always saved as a draft until you click "Mark as Completed." You can reopen and update it as many times as needed before completing.</p></div>
  <div class="card"><h3>Attendance Gate</h3><p>A confirmation step that appears once the interview start time passes. You must mark attendance before the evaluation form becomes available.</p></div>
  <div class="card"><h3>Repeat Warning</h3><p>The "Asked before" amber badge checks prior interviews with this candidate only — not the current session. It's a reminder to avoid repetitive questioning.</p></div>
  <div class="card"><h3>Ad-hoc Question</h3><p>A question you asked that isn't in the question bank. Submitting it sends it to the content team's review queue — they may promote it to the official bank with proper tags.</p></div>
  <div class="card"><h3>usageCount</h3><p>Each time you save Questions Asked, the system atomically increments the usage count for every checked question. This powers analytics on which questions are asked most.</p></div>
</div>`;
}

// ── Content team guide HTML ────────────────────────────────────────────────────

function getContentTeamHTML() {
  return `
<h1>Content Team Guide</h1>
<p class="app-sub">Interview Coordinator — NxtWave Internal Tool</p>
<div class="desc-box">
  <p>As a content team member, you manage the interview evaluation framework — building structured templates that interviewers use to assess candidates, curating the central question bank, and reviewing ad-hoc questions submitted by interviewers during live interviews.</p>
</div>

<h2>Your Workflow</h2>
<p class="sec-sub">What you're responsible for in the system.</p>
${buildStepRow(1,"#f59e0b","Build Interview Templates","Create templates with evaluation domains, scoring fields, and question bank assignments. Templates define how every interview is structured.")}
${buildStepRow(2,"#6366f1","Populate the Question Bank","Add questions to the central bank with proper tags: domain type, difficulty, topic, and skills. Assign questions to templates.")}
${buildStepRow(3,"#10b981","Review the Review Queue","Interviewers submit ad-hoc questions during live interviews. You review these, add proper tags, and promote good ones to the central bank.")}

<h2>Interview Templates &nbsp;<code>/admin/templates</code></h2>
<p class="sec-sub">Build and manage the structured feedback templates interviewers use during evaluations.</p>

<div class="card">
  <h3>Domains Tab</h3>
  <p>Each template has one or more evaluation domains (sections). Common domain types: <code>theory</code>, <code>coding</code>, <code>project</code>, <code>resume</code>, <code>overall_feedback</code>.</p>
  <ul>
    <li><strong>Card Fields</strong> — Fields the interviewer fills in for each question / item in this domain:
      <ul>
        <li><code>scored_dropdown</code> — A weighted dropdown (e.g., Poor/Average/Good). Assign a weight (0–100) per field; weights within a domain should sum to 100.</li>
        <li><code>text</code> — Free-text observations.</li>
        <li><code>dropdown</code> — Non-scored categorical selection.</li>
      </ul>
    </li>
    <li><strong>Domain Fields</strong> — Overall section-level fields filled once per domain (e.g., domain-level rating or summary comment).</li>
    <li><strong>overall_feedback</strong> — Special domain for the final recommendation (Proceed / Hold / Reject). Always add this as the last domain.</li>
  </ul>
  <div class="note">⚠ Scored dropdown weights within a domain must sum to 100 for the auto-computed score to be accurate.</div>
</div>

<div class="card">
  <h3>Skills Tab</h3>
  <p>Tag the skills this template evaluates (e.g., ReactJS, Python, System Design). Skills are defined globally in Admin Panel → Skills. They're also used for interviewer–template matching.</p>
</div>

<div class="card">
  <h3>Question Bank Tab</h3>
  <p>Assign questions from the central question bank to this template. Interviewers see these questions in the Interview Detail page when conducting an interview.</p>
  <ul>
    <li>Search questions by text or filter by domain type.</li>
    <li>Only questions whose domainType matches an enabled domain of this template are shown by default.</li>
    <li>Click <strong>+</strong> to assign a question, <strong>×</strong> to remove.</li>
    <li>Assigned questions appear in interview sessions for interviewers to check off.</li>
  </ul>
  <div class="note">⚠ Enable at least one domain before switching to the Question Bank tab.</div>
</div>

<div class="card">
  <h3>Programs Tab</h3>
  <p>Restrict this template to specific programs (e.g., Full Stack, Data Science). Leave blank for universal access. Programs are defined in Admin Panel → Programs.</p>
</div>

<div class="card">
  <h3>Cloning Templates</h3>
  <p>Use the Clone action from the kebab menu (⋮) to duplicate a template. All domains, fields, weights, skill tags, and question assignments are copied. The clone is named "Copy of [original]".</p>
</div>

<h2>Question Bank &nbsp;<code>/admin/questions</code></h2>
<p class="sec-sub">The central repository of interview questions, organized with tags for searchability and analytics.</p>

<div class="card">
  <h3>Question Bank Tab — Fields</h3>
  <ul>
    <li><strong>Text</strong> (required) — The question as it will appear to the interviewer.</li>
    <li><strong>Domain Type</strong> (required) — Must match a domain type used in templates (e.g., <code>react_coding</code>, <code>theory</code>). Type or pick from the suggestions.</li>
    <li><strong>Difficulty</strong> — easy / medium / hard. Used for filtering and future analytics.</li>
    <li><strong>Topic</strong> — Freeform topic label (e.g., "React Hooks", "Linked Lists").</li>
    <li><strong>Skills</strong> — Multi-select chip picker from globally defined skills.</li>
    <li><strong>Assign to Templates</strong> — Select which templates this question belongs to. Updates both directions: the question knows its templates and the template's question list is updated.</li>
  </ul>
  <div class="note">Question IDs are auto-generated by Firestore. The first 8 characters are shown as <code>#xxxxxxxx</code> for reference.</div>
</div>

<div class="card">
  <h3>Bulk Upload CSV</h3>
  <p>Upload many questions at once using a CSV file. Click "Download Template" to get a sample file.</p>
  <table>
    <tr><th>Column</th><th>Required</th><th>Notes</th></tr>
    <tr><td><code>text</code></td><td>Yes</td><td>The question text</td></tr>
    <tr><td><code>domainType</code></td><td>Yes</td><td>Must match an existing domain type</td></tr>
    <tr><td><code>difficulty</code></td><td>No</td><td>easy / medium / hard (defaults to medium)</td></tr>
    <tr><td><code>topic</code></td><td>No</td><td>Freeform topic label</td></tr>
    <tr><td><code>skills</code></td><td>No</td><td>Skill names separated by <code>|</code></td></tr>
    <tr><td><code>templates</code></td><td>No</td><td>Template names separated by <code>|</code></td></tr>
  </table>
  <p>After upload, click "Parse &amp; Preview" to validate rows and see what will be imported before committing.</p>
</div>

<div class="card">
  <h3>Archive vs Delete</h3>
  <p>Questions are never permanently deleted — they are <strong>archived</strong>. Archived questions no longer appear in template assignment pickers or interview sessions, but their usage history is preserved. Use "Show Archived" filter to view and restore them.</p>
</div>

<div class="card">
  <h3>Review Queue Tab</h3>
  <p>Interviewers can submit free-form questions they asked during an interview. These appear here with status <strong>Pending</strong>.</p>
  <ul>
    <li><strong>Approve</strong> — Opens a tagging modal pre-filled with the submitted text. Add domainType, difficulty, topic, skills, and template assignments, then click "Approve &amp; Add to Bank." This creates a new question in the central bank and marks the submission as approved with a reference to the promoted question ID.</li>
    <li><strong>Reject</strong> — Marks the submission as rejected. The question is not added to the bank.</li>
  </ul>
  <div class="note">The amber badge on the Question Bank nav item shows how many submissions are currently pending review.</div>
</div>

<h2>Key Concepts</h2>
<div class="grid2">
  <div class="card"><h3>Template</h3><p>The blueprint for an interview. Defines which domains are evaluated, the scoring rubric per domain, and which questions interviewers can ask. Templates are assigned to candidates by admins.</p></div>
  <div class="card"><h3>Domain</h3><p>A section within a template evaluation (e.g., coding, theory). Each domain has card fields (per-item scoring) and domain-level fields (overall section assessment).</p></div>
  <div class="card"><h3>usageCount</h3><p>Auto-incremented each time an interviewer checks a question as "asked" and saves their Questions Asked list. Powers analytics on question frequency.</p></div>
  <div class="card"><h3>Repeat Warning</h3><p>Shown to interviewers in Interview Detail when a question has already been asked to the same candidate in a prior interview session.</p></div>
</div>`;
}

// ── Reusable UI components ────────────────────────────────────────────────────

function Section({ title, sub, children }) {
  return (
    <div className="mb-8">
      <h2 className="text-lg font-bold text-gray-900 mb-0.5">{title}</h2>
      {sub && <p className="text-sm text-gray-400 mb-4">{sub}</p>}
      {children}
    </div>
  );
}

function PageCard({ title, path, children, note }) {
  return (
    <div className="print-avoid bg-white rounded-xl border border-gray-200 p-5 mb-4">
      <div className="flex items-baseline gap-2 mb-3">
        <h3 className="text-sm font-bold text-gray-900">{title}</h3>
        <code className="text-[10px] font-mono text-indigo-500 bg-indigo-50 px-1.5 py-0.5 rounded">{path}</code>
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
      <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 flex-shrink-0 mt-1.5" />
      <span className="text-sm text-gray-600">{children}</span>
    </div>
  );
}

function ConceptCard({ title, children }) {
  return (
    <div className="print-avoid bg-white rounded-xl border border-gray-200 p-4">
      <h3 className="text-sm font-bold text-gray-800 mb-1">{title}</h3>
      <p className="text-xs text-gray-500 leading-relaxed">{children}</p>
    </div>
  );
}

function HowStep({ num, color, title, desc }) {
  const colors = { indigo: "bg-indigo-600", emerald: "bg-emerald-500", violet: "bg-violet-600", amber: "bg-amber-500", blue: "bg-blue-600", teal: "bg-teal-600" };
  return (
    <div className="flex gap-4">
      <div className={`w-8 h-8 rounded-full ${colors[color] || colors.indigo} text-white text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5`}>
        {num}
      </div>
      <div className="flex-1 pb-5 border-l-2 border-gray-100 pl-4 -ml-6 ml-0">
        <h3 className="text-sm font-bold text-gray-900">{title}</h3>
        <p className="text-sm text-gray-500 mt-0.5">{desc}</p>
      </div>
    </div>
  );
}

// ── Admin About page ───────────────────────────────────────────────────────────

export default function AboutPage() {
  const { userProfile } = useAuth();
  const role = userProfile?.role;
  const isContent = role === "content_team";

  useEffect(() => {
    injectPrintCSS();
    return () => document.getElementById("about-print-css")?.remove();
  }, []);

  return (
    <div className="p-8 max-w-4xl">

      {/* ── Header ── */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {isContent ? "Content Team Guide" : "Interview Coordinator — Admin Guide"}
          </h1>
          <p className="text-sm text-gray-400 mt-0.5">NxtWave Internal Tool</p>
        </div>
        <div className="flex gap-2 print-hide">
          <button
            onClick={() => window.print()}
            className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600 text-white text-xs font-semibold rounded-lg hover:bg-indigo-700 transition-colors">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Print / PDF
          </button>
          {!isContent && (
            <>
              <button
                onClick={() => openPrintWindow("Interviewer Guide — Interview Coordinator", getInterviewerHTML())}
                className="flex items-center gap-1.5 px-3 py-2 bg-white border border-gray-300 text-gray-700 text-xs font-semibold rounded-lg hover:bg-gray-50 transition-colors">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Interviewer Guide
              </button>
              <button
                onClick={() => openPrintWindow("Content Team Guide — Interview Coordinator", getContentTeamHTML())}
                className="flex items-center gap-1.5 px-3 py-2 bg-white border border-gray-300 text-gray-700 text-xs font-semibold rounded-lg hover:bg-gray-50 transition-colors">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Content Team Guide
              </button>
            </>
          )}
        </div>
      </div>

      {/* ── What is this? ── */}
      <div className="bg-gray-50 border border-gray-200 rounded-xl p-5 mb-8 text-sm text-gray-600 leading-relaxed">
        <p>
          <strong className="text-gray-900">Interview Coordinator</strong> is NxtWave's internal operations tool for managing the full interview lifecycle —
          from configuring structured evaluation templates and building a central question bank, to sending scheduling invites to candidates,
          conducting interviews with question tracking and domain-level scoring, and reviewing candidate feedback.
        </p>
        <p className="mt-2">
          Access is role-gated. An admin must approve each new user and assign them a role that controls which pages they can see.
          The app is built on React + Firebase and deployed on Vercel.
        </p>
      </div>

      {/* ── How it works (admin only) ── */}
      {!isContent && (
        <Section title="How it works" sub="The end-to-end journey from setup to completed interview.">
          <div className="space-y-0">
            <HowStep num={1} color="indigo"  title="Configure Templates"       desc="Admin or content team creates interview templates with evaluation domains (theory, coding, project, resume), scoring fields, and assigns questions from the question bank." />
            <HowStep num={2} color="violet"  title="Add Candidates"            desc="Admin adds candidates manually or via bulk CSV import, assigns them to programs and interview templates." />
            <HowStep num={3} color="teal"    title="Send Scheduling Invites"   desc="Admin sends candidates a unique self-scheduling link tied to a date range and interviewer availability pool." />
            <HowStep num={4} color="amber"   title="Candidate Books a Slot"    desc="Candidate opens the link, verifies via OTP, picks an available interviewer slot. A pending interview is created automatically." />
            <HowStep num={5} color="blue"    title="Conduct the Interview"     desc="Interviewer accepts, marks attendance, records questions asked with remarks, and submits domain-by-domain structured evaluation." />
            <HowStep num={6} color="emerald" title="Review & Export"           desc="Admin views all completed interviews, structured feedback, scores, and can export results." />
          </div>
        </Section>
      )}

      {/* ── Page-by-page guide ── */}
      <Section title="Page-by-Page Guide" sub="What each page does and how to use it.">

        {!isContent && (
          <PageCard title="Dashboard" path="/admin/dashboard">
            <Bullet>Summary stats: total candidates, scheduled interviews today, pending feedback, completed interviews.</Bullet>
            <Bullet>Recent interviews list with status and quick-access links.</Bullet>
            <Bullet>Pending user approvals that need your action.</Bullet>
          </PageCard>
        )}

        {!isContent && (
          <PageCard title="Candidates" path="/admin/candidates"
            note="A candidate must be assigned at least one interview template before they can be scheduled.">
            <Bullet>Add candidates manually with: name, UID, email, phone, resume link, notes.</Bullet>
            <Bullet>Bulk import via CSV or Excel — required column: <code>name</code>. Optional: <code>uid</code>, <code>email</code>, <code>phone</code>, <code>resumeLink</code>, <code>notes</code>. Download the sample template from the Import modal.</Bullet>
            <Bullet>Assign candidates to a Program and one or more Interview Templates.</Bullet>
            <Bullet>Bulk edit: select multiple candidates → assign program or templates at once.</Bullet>
            <Bullet>Search by name, UID, or email.</Bullet>
          </PageCard>
        )}

        {!isContent && (
          <PageCard title="Interviewers" path="/admin/interviewers">
            <Bullet>All users with <code>interviewer</code> or <code>interviewer_content</code> roles.</Bullet>
            <Bullet>Search by name or email. View profile details including skills and assigned templates.</Bullet>
          </PageCard>
        )}

        <PageCard title="Interview Templates" path="/admin/templates"
          note="Enable at least one domain before switching to the Question Bank tab.">
          <p className="font-semibold text-gray-700 mb-1">Domains tab</p>
          <Bullet>Add evaluation sections. Common types: <code>theory</code>, <code>coding</code>, <code>project</code>, <code>resume</code>, <code>overall_feedback</code>.</Bullet>
          <Bullet><strong>Card Fields</strong> — per-item fields the interviewer fills in: <code>scored_dropdown</code> (weighted), <code>text</code>, <code>dropdown</code>. Weights on scored fields should sum to 100 per domain.</Bullet>
          <Bullet><strong>Domain Fields</strong> — section-level fields filled once per domain (overall rating, summary).</Bullet>
          <Bullet>The <code>overall_feedback</code> domain is for the final hiring recommendation.</Bullet>

          <p className="font-semibold text-gray-700 mt-3 mb-1">Skills tab</p>
          <Bullet>Tag the skills this template evaluates. Used for interviewer matching.</Bullet>

          <p className="font-semibold text-gray-700 mt-3 mb-1">Question Bank tab</p>
          <Bullet>Search and assign questions from the central question bank. Filter by domain to find relevant questions.</Bullet>
          <Bullet>Assigned questions appear in Interview Detail for interviewers to check off during interviews.</Bullet>

          <p className="font-semibold text-gray-700 mt-3 mb-1">Programs tab</p>
          <Bullet>Restrict template visibility to specific programs. Leave empty for universal access.</Bullet>

          <p className="font-semibold text-gray-700 mt-3 mb-1">Clone</p>
          <Bullet>Copies all domains, fields, weights, skill tags, and question assignments. Named "Copy of [original]".</Bullet>
        </PageCard>

        <PageCard title="Question Bank" path="/admin/questions">
          <p className="font-semibold text-gray-700 mb-1">Question Bank tab</p>
          <Bullet>Create/edit questions with: text, domainType, difficulty (easy/medium/hard), topic, skills (multi-select), and template assignments.</Bullet>
          <Bullet>Filter by domain, difficulty, skill, or template. Text search across question content.</Bullet>
          <Bullet>Archive instead of delete — archived questions are hidden from pickers but their history is preserved. Restore at any time.</Bullet>
          <Bullet><strong>usageCount</strong> — how many times this question has been asked across all interviews. Auto-incremented when interviewers save their Questions Asked list.</Bullet>
          <Bullet>Bulk upload CSV: columns <code>text</code>*, <code>domainType</code>*, <code>difficulty</code>, <code>topic</code>, <code>skills</code> (pipe-separated), <code>templates</code> (pipe-separated). Download the template CSV first.</Bullet>
          <Bullet>Question IDs are auto-generated by Firestore — shown as <code>#xxxxxxxx</code> for reference.</Bullet>

          <p className="font-semibold text-gray-700 mt-3 mb-1">Review Queue tab</p>
          <Bullet>Ad-hoc questions submitted by interviewers during live interviews. Status: <strong>Pending → Approved / Rejected</strong>.</Bullet>
          <Bullet><strong>Approve</strong> — tag with domainType, difficulty, topic, skills, templates → promotes to central bank.</Bullet>
          <Bullet><strong>Reject</strong> — marks as rejected. Amber nav badge shows pending count.</Bullet>
        </PageCard>

        {!isContent && (
          <PageCard title="Nudge (Scheduling)" path="/admin/nudge">
            <p className="font-semibold text-gray-700 mb-1">Interviewers tab</p>
            <Bullet>Set a date range and see each interviewer's available slot count for those dates.</Bullet>
            <Bullet>Send email nudges to interviewers who haven't added availability yet.</Bullet>

            <p className="font-semibold text-gray-700 mt-3 mb-1">Candidates tab</p>
            <Bullet>Select a template + date range, pick candidates, send scheduling invite links.</Bullet>
            <Bullet>Each candidate receives a unique link to self-schedule from available interviewer slots.</Bullet>

            <p className="font-semibold text-gray-700 mt-3 mb-1">Sent Invites tab</p>
            <Bullet>Full log of all sent invites. Status flow: <strong>Invite Sent → OTP Verified → Slot Selected → Pending Confirmation → Confirmed</strong>.</Bullet>
            <Bullet>Actions: <strong>Copy Link</strong>, <strong>Resend</strong> (disabled for Confirmed/Cancelled), <strong>Delete</strong>.</Bullet>
            <Bullet><strong>Export Links CSV</strong> — download all invite URLs.</Bullet>
            <Bullet>Pending Confirmations section: once a candidate picks a slot, confirm to create the interview.</Bullet>
          </PageCard>
        )}

        {!isContent && (
          <PageCard title="Interviews" path="/admin/interviews">
            <Bullet>All interviews across all candidates and interviewers. Columns: Candidate, Interviewer, Template, Round, Date/Time, Status.</Bullet>
            <Bullet>Filter by status, date, or search by candidate/interviewer name.</Bullet>
            <Bullet>Click any row to open the interview detail (admin read-only view with full feedback).</Bullet>
          </PageCard>
        )}

        {!isContent && (
          <PageCard title="Admin Panel" path="/admin/panel">
            <p className="font-semibold text-gray-700 mb-1">Users tab</p>
            <Bullet>Pending signups: assign a role and approve, or reject (deletes the record).</Bullet>
            <Bullet>Active users: change role (takes effect immediately) or revoke access (returns to Pending).</Bullet>
            <Bullet>Cannot change your own role. Cannot remove the last admin.</Bullet>

            <p className="font-semibold text-gray-700 mt-3 mb-1">Invite Codes tab</p>
            <Bullet>Generate one-time signup links to share with new users who don't have accounts yet.</Bullet>

            <p className="font-semibold text-gray-700 mt-3 mb-1">Skills tab</p>
            <Bullet>Add/remove skill tags used globally across templates and question bank.</Bullet>

            <p className="font-semibold text-gray-700 mt-3 mb-1">Programs tab</p>
            <Bullet>Add/remove program names (e.g., Full Stack, Data Science). Candidates are grouped by program.</Bullet>
          </PageCard>
        )}
      </Section>

      {/* ── Role overview ── */}
      {!isContent && (
        <Section title="Roles & Access" sub="What each role can see and do.">
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden print-avoid">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  {["Role", "Pages accessible", "Typical user"].map(h => (
                    <th key={h} className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide px-4 py-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 text-sm">
                {[
                  { role: "admin", pages: "All pages", user: "Operations manager, HR lead" },
                  { role: "content_team", pages: "Interview Templates, Question Bank", user: "Curriculum / content designer" },
                  { role: "interviewer_content", pages: "Interviewer portal + Interview Templates + Question Bank", user: "Senior interviewer who also builds templates" },
                  { role: "interviewer", pages: "Dashboard, My Availability, My Interviews, Notifications, Profile", user: "Panelist / interviewer" },
                ].map(r => (
                  <tr key={r.role} className="hover:bg-gray-50">
                    <td className="px-4 py-3"><code className="text-xs bg-gray-100 text-gray-700 px-1.5 py-0.5 rounded font-mono">{r.role}</code></td>
                    <td className="px-4 py-3 text-gray-600">{r.pages}</td>
                    <td className="px-4 py-3 text-gray-400">{r.user}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      {/* ── Key concepts ── */}
      <Section title="Key Concepts" sub="Terms and logic you'll encounter throughout the app.">
        <div className="grid grid-cols-2 gap-3">
          {(isContent ? [
            { title: "Template", body: "The blueprint for an interview. Defines which domains are evaluated, the scoring rubric per domain, and which questions interviewers can ask during the session." },
            { title: "Domain", body: "A section within a template evaluation (e.g., coding, theory, project). Each domain has card fields for per-item scoring and domain fields for overall section assessment." },
            { title: "Question Bank", body: "Central repository of questions tagged with domain type, difficulty, topic, and skills. Questions are assigned to templates and shown to interviewers during interviews." },
            { title: "Ad-hoc Question", body: "A question submitted by an interviewer during a live interview that isn't in the bank. Content team reviews it in the Review Queue and can promote it to the central bank." },
            { title: "usageCount", body: "Auto-incremented each time an interviewer checks a question as asked and saves their Questions Asked list. Powers analytics on question frequency." },
            { title: "Repeat Warning", body: "Shown to interviewers in Interview Detail when a question was already asked to the same candidate in a prior interview." },
          ] : [
            { title: "Template", body: "The blueprint for an interview. Defines which domains are evaluated, the scoring rubric per domain, and which questions interviewers can ask." },
            { title: "Domain", body: "A section within a template evaluation (e.g., coding, theory, project). Each domain has card fields (per-item scoring) and domain fields (overall section assessment)." },
            { title: "Question Bank", body: "Central repository of questions tagged with domain type, difficulty, topic, and skills. Assigned to templates; shown to interviewers during interviews to check off." },
            { title: "Ad-hoc Question", body: "A question asked during an interview that isn't in the bank. Submitted to the review queue so content team can promote it with proper tags." },
            { title: "Scheduling Invite", body: "A unique link sent to a candidate allowing them to self-schedule from an interviewer's available slots within a specified date window." },
            { title: "Attendance Gate", body: "Appears after the interview start time passes. Interviewer must confirm the candidate joined (unlocks evaluation) or mark a no-show before the evaluation form is available." },
            { title: "Feedback Draft", body: "Evaluations are always saved as drafts. The interview only locks once 'Mark as Completed' is clicked — requires evaluation saved + time past + attendance confirmed." },
            { title: "Repeat Warning", body: "Amber badge shown in Interview Detail when a question was already asked to the same candidate in a prior interview session." },
            { title: "usageCount", body: "Atomically incremented when an interviewer saves their Questions Asked list. Tracks how many times each question has been asked across all interviews." },
            { title: "Pending Confirmation", body: "Once a candidate selects a slot from a scheduling invite, the booking enters Pending Confirmation. Admin confirms it to create the interview and notify both parties." },
          ]).map(c => (
            <ConceptCard key={c.title} title={c.title}>{c.body}</ConceptCard>
          ))}
        </div>
      </Section>

      {/* ── Architecture ── */}
      <Section title="Architecture & Tech Stack" sub="What the app is built on.">
        <div className="grid grid-cols-2 gap-3">
          {[
            { title: "Frontend", body: "React 18 + Vite, Tailwind CSS v3, React Router v6. Deployed as a static site on Vercel with automatic deploys from the main branch." },
            { title: "Auth & Database", body: "Firebase Authentication (email/password) with role-based route guards. Firebase Firestore for all app data with real-time onSnapshot subscriptions." },
            { title: "Key Firestore Collections", body: "users · candidates · interviewTemplates · questions · adhocQuestions · interviews · scheduleInvites · availability · notifications · programs · skills" },
            { title: "Role-based Access", body: "Every route is wrapped in an AdminGuard or InterviewerGuard. Nav items are filtered client-side by role. Firestore security rules enforce role checks server-side." },
          ].map(c => (
            <ConceptCard key={c.title} title={c.title}>{c.body}</ConceptCard>
          ))}
        </div>
      </Section>

    </div>
  );
}
