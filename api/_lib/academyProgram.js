// "Academy" is a Program — its own doc in the `programs` collection, shown
// as a tab on the Templates page. A template is assigned to it via
// Template.program, which stores that Program doc's id, NOT the literal
// string "Academy" (see the Program dropdown on the Templates page,
// src/pages/admin/TemplatesPage.jsx). A template can belong to the Academy
// program without its own name starting with "Academy" — e.g. "Frontend
// Development" and "Programming with Problem Solving (DSA)" both do.
// "Is this an Academy interview" should therefore be answered by this
// Program assignment, not by guessing from the template's display name.

export async function resolveAcademyProgramId(db) {
  const snap = await db.collection("programs").where("name", "==", "Academy").limit(1).get();
  return snap.empty ? null : snap.docs[0].id;
}

export async function isTemplateInAcademyProgram(db, templateId, academyProgramId) {
  if (!templateId || !academyProgramId) return false;
  const snap = await db.collection("interviewTemplates").doc(templateId).get();
  return snap.exists && snap.data()?.program === academyProgramId;
}
