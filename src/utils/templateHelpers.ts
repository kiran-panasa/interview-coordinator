export function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

export function makeFieldId(label: string): string {
  const slug = (label || "field").toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "").slice(0, 20);
  return slug + "_" + Math.random().toString(36).slice(2, 7);
}

export function slugify(label: string): string {
  return (label || "")
    .toLowerCase()
    .replace(/[–—]/g, "_")
    .replace(/[^a-z0-9\s_]/g, " ")
    .trim()
    .replace(/[\s_]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 40) || "domain";
}
