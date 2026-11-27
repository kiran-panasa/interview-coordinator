import { db } from "../firebase";
import {
  collection, doc, getDoc, getDocs, addDoc, query, where, orderBy, limit,
} from "firebase/firestore";
import type { ScoringRuleVersion } from "../types";

const RAW_MAX = 5; // finalVerdict's scale everywhere else in the app — not configurable per template.

function rulesCollection(templateId: string) {
  return collection(db, "interviewTemplates", templateId, "scoringRules");
}

// Every version this template has ever had, newest effectiveFrom first —
// drives the admin's "History" list. Never filtered by date; that's
// getActiveScoringRule below.
export async function getScoringRuleVersions(templateId: string): Promise<ScoringRuleVersion[]> {
  const snap = await getDocs(query(rulesCollection(templateId), orderBy("effectiveFrom", "desc")));
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as ScoringRuleVersion));
}

// The version in force on `asOfIso` (defaults to today) — the single
// building block both completeInterview (api/interviews.ts, at the moment a
// score is finalized and frozen) and anything displaying "what rule is
// currently active" for a template should call. A version is never edited
// in place, so this always resolves the same way for the same templateId +
// asOfIso, no matter how many newer versions get added later — that's what
// keeps an old interview's already-computed normalizedScore/finalStatus
// correct forever, since nothing ever re-derives it from "today's" rule.
export async function getActiveScoringRule(templateId: string, asOfIso?: string): Promise<ScoringRuleVersion | null> {
  const cutoff = asOfIso || new Date().toISOString().slice(0, 10);
  const snap = await getDocs(query(
    rulesCollection(templateId),
    where("effectiveFrom", "<=", cutoff),
    orderBy("effectiveFrom", "desc"),
    limit(1)
  ));
  if (snap.empty) return null;
  const d = snap.docs[0];
  return { id: d.id, ...d.data() } as ScoringRuleVersion;
}

// Always a NEW document — see the comment on ScoringRuleVersion in types.ts
// for why an existing version is never updated. `effectiveFrom` defaults to
// today when not given (the common case: "change it starting now").
export async function addScoringRuleVersion(
  templateId: string,
  data: { effectiveFrom?: string; normalizeTo?: number | null; finalStatusBands: { min: number; max: number; label: string }[] },
  createdBy: string
): Promise<string> {
  const ref = await addDoc(rulesCollection(templateId), {
    templateId,
    effectiveFrom: data.effectiveFrom || new Date().toISOString().slice(0, 10),
    normalizeTo: data.normalizeTo ?? null,
    finalStatusBands: data.finalStatusBands || [],
    createdAt: new Date().toISOString(),
    createdBy,
  });
  return ref.id;
}

// Pure math, shared by completeInterview (api/interviews.ts) — kept here,
// not there, so the "percentage is always out of RAW_MAX regardless of
// normalizeTo" rule lives in one place next to the rest of the scoring-rule
// logic. `finalVerdict` is the panelist's own raw score (out of 5) and is
// never itself touched by this — it only reads it.
export function computeScoringFields(finalVerdict: number, rule: ScoringRuleVersion) {
  const pct = (finalVerdict / RAW_MAX) * 100;
  const normalizedScore = rule.normalizeTo
    ? Math.round((finalVerdict / RAW_MAX) * rule.normalizeTo * 10) / 10
    : null;
  const band = (rule.finalStatusBands || []).find(b => pct >= b.min && pct <= b.max);
  return {
    normalizedScore,
    finalStatus: band ? band.label : null,
    scoringRuleVersionId: rule.id,
    scoringComputedAt: new Date().toISOString(),
  };
}

export async function getScoringRuleVersion(templateId: string, versionId: string): Promise<ScoringRuleVersion | null> {
  const snap = await getDoc(doc(db, "interviewTemplates", templateId, "scoringRules", versionId));
  return snap.exists() ? ({ id: snap.id, ...snap.data() } as ScoringRuleVersion) : null;
}
