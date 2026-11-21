// Frontend-safe list of Panelist Audit Rubric options (key + display label
// only) — the actual rubric PROMPT TEXT lives server-side in
// api/_lib/panelistAuditRubrics.js (imports RUBRIC_OPTIONS from here so the
// two never drift on labels/keys) and never ships to the browser bundle.
// Shown on the Templates page (Templates → Lifecycle) so an admin can see
// and change which rubric a template uses.
export const RUBRIC_OPTIONS = [
  { key: "edge_60_fullstack",       label: "Edge 60 min — Full Stack (MERN / Java FS / Python FS)" },
  { key: "edge_60_data",            label: "Edge 60 min — Data Family (DSML / Gen AI / Data Analyst)" },
  { key: "edge_90_fullstack",       label: "Edge 90 min — Full Stack (MERN / Java FS / Python FS, + DSA)" },
  { key: "edge_90_data",            label: "Edge 90 min — Data Family (DSML / Gen AI / Data Analyst)" },
  { key: "academy_c1_dsa",          label: "Academy C1 — Programming with Problem Solving (DSA)" },
  { key: "academy_c2_frontend",     label: "Academy C2 — Frontend Development" },
  { key: "academy_c3_swe",          label: "Academy C3 — Software Engineering Fundamentals" },
  { key: "academy_c4_backend",      label: "Academy C4 — Backend Development" },
  { key: "academy_marks_fullstack", label: "Academy — FE (Next.js+TS) / Python Full Stack (marks /100)" },
  { key: "irp_l1_frontend",         label: "IRP L1 Frontend TR" },
];
