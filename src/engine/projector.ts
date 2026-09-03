import type {
  FormulaProps,
  ModeloBlock,
  ModeloDocument,
  ProjectedFormula,
  ProjectedInput,
  ProjectedModel,
  ProjectedVariable,
  ProjectionIssue,
  VariableProps,
} from "../model";
import {
  inputTypeOf,
  isFormulaBlockType,
  isInputBlockType,
  walkBlocks,
} from "./document";
import {
  coerceInputValue,
  DECIMALS_MAX,
  DECIMALS_MIN,
  isIdentifier,
  normalizeDecimals,
} from "./variable";

export class ModelValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ModelValidationError";
  }
}

export class DuplicateVariableNameError extends ModelValidationError {
  readonly variableName: string;

  constructor(variableName: string) {
    super(`Variable name already exists: ${variableName}`);
    this.name = "DuplicateVariableNameError";
    this.variableName = variableName;
  }
}

export class DuplicateVariableIdError extends ModelValidationError {
  readonly varId: string;

  constructor(varId: string) {
    super(`Variable id already exists: ${varId}`);
    this.name = "DuplicateVariableIdError";
    this.varId = varId;
  }
}

type Candidate =
  | { ok: true; variable: ProjectedVariable }
  | { ok: false; issue: ProjectionIssue; error: ModelValidationError };

function reject(
  block: ModeloBlock,
  kind: "input" | "formula",
  error: ModelValidationError
): Candidate {
  const props = block.props as Partial<VariableProps> | undefined;
  return {
    error,
    issue: {
      blockId: block.id,
      kind,
      message: error.message,
      name: typeof props?.name === "string" ? props.name : undefined,
      varId: typeof props?.varId === "string" ? props.varId : undefined,
    },
    ok: false,
  };
}

function identityError(
  varId: unknown,
  name: unknown
): ModelValidationError | undefined {
  if (typeof varId !== "string" || varId.trim() === "") {
    return new ModelValidationError(
      "Every model variable requires a non-empty varId"
    );
  }
  if (!isIdentifier(name)) {
    return new ModelValidationError(`Invalid variable name: ${String(name)}`);
  }
  return undefined;
}

function projectInput(block: ModeloBlock): Candidate {
  const props = (block.props ?? {}) as Partial<VariableProps>;
  const identity = identityError(props.varId, props.name);
  if (identity) {
    return reject(block, "input", identity);
  }
  if (typeof props.value !== "number") {
    return reject(
      block,
      "input",
      new ModelValidationError(`Input ${props.name} requires a numeric value`)
    );
  }
  const decimals = normalizeDecimals(props.decimals);
  if (decimals === null) {
    return reject(
      block,
      "input",
      new ModelValidationError(
        `Invalid decimals for ${props.name}: expected an integer from ${DECIMALS_MIN} to ${DECIMALS_MAX}`
      )
    );
  }
  return {
    ok: true,
    variable: {
      blockId: block.id,
      currency: props.currency,
      decimals,
      format: props.format,
      inputType: inputTypeOf(block.type),
      kind: "input",
      locale: props.locale,
      max: props.max,
      min: props.min,
      name: props.name as string,
      unit: props.unit,
      value: coerceInputValue(block.type, props.value),
      varId: props.varId as string,
    } satisfies ProjectedInput,
  };
}

function projectFormula(block: ModeloBlock): Candidate {
  const props = (block.props ?? {}) as Partial<FormulaProps>;
  const identity = identityError(props.varId, props.name);
  if (identity) {
    return reject(block, "formula", identity);
  }
  if (typeof props.formula !== "string" || props.formula.trim() === "") {
    return reject(
      block,
      "formula",
      new ModelValidationError(`Formula ${props.name} requires an expression`)
    );
  }
  return {
    ok: true,
    variable: {
      blockId: block.id,
      formula: props.formula,
      kind: "formula",
      name: props.name as string,
      varId: props.varId as string,
    } satisfies ProjectedFormula,
  };
}

interface Projection {
  model: ProjectedModel;
  errors: ModelValidationError[];
}

function collect(document: ModeloDocument): Projection {
  const candidates: Candidate[] = [];
  walkBlocks(document, (block) => {
    if (isInputBlockType(block.type)) {
      candidates.push(projectInput(block));
    } else if (isFormulaBlockType(block.type)) {
      candidates.push(projectFormula(block));
    }
  });

  const variables: ProjectedVariable[] = [];
  const issues: ProjectionIssue[] = [];
  const errors: ModelValidationError[] = [];
  const byId: Record<string, ProjectedVariable> = Object.create(null);
  const idByName: Record<string, string> = Object.create(null);

  for (const candidate of candidates) {
    if (!candidate.ok) {
      issues.push(candidate.issue);
      errors.push(candidate.error);
      continue;
    }
    const { variable } = candidate;
    let error: ModelValidationError | undefined;
    if (Object.hasOwn(byId, variable.varId)) {
      error = new DuplicateVariableIdError(variable.varId);
    } else if (Object.hasOwn(idByName, variable.name)) {
      error = new DuplicateVariableNameError(variable.name);
    }
    if (error) {
      issues.push({
        blockId: variable.blockId,
        kind: variable.kind,
        message: error.message,
        name: variable.name,
        varId: variable.varId,
      });
      errors.push(error);
      continue;
    }
    byId[variable.varId] = variable;
    idByName[variable.name] = variable.varId;
    variables.push(variable);
  }

  return { errors, model: { byId, idByName, issues, variables } };
}

/**
 * Projects a document into the variable registry, keeping every invalid block
 * as an issue. One broken block never hides the rest of the model.
 */
export function inspectDocument(document: ModeloDocument): ProjectedModel {
  return collect(document).model;
}

/** The strict projection: throws on the first invalid or duplicate variable. */
export function projectDocument(document: ModeloDocument): ProjectedModel {
  const { model, errors } = collect(document);
  if (errors.length > 0) {
    throw errors[0];
  }
  return model;
}
