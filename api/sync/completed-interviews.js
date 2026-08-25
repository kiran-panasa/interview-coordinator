import { getDb } from "../_lib/firebaseAdmin.js";
import { checkBearerAuth } from "../_lib/auth.js";
import { attachDescriptorsToDomains, loadIntegrityDomainFields } from "../_lib/feedbackDescriptors.js";

// Firestore reads per internal batch while hunting for `pageSize` results
// that also satisfy the (non-indexable) programId join filter — see below.
const BATCH_SIZE = 200;
// Safety cap on internal batches per request, so a very narrow programId
// filter over a huge dataset can't turn one HTTP request into an unbounded
// scan. Hitting this just means "there may be more" — the client pages
// again with the returned cursor; nothing is lost or duplicated.
const MAX_BATCHES = 10;

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function sendJson(res, status, body) {
  res.status(status).setHeader("Cache-Control", "no-store").json(body);
}

function encodeCursor(orderValue, docId) {
  return Buffer.from(JSON.stringify({ v: orderValue, id: docId }), "utf8").toString("base64url");
}
function decodeCursor(token) {
  try {
    const { v, id } = JSON.parse(Buffer.from(token, "base64url").toString("utf8"));
    if (typeof id !== "string" || v === undefined) return null;
    return { orderValue: v, docId: id };
  } catch {
    return null;
  }
}

// Interviews don't store programId directly — it lives on the template
// they were scheduled from. Build a lookup once per request rather than
// per document.
async function loadTemplateIndex(db) {
  const snap = await db.collection("interviewTemplates").get();
  const byId = new Map();
  snap.forEach(doc => {
    const data = doc.data();
    const domains = Array.isArray(data.domains) ? data.domains : [];
    byId.set(doc.id, {
      id: doc.id,
      name: data.name || "",
      programId: data.program || null,
      domainDefsById: new Map(domains.map(dom => [dom.id, dom])),
    });
  });
  return byId;
}

function mapInterview(doc, templateById, integrityDomainFields) {
  const d = doc.data();
  const template = templateById.get(d.templateId) || null;
  const fb = d.feedback || null;

  return {
    interviewId: doc.id,
    status: d.status,
    round: d.round || null,
    candidate: {
      id: d.candidateId || null,
      name: d.candidateName || null,
      email: d.candidateEmail || null,
    },
    interviewer: {
      id: d.interviewerId || null,
      name: d.interviewerName || null,
      email: d.interviewerEmail || null,
    },
    template: template ? { id: template.id, name: template.name } : (d.templateId ? { id: d.templateId, name: d.templateName || null } : null),
    program: template?.programId ? { id: template.programId } : null,
    schedule: {
      date: d.scheduledDate || null,
      time: d.scheduledTime || null,
    },
    feedback: fb ? {
      overallRecommendation: fb.overallRecommendation ?? null,
      finalVerdict: fb.finalVerdict ?? null,
      comments: fb.comments ?? null,
      // Each card/domain field's raw score is left as-is; a sibling
      // `descriptors` object (same shape) carries the option's label text
      // (e.g. score 0 → "Weak in communication") looked up from the
      // interview's own template — see api/_lib/feedbackDescriptors.js.
      domains: fb.domains ? attachDescriptorsToDomains(fb.domains, template?.domainDefsById, integrityDomainFields) : null,
      submittedAt: fb.submittedAt ?? null,
    } : null,
    aiReport: d.aiReport || null,
    links: {
      meetLink: d.meetLink || null,
      recordingUrl: d.meetingRecordingUrl || null,
      transcriptUrl: d.transcriptUrl || null,
    },
    completedAt: d.attendanceMarkedAt || d.updatedAt || null,
    createdAt: d.createdAt || null,
    updatedAt: d.updatedAt || null,
  };
}

export default async function handler(req, res) {
  // Bearer-token-protected read API — origin isn't the security boundary,
  // so CORS is left open; tighten via ACADEMY_APP_ORIGIN if you want to
  // additionally restrict which browser origins can call this.
  res.setHeader("Access-Control-Allow-Origin", process.env.ACADEMY_APP_ORIGIN || "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();

  if (req.method !== "GET") {
    return sendJson(res, 405, { success: false, error: "method_not_allowed", message: "Only GET is supported." });
  }

  const authError = checkBearerAuth(req);
  if (authError) return sendJson(res, authError.status, authError.body);

  const { programId, fromDate, lastSyncTime, cursor } = req.query;

  if (fromDate && !ISO_DATE_RE.test(fromDate)) {
    return sendJson(res, 400, { success: false, error: "invalid_parameter", message: "fromDate must be YYYY-MM-DD." });
  }
  let lastSyncIso = null;
  if (lastSyncTime) {
    const parsed = new Date(lastSyncTime);
    if (Number.isNaN(parsed.getTime())) {
      return sendJson(res, 400, { success: false, error: "invalid_parameter", message: "lastSyncTime must be a valid ISO-8601 datetime." });
    }
    lastSyncIso = parsed.toISOString();
  }

  let pageSize = DEFAULT_PAGE_SIZE;
  if (req.query.pageSize !== undefined) {
    const n = Number(req.query.pageSize);
    if (!Number.isInteger(n) || n < 1 || n > MAX_PAGE_SIZE) {
      return sendJson(res, 400, { success: false, error: "invalid_parameter", message: `pageSize must be an integer between 1 and ${MAX_PAGE_SIZE}.` });
    }
    pageSize = n;
  }

  let startAfter = null;
  if (cursor) {
    startAfter = decodeCursor(cursor);
    if (!startAfter) {
      return sendJson(res, 400, { success: false, error: "invalid_parameter", message: "cursor is invalid or corrupted." });
    }
  }

  // lastSyncTime (precise, incremental) takes priority over fromDate
  // (coarse, by scheduled date) when both are given. Firestore requires the
  // first orderBy to match any inequality filter's field.
  const orderField = lastSyncIso ? "updatedAt" : "scheduledDate";

  try {
    const db = getDb();
    const [templateById, integrityDomainFields] = await Promise.all([
      loadTemplateIndex(db),
      loadIntegrityDomainFields(db),
    ]);

    const templateIdsForProgram = programId
      ? new Set([...templateById.values()].filter(t => t.programId === programId).map(t => t.id))
      : null;
    if (programId && templateIdsForProgram.size === 0) {
      // Valid request, just no templates under that program — return an
      // empty page rather than treating it as an error.
      return sendJson(res, 200, {
        success: true,
        data: [],
        pagination: { pageSize, nextCursor: null, hasMore: false },
        meta: { syncedAt: new Date().toISOString() },
      });
    }

    let base = db.collection("interviews").where("status", "==", "completed");
    if (lastSyncIso) base = base.where("updatedAt", ">", lastSyncIso);
    else if (fromDate) base = base.where("scheduledDate", ">=", fromDate);
    base = base.orderBy(orderField, "asc").orderBy("__name__", "asc");

    const results = [];
    let cursorPos = startAfter;
    let exhausted = false;

    for (let batch = 0; batch < MAX_BATCHES && results.length < pageSize; batch++) {
      let q = base.limit(BATCH_SIZE);
      q = cursorPos ? q.startAfter(cursorPos.orderValue, cursorPos.docId) : q;

      const snap = await q.get();
      if (snap.empty) { exhausted = true; break; }

      for (const doc of snap.docs) {
        cursorPos = { orderValue: doc.get(orderField), docId: doc.id };
        const data = doc.data();
        if (!templateIdsForProgram || templateIdsForProgram.has(data.templateId)) {
          results.push(mapInterview(doc, templateById, integrityDomainFields));
          if (results.length >= pageSize) break;
        }
      }

      if (snap.size < BATCH_SIZE) { exhausted = true; break; }
    }

    const hasMore = !exhausted;
    const nextCursor = hasMore && cursorPos ? encodeCursor(cursorPos.orderValue, cursorPos.docId) : null;

    return sendJson(res, 200, {
      success: true,
      data: results,
      pagination: { pageSize, nextCursor, hasMore },
      meta: { syncedAt: new Date().toISOString() },
    });
  } catch (err) {
    console.error("completed-interviews sync error:", err);
    return sendJson(res, 500, { success: false, error: "internal_error", message: "Something went wrong processing the sync request." });
  }
}
