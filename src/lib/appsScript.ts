/**
 * Canonical Google Apps Script HTTP client.
 * Import from here — do not define inline copies in pages.
 */

const DEFAULT_TIMEOUT_MS = 25000;

export async function callAppsScript(
  url: string,
  secret: string,
  payload: Record<string, unknown>,
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<Record<string, unknown>> {
  if (!url) throw new Error("VITE_APPS_SCRIPT_URL is not set in .env");

  // Apps Script Web Apps have no bounded response time and a bare fetch()
  // has no default timeout — a slow/hung call previously left whatever
  // "saving"/"sending" button triggered it stuck forever with no way to
  // recover except reloading the page.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method:   "POST",
      redirect: "follow",
      body:     JSON.stringify({ ...payload, secret }),
      signal:   controller.signal,
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error || "Apps Script call failed");
    return json;
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error("The request timed out — the email/calendar service didn't respond in time. Please try again.");
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
