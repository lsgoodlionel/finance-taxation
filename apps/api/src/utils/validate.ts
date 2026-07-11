/**
 * Minimal, dependency-free schema validation for request bodies.
 *
 * Consistent with the project's zero-dependency stance (cf. scrypt, the
 * structured logger, the rate limiter). Validates a plain object against a
 * declarative field spec and returns ONLY whitelisted fields — untrusted extra
 * keys are dropped, guarding against mass-assignment. Not a general-purpose
 * schema library; extend the field spec as endpoints adopt it.
 */

export interface FieldSpec {
  type: "string" | "number" | "boolean";
  required?: boolean;
  /** For strings: min length. For numbers: min value. */
  min?: number;
  /** For strings: max length. For numbers: max value. */
  max?: number;
  /** For strings only. */
  pattern?: RegExp;
  /** For numbers only: require an integer. */
  int?: boolean;
  /** Allowed values (string fields). */
  enum?: readonly string[];
}

export type ObjectSchema = Readonly<Record<string, FieldSpec>>;

export interface ValidationResult<T> {
  ok: boolean;
  value?: T;
  errors: string[];
}

function validateField(name: string, value: unknown, spec: FieldSpec): string[] {
  if (spec.type === "string") {
    if (typeof value !== "string") {
      return [`${name} must be a string`];
    }
    const errors: string[] = [];
    if (spec.min !== undefined && value.length < spec.min) {
      errors.push(`${name} must be at least ${spec.min} characters`);
    }
    if (spec.max !== undefined && value.length > spec.max) {
      errors.push(`${name} must be at most ${spec.max} characters`);
    }
    if (spec.pattern && !spec.pattern.test(value)) {
      errors.push(`${name} has an invalid format`);
    }
    if (spec.enum && !spec.enum.includes(value)) {
      errors.push(`${name} must be one of: ${spec.enum.join(", ")}`);
    }
    return errors;
  }

  if (spec.type === "number") {
    if (typeof value !== "number" || Number.isNaN(value)) {
      return [`${name} must be a number`];
    }
    const errors: string[] = [];
    if (spec.int && !Number.isInteger(value)) {
      errors.push(`${name} must be an integer`);
    }
    if (spec.min !== undefined && value < spec.min) {
      errors.push(`${name} must be >= ${spec.min}`);
    }
    if (spec.max !== undefined && value > spec.max) {
      errors.push(`${name} must be <= ${spec.max}`);
    }
    return errors;
  }

  if (typeof value !== "boolean") {
    return [`${name} must be a boolean`];
  }
  return [];
}

export function validateObject<T = Record<string, unknown>>(
  input: unknown,
  schema: ObjectSchema
): ValidationResult<T> {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, errors: ["request body must be an object"] };
  }

  const source = input as Record<string, unknown>;
  const errors: string[] = [];
  const value: Record<string, unknown> = {};

  for (const [name, spec] of Object.entries(schema)) {
    const present = Object.prototype.hasOwnProperty.call(source, name) && source[name] !== undefined;
    if (!present) {
      if (spec.required) {
        errors.push(`${name} is required`);
      }
      continue;
    }
    const fieldErrors = validateField(name, source[name], spec);
    if (fieldErrors.length > 0) {
      errors.push(...fieldErrors);
    } else {
      value[name] = source[name];
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }
  return { ok: true, value: value as T, errors: [] };
}
