import { splitCSVLines, parseLine } from "./csv";

// Google Sheets often has a merged "group" row above the real header (e.g.
// "Fullstack" spanning Java/Python/MERN) — when exported to CSV, that row's
// other cells come through blank. Rather than require the admin to strip it
// by hand, scan the first few rows for the one that actually looks like a
// header (its first cell reads "Panelist Name", "Name", or "Email") and
// treat that as the real header, ignoring anything above it.
const FIRST_COL_LABELS = ["panelist name", "name", "email", "interviewer", "interviewer name", "interviewer email"];
const TRUTHY = new Set(["true", "yes", "y", "1", "x", "✓", "checked"]);

function findHeaderRowIndex(lines) {
  for (let i = 0; i < Math.min(lines.length, 5); i++) {
    const firstCell = (parseLine(lines[i])[0] || "").trim().toLowerCase();
    if (FIRST_COL_LABELS.includes(firstCell)) return i;
  }
  return 0;
}

// interviewers: active interviewer Users (each with .id, .email, .displayName, .skills[])
// existingSkills: Skill[] ({ id, name }) already defined in Settings → Skills
export function parseSkillsImportCSV(csvText, interviewers, existingSkills) {
  const lines = splitCSVLines(csvText);
  if (lines.length < 2) return { globalError: "Need a header row plus at least one data row." };

  const headerIdx = findHeaderRowIndex(lines);
  const headerCells = parseLine(lines[headerIdx]).map(c => c.trim());
  if (headerCells.length < 2) {
    return { globalError: 'No skill columns found. First row must have "Panelist Name" (or "Email") then one column per skill.' };
  }

  const firstColLabel = headerCells[0].toLowerCase();
  const isEmailFirstCol = firstColLabel === "email";
  // An optional dedicated Email column alongside a Name-labelled first column —
  // when present, it's the authoritative match key instead of the name.
  const emailColIdx = headerCells.findIndex((c, i) => i > 0 && c.toLowerCase() === "email");

  const skillCols = headerCells
    .map((name, idx) => ({ name, idx }))
    .filter(({ name, idx }) => idx !== 0 && idx !== emailColIdx && name);
  if (!skillCols.length) {
    return { globalError: "No skill columns found — every column after the first (and after Email, if present) must be a skill name." };
  }

  const existingByLowerName = new Map(existingSkills.map(s => [s.name.trim().toLowerCase(), s]));
  const newSkillNames = [...new Set(skillCols.map(c => c.name))].filter(n => !existingByLowerName.has(n.trim().toLowerCase()));

  const interviewersByEmail = new Map(interviewers.filter(u => u.email).map(u => [u.email.toLowerCase(), u]));
  const interviewersByName = new Map();
  interviewers.forEach(u => {
    const key = (u.displayName || "").trim().toLowerCase();
    if (!key) return;
    if (!interviewersByName.has(key)) interviewersByName.set(key, []);
    interviewersByName.get(key).push(u);
  });

  const skillColNamesLower = new Set(skillCols.map(c => c.name.toLowerCase()));

  const rows = [];
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const cells = parseLine(lines[i]);
    const firstCell = (cells[0] || "").trim();
    if (!firstCell) continue; // blank row — skip silently

    const emailCell = emailColIdx !== -1 ? (cells[emailColIdx] || "").trim() : (isEmailFirstCol ? firstCell : "");

    let interviewer = null;
    let matchedBy = null;
    let error = null;

    if (emailCell) {
      matchedBy = "email";
      interviewer = interviewersByEmail.get(emailCell.toLowerCase()) || null;
      if (!interviewer) error = `No active interviewer found with email "${emailCell}".`;
    } else {
      matchedBy = "name";
      const candidates = interviewersByName.get(firstCell.toLowerCase()) || [];
      if (candidates.length === 1) interviewer = candidates[0];
      else if (candidates.length === 0) error = `No active interviewer found named "${firstCell}" — add an Email column for a reliable match.`;
      else error = `${candidates.length} active interviewers are named "${firstCell}" — add an Email column to disambiguate.`;
    }

    const checkedSkillNames = skillCols
      .filter(({ idx }) => TRUTHY.has((cells[idx] || "").trim().toLowerCase()))
      .map(({ name }) => name);

    const existingSkillNames = interviewer
      ? (interviewer.skills || []).map(sid => existingSkills.find(s => s.id === sid)?.name).filter(Boolean)
      : [];
    // Only columns present in THIS sheet are ever touched — a skill the
    // interviewer already has that isn't one of this sheet's columns is
    // left alone, so a partial skills sheet can't silently wipe unrelated
    // skills set elsewhere (e.g. manually, or by an earlier import).
    const willAdd = checkedSkillNames.filter(n => !existingSkillNames.some(e => e.toLowerCase() === n.toLowerCase()));
    const willRemove = existingSkillNames.filter(n =>
      skillColNamesLower.has(n.toLowerCase()) && !checkedSkillNames.some(c => c.toLowerCase() === n.toLowerCase())
    );

    rows.push({
      rowNum: i + 1,
      rawLabel: firstCell,
      matchedBy,
      interviewer,
      checkedSkillNames,
      willAdd,
      willRemove,
      error,
    });
  }

  if (!rows.length) return { globalError: "No data rows found below the header." };

  return { skillCols: skillCols.map(c => c.name), newSkillNames, rows };
}
