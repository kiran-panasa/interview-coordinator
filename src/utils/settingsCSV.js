import * as XLSX from "xlsx";
import { splitCSVRow } from "./csv";

const VALID_ROLES = new Set(["interviewer", "admin", "content_team"]);

export function parseInvitesCSV(text) {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (lines.length < 2) return { rows: [], errors: ["File must have a header row and at least one data row."] };

  const headers = splitCSVRow(lines[0]).map(h => h.toLowerCase().replace(/\s+/g, ""));
  const idx = (names) => names.map(n => headers.findIndex(h => h.includes(n))).find(i => i >= 0) ?? -1;

  const nameIdx  = idx(["name"]);
  const phoneIdx = idx(["phone", "mobile"]);
  const emailIdx = idx(["email"]);
  const roleIdx  = idx(["role"]);

  if (emailIdx === -1) return { rows: [], errors: ["Missing required column: email"] };

  const errors = [], rows = [];
  for (let i = 1; i < lines.length; i++) {
    const c = splitCSVRow(lines[i]);
    const email = c[emailIdx]?.trim().toLowerCase();
    if (!email) { errors.push(`Row ${i + 1}: email is required`); continue; }
    const rawRole = roleIdx >= 0 ? c[roleIdx]?.trim().toLowerCase() : "";
    const role = VALID_ROLES.has(rawRole) ? rawRole : "interviewer";
    rows.push({
      name:  nameIdx  >= 0 ? c[nameIdx]?.trim()  || "" : "",
      phone: phoneIdx >= 0 ? c[phoneIdx]?.trim() || "" : "",
      email,
      role,
    });
  }
  return { rows, errors };
}

export function downloadInviteSampleCSV() {
  const content = [
    "name,phone,email,role",
    "Rahul Sharma,+91 98765 43210,rahul@example.com,interviewer",
    "Priya Patel,+91 98765 43211,priya@example.com,admin",
    "Content Writer,,writer@example.com,content_team",
  ].join("\n");
  const blob = new Blob([content], { type: "text/csv" });
  const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: "invites_sample.csv" });
  a.click();
}

export function downloadInviteSampleExcel() {
  const rows = [
    { name: "Rahul Sharma",   phone: "+91 98765 43210", email: "rahul@example.com",  role: "interviewer" },
    { name: "Priya Patel",    phone: "+91 98765 43211", email: "priya@example.com",  role: "admin" },
    { name: "Content Writer", phone: "",                email: "writer@example.com", role: "content_team" },
  ];
  const ws = XLSX.utils.json_to_sheet(rows, { header: ["name", "phone", "email", "role"] });
  ws["!cols"] = [{ wch: 20 }, { wch: 18 }, { wch: 28 }, { wch: 14 }];
  const noteRows = [
    { "Valid role values": "interviewer" },
    { "Valid role values": "admin" },
    { "Valid role values": "content_team" },
  ];
  const wsNote = XLSX.utils.json_to_sheet(noteRows);
  wsNote["!cols"] = [{ wch: 20 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Invites");
  XLSX.utils.book_append_sheet(wb, wsNote, "Reference");
  XLSX.writeFile(wb, "invites_sample.xlsx");
}
