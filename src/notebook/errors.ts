/** The failure vocabulary every notebook operation speaks. */
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
  | "TITLE_BLOCK"
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
