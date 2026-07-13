/**
 * Recursively mask sensitive values before they are persisted or logged.
 *
 * Used by the audit log writer so credentials that flow through `changes`
 * payloads (integration API keys, AI provider secrets, passwords, tokens) are
 * never stored in cleartext. Matching is by key name, case-insensitive.
 */

export const REDACTED = "[REDACTED]";

const SENSITIVE_KEY = /pass(word)?|secret|token|api[_-]?key|authorization|credential|private[_-]?key/i;

export function redactSensitive(value: unknown): unknown {
  return redact(value, new WeakSet());
}

function redact(value: unknown, seen: WeakSet<object>): unknown {
  if (value === null || typeof value !== "object") {
    return value;
  }
  if (seen.has(value)) {
    return REDACTED;
  }
  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((item) => redact(item, seen));
  }

  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    result[key] = SENSITIVE_KEY.test(key) ? REDACTED : redact(val, seen);
  }
  return result;
}
