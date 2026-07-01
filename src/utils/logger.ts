import * as Sentry from "@sentry/react";

const sentryEnabled = Boolean(import.meta.env.VITE_SENTRY_DSN);

export function logError(
  error: unknown,
  context: { label?: string; [key: string]: unknown } = {}
): void {
  if (import.meta.env.DEV) {
    console.error(`[${context.label || "app"}]`, error, context);
    return;
  }
  console.error(`[${context.label || "app"}]`, error instanceof Error ? error.message : error);
  if (sentryEnabled) {
    Sentry.captureException(error, { extra: context });
  }
}

export function logWarning(
  message: string,
  context: { label?: string; [key: string]: unknown } = {}
): void {
  console.warn(`[${context.label || "app"}] ${message}`, context);
  if (sentryEnabled) {
    Sentry.captureMessage(message, "warning");
  }
}
