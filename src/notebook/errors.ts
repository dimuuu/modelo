/**
 * The failure vocabulary every notebook operation speaks.
 *
 * A `ModeloToolError` carries a stable code the agent can branch on. The
 * WebMCP layer serialises it into `{ ok: false, error: { code, message,
 * details? } }` and never lets a stack trace through.
 */
export type ToolErrorCode =
  | "NO_NOTEBOOK_OPEN"
  | "NOT_FOUND"
  | "EMPTY_DOCUMENT"
  | "EMPTY_SECTION"
  | "INVALID_ARGUMENTS"
  | "INVALID_UPDATE"
  | "INVALID_VALUE"
  | "INVALID_NAME"
  | "DUPLICATE_VARIABLE_NAME"
  | "VARIABLE_REFERENCED"
  | "READ_ONLY"
  | "SCENARIO_LIMIT"
  | "INTERNAL_ERROR";

export class ModeloToolError extends Error {
  readonly code: ToolErrorCode;
  readonly details?: unknown;

  constructor(code: ToolErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = "ModeloToolError";
    this.code = code;
    this.details = details;
  }
}

/** Throws a `ModeloToolError`. Typed `never` so callers can use it in expressions. */
export function fault(
  code: ToolErrorCode,
  message: string,
  details?: unknown
): never {
  throw new ModeloToolError(code, message, details);
}
