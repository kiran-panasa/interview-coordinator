export const SAMPLE_CSV = `text,domainType,difficulty,topic,skills,templates,suggestedAnswer
"What is a closure in JavaScript?",coding,medium,Closures,JavaScript,,"A closure is a function that retains access to its outer scope even after the outer function has returned."
"Explain React's reconciliation algorithm.",react_coding|coding,hard,React Internals,ReactJS|JavaScript,,"React uses a diffing algorithm to compare virtual DOM trees and update only the changed nodes."
"Write a function to reverse a linked list.",coding,hard,Data Structures,Python|Java,Template A,
`;

export function parseCSVLine(line) {
  const result = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      result.push(current); current = "";
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

export function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return { rows: [], errors: ["Need a header row plus at least one data row."] };

  const rawHeaders = parseCSVLine(lines[0]).map(h => h.trim().replace(/^"|"$/g, "").toLowerCase().replace(/\s+/g, ""));
  const colMap = {
    text:            rawHeaders.indexOf("text"),
    domaintype:      rawHeaders.indexOf("domaintype"),
    difficulty:      rawHeaders.indexOf("difficulty"),
    topic:           rawHeaders.indexOf("topic"),
    skills:          rawHeaders.indexOf("skills"),
    templates:       rawHeaders.indexOf("templates"),
    suggestedanswer: rawHeaders.indexOf("suggestedanswer"),
  };
  if (colMap.text === -1)       return { rows: [], errors: ['Required column "text" not found.'] };
  if (colMap.domaintype === -1) return { rows: [], errors: ['Required column "domainType" not found.'] };

  const rows = [];
  const errors = [];
  for (let i = 1; i < lines.length; i++) {
    const vals = parseCSVLine(lines[i]).map(v => v.trim().replace(/^"|"$/g, "").trim());
    const get  = (col) => (col === -1 ? "" : vals[col] || "");
    const text = get(colMap.text);
    const domainTypes = get(colMap.domaintype).split("|").map(s => s.trim()).filter(Boolean);
    if (!text)            { errors.push(`Row ${i + 1}: "text" is empty — skipped.`); continue; }
    if (!domainTypes.length) { errors.push(`Row ${i + 1}: "domainType" is empty — skipped.`); continue; }
    const diff = get(colMap.difficulty).toLowerCase();
    if (diff && !["easy", "medium", "hard"].includes(diff)) {
      errors.push(`Row ${i + 1}: difficulty "${diff}" invalid (use easy/medium/hard) — skipped.`); continue;
    }
    rows.push({
      text,
      domainTypes,
      difficulty: diff || "medium",
      topic:           get(colMap.topic),
      skills:          get(colMap.skills).split("|").map(s => s.trim()).filter(Boolean),
      templates:       get(colMap.templates).split("|").map(t => t.trim()).filter(Boolean),
      suggestedAnswer: get(colMap.suggestedanswer),
    });
  }
  return { rows, errors };
}

export function downloadSampleCSV() {
  const blob = new Blob([SAMPLE_CSV], { type: "text/csv" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url; a.download = "questions_template.csv"; a.click();
  URL.revokeObjectURL(url);
}
