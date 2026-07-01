import * as Sentry from "@sentry/react";

const sentryEnabled = Boolean(import.meta.env.VITE_SENTRY_DSN);

export function logError(error, context = {}) {
  if (import.meta.env.DEV) {
    console.error(`[${context.label || "app"}]`, error, context);
    return;
  }
  console.error(`[${context.label || "app"}]`, error?.message ?? error);
  if (sentryEnabled) {
    Sentry.captureException(error, { extra: context });
  }
}

export function logWarning(message, context = {}) {
  console.warn(`[${context.label || "app"}] ${message}`, context);
  if (sentryEnabled) {
    Sentry.captureMessage(message, "warning");
  }
}
