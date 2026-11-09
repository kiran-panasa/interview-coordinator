import { timingSafeEqual } from "node:crypto";
import { getDb } from "../_lib/firebaseAdmin.js";

// Inbound sync from the Edge portal — its "Sync" button POSTs students
// (uid, name, email, phone, program, template names) and they're stored as
// candidates, the same way the Candidates page CSV import does it in
// "replace" mode (src/pages/admin/CandidatesPage.jsx handleCSVImport):
// group by uid/email, match an existing candidate by email or uid
// (case-insensitive), overwrite only the fields that were actually sent,
// and only ever ADD templates — never remove one.
//
// Stricter than the CSV import, on purpose (an automated sync has no admin
// eyeballing a preview): a student is REJECTED as a whole — nothing written
// for them — if any template name doesn't match an active Edge 2.0
// template, or if they already exist under a different program. Rejected
// students are returned to the Edge portal so the data can be fixed there
// and re-synced. See api/sync/README-edge.md.
//
// Auth is deliberately self-contained here (its own EDGE_SYNC_API_TOKEN)
// rather than going through api/_lib/auth.js, so the Academy sync's token
// and its check are left completely untouched.

const EDGE_PROGRAM_NAME = "Edge 2.0";
const MAX_CANDIDATES = 500;
const SOURCE = "edge-portal";

function sendJson(res, status, body) {
  res.status(status).setHeader("Cache-Control", "no-store").json(body);
}

function safeEqual(a, b) {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

function checkEdgeAuth(req) {
  const expected = process.env.EDGE_SYNC_API_TOKEN;
  if (!expected) {
    return { status: 500, body: { success: false, error: "server_misconfigured", message: "EDGE_SYNC_API_TOKEN is not configured." } };
  }
  const header = req.headers.authorization || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    return { status: 401, body: { success: false, error: "unauthorized", message: "Missing or malformed Authorization header. Expected: Bearer <token>." } };
  }
  if (!safeEqual(match[1].trim(), expected)) {
    return { status: 401, body: { success: false, error: "unauthorized", message: "Invalid bearer token." } };
  }
  return null;
}

const str = (v) => (typeof v === "string" ? v.trim() : typeof v === "number" ? String(v).trim() : "");
const lower = (v) => (v || "").toLowerCase();

// Template lifecycle — "active" or unset is bookable; "draft"/"archived"
// are hidden from students (see Template.status in src/types.ts).
const isActiveTemplate = (t) => !t.status || t.status === "active";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return sendJson(res, 405, { success: false, error: "method_not_allowed", message: "Only POST is supported." });
  }

  const authError = checkEdgeAuth(req);
  if (authError) return sendJson(res, authError.status, authError.body);

  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch { body = null; }
  }
  const entries = body?.candidates;
  if (!Array.isArray(entries)) {
    return sendJson(res, 400, { success: false, error: "invalid_request", message: "Body must be JSON: { \"candidates\": [ ... ] }." });
  }
  if (entries.length === 0) {
    return sendJson(res, 400, { success: false, error: "invalid_request", message: "candidates must not be empty." });
  }
  if (entries.length > MAX_CANDIDATES) {
    return sendJson(res, 400, { success: false, error: "too_many_candidates", message: `At most ${MAX_CANDIDATES} candidates per request — send larger lists in chunks.` });
  }

  try {
    const db = getDb();

    const [programsSnap, templatesSnap, candidatesSnap] = await Promise.all([
      db.collection("programs").get(),
      db.collection("interviewTemplates").get(),
      db.collection("candidates").get(),
    ]);

    const edgeProgramDoc = programsSnap.docs.find(d => lower(str(d.data().name)) === lower(EDGE_PROGRAM_NAME));
    if (!edgeProgramDoc) {
      return sendJson(res, 500, { success: false, error: "server_misconfigured", message: `Program "${EDGE_PROGRAM_NAME}" was not found in Interview Coordinator.` });
    }
    const edgeProgramId = edgeProgramDoc.id;
    const edgeProgramName = edgeProgramDoc.data().name;

    // Only templates under Edge 2.0 are ever matched — a same-named
    // template under another program counts as "not found".
    const edgeTemplatesByName = new Map();
    templatesSnap.docs.forEach(d => {
      const t = d.data();
      if (t.program === edgeProgramId && t.name) {
        edgeTemplatesByName.set(lower(str(t.name)), { id: d.id, ...t });
      }
    });

    // In-memory copy of every candidate, kept current as this request
    // plans its writes, so two groups that resolve to the same existing
    // candidate merge onto each other instead of one overwriting the other.
    const candidates = candidatesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const findExisting = (row) => candidates.find(c =>
      (row.email && lower(c.email) === lower(row.email)) ||
      (row.uid && lower(c.uid) === lower(row.uid))
    );

    // ── Normalize + group (same as the CSV import) ─────────────────────────
    const groups = new Map();
    const order = [];
    entries.forEach((entry, i) => {
      const e = entry && typeof entry === "object" ? entry : {};
      const row = {
        uid: str(e.uid),
        name: str(e.name),
        email: str(e.email),
        phone: str(e.phone),
        program: str(e.program),
        templatesProvided: Array.isArray(e.templates),
        templates: Array.isArray(e.templates) ? e.templates.map(str).filter(Boolean) : [],
      };
      const key = (row.uid && `uid:${lower(row.uid)}`) || (row.email && `email:${lower(row.email)}`) || `__row_${i}`;
      if (!groups.has(key)) {
        groups.set(key, { ...row, templates: [], programs: new Set(), templatesProvided: false });
        order.push(key);
      }
      const g = groups.get(key);
      row.templates.forEach(name => { if (!g.templates.some(n => lower(n) === lower(name))) g.templates.push(name); });
      if (row.templatesProvided) g.templatesProvided = true;
      g.programs.add(row.program);
      // First non-blank value wins, so a later entry with blank fields
      // never blanks out what an earlier entry for the same student sent.
      for (const f of ["uid", "name", "email", "phone"]) {
        if (!g[f] && row[f]) g[f] = row[f];
      }
    });

    // ── Validate + plan writes ─────────────────────────────────────────────
    const rejected = [];
    const writes = new Map(); // docId -> { kind: "create" | "update", data }
    let created = 0, updated = 0, unchanged = 0;
    const now = new Date().toISOString();

    for (const key of order) {
      const g = groups.get(key);
      const errors = [];

      if (!g.name) errors.push({ code: "missing_field", field: "name", message: "name is required" });
      if (!g.uid && !g.email) errors.push({ code: "missing_field", field: "uid/email", message: "uid or email is required (at least one)" });

      const programs = [...g.programs];
      if (programs.some(p => lower(p) !== lower(edgeProgramName))) {
        const bad = programs.find(p => lower(p) !== lower(edgeProgramName));
        errors.push({ code: "invalid_program", field: "program", message: bad ? `program must be "${edgeProgramName}" (got "${bad}")` : `program is required and must be "${edgeProgramName}"` });
      }

      const templateIds = [];
      if (!g.templates.length) {
        errors.push({ code: "no_templates", field: "templates", message: g.templatesProvided ? "templates must not be empty" : "templates is required (a list of template names)" });
      }
      for (const name of g.templates) {
        const t = edgeTemplatesByName.get(lower(name));
        if (!t) errors.push({ code: "template_not_found", template: name, message: `No template named "${name}" under ${edgeProgramName}` });
        else if (!isActiveTemplate(t)) errors.push({ code: "template_inactive", template: name, message: `Template "${name}" is ${t.status} — students can't see or book it` });
        else if (!templateIds.includes(t.id)) templateIds.push(t.id);
      }

      const existing = (g.uid || g.email) ? findExisting(g) : null;
      if (existing && existing.program && existing.program !== edgeProgramId) {
        const otherProgram = programsSnap.docs.find(d => d.id === existing.program)?.data().name || existing.program;
        errors.push({ code: "program_conflict", message: `Already exists in Interview Coordinator under program "${otherProgram}"` });
      }

      if (errors.length) {
        rejected.push({ uid: g.uid || null, email: g.email || null, name: g.name || null, errors });
        continue;
      }

      if (existing) {
        // Only fields Edge actually sent a value for; templates merge.
        const fieldUpdates = {};
        for (const f of ["name", "phone"]) {
          if (g[f] && g[f] !== existing[f]) fieldUpdates[f] = g[f];
        }
        // uid/email are matched case-insensitively — a case-only
        // difference isn't a real change, so don't churn the stored value.
        for (const f of ["uid", "email"]) {
          if (g[f] && lower(g[f]) !== lower(existing[f])) fieldUpdates[f] = g[f];
        }
        if (!existing.program) fieldUpdates.program = edgeProgramId;
        const currentIds = existing.templateIds || [];
        const mergedIds = [...new Set([...currentIds, ...templateIds])];
        if (mergedIds.length !== currentIds.length) fieldUpdates.templateIds = mergedIds;

        if (!Object.keys(fieldUpdates).length) { unchanged++; continue; }

        Object.assign(existing, fieldUpdates);
        const prev = writes.get(existing.id);
        if (prev) Object.assign(prev.data, prev.kind === "create" ? existing : fieldUpdates);
        else writes.set(existing.id, { kind: "update", data: { ...fieldUpdates } });
        updated++;
      } else {
        const ref = db.collection("candidates").doc();
        const payload = {
          name: g.name, uid: g.uid, email: g.email, phone: g.phone,
          resumeLink: "", notes: "",
          program: edgeProgramId,
          templateIds,
          source: SOURCE,
          createdBy: SOURCE,
          createdAt: now,
        };
        writes.set(ref.id, { kind: "create", data: payload });
        candidates.push({ id: ref.id, ...payload });
        created++;
      }
    }

    // ── Commit (one atomic batch — ≤500 students means ≤500 writes) ────────
    if (writes.size) {
      const batch = db.batch();
      for (const [id, w] of writes) {
        const ref = db.collection("candidates").doc(id);
        if (w.kind === "create") {
          const { id: _omit, ...data } = w.data;
          batch.set(ref, data);
        } else {
          batch.update(ref, w.data);
        }
      }
      await batch.commit();
    }

    return sendJson(res, 200, {
      success: true,
      summary: { received: entries.length, created, updated, unchanged, rejected: rejected.length },
      rejected,
      meta: { syncedAt: new Date().toISOString() },
    });
  } catch (err) {
    console.error("edge-candidates sync error:", err);
    return sendJson(res, 500, { success: false, error: "internal_error", message: "Something went wrong processing the sync request. Nothing from this request was saved — safe to retry." });
  }
}
