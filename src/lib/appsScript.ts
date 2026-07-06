/**
 * Canonical Google Apps Script HTTP client.
 * Import from here — do not define inline copies in pages.
 */
export async function callAppsScript(
  url: string,
  secret: string,
  payload: Record<string, unknown>
): Promise<Record<string, unknown>> {
  if (!url) throw new Error("VITE_APPS_SCRIPT_URL is not set in .env");
  const res = await fetch(url, {
    method:   "POST",
    redirect: "follow",
    body:     JSON.stringify({ ...payload, secret }),
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error || "Apps Script call failed");
  return json;
}
