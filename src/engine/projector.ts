import type {
  FormulaProps,
  ModeloBlock,
  ModeloDocument,
  ProjectedFormula,
  ProjectedInput,
  ProjectedModel,
  ProjectedVariable,
  VariableProps,
} from "../model";

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

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/u;
const inputTypes = new Set([
  "modelVariable",
  "variable",
  "number",
  "slider",
  "select",
  "boolean",
]);
const formulaTypes = new Set(["modelFormula", "formula"]);

function validateIdentity(
  varId: unknown,
  name: unknown
): asserts varId is string {
  if (typeof varId !== "string" || varId.trim() === "") {
    throw new ModelValidationError(
      "Every model variable requires a non-empty varId"
    );
  }
  if (typeof name !== "string" || !IDENTIFIER.test(name)) {
    throw new ModelValidationError(`Invalid variable name: ${String(name)}`);
  }
}

function validateDecimals(
  decimals: unknown,
  name: unknown
): number | undefined {
  if (decimals === undefined || decimals === -1) {
    return undefined;
  }
  if (
    !Number.isInteger(decimals) ||
    (decimals as number) < 0 ||
    (decimals as number) > 8
  ) {
    throw new ModelValidationError(
      `Invalid decimals for ${String(name)}: expected an integer from 0 to 8`
    );
  }
  return decimals as number;
}

/** Boolean inputs project to 0 or 1, every other input keeps its number. */
function inputValue(type: string, value: number): number {
  if (type !== "boolean") {
    return value;
  }
  return value ? 1 : 0;
}

/** The narrowed input kind a block type projects to, if it names one. */
function inputTypeOf(
  type: string
): "number" | "slider" | "select" | "boolean" | undefined {
  if (type === "boolean") {
    return "boolean";
  }
  if (type === "number" || type === "slider" || type === "select") {
    return type;
  }
  return undefined;
}

function visit(blocks: ModeloDocument, output: ProjectedVariable[]): void {
  for (const block of blocks) {
    const props = block.props as
      | Partial<VariableProps & FormulaProps>
      | undefined;
    if (inputTypes.has(block.type)) {
      validateIdentity(props?.varId, props?.name);
      if (typeof props?.value !== "number") {
        throw new ModelValidationError(
          `Input ${props?.name} requires a numeric value`
        );
      }
      output.push({
        blockId: block.id,
        currency: props.currency,
        decimals: validateDecimals(props.decimals, props.name),
        format: props.format,
        inputType: inputTypeOf(block.type),
        kind: "input",
        locale: props.locale,
        max: props.max,
        min: props.min,
        name: props.name as string,
        unit: props.unit,
        value: inputValue(block.type, props.value),
        varId: props.varId,
      } satisfies ProjectedInput);
    } else if (formulaTypes.has(block.type)) {
      validateIdentity(props?.varId, props?.name);
      if (typeof props?.formula !== "string" || props.formula.trim() === "") {
        throw new ModelValidationError(
          `Formula ${props?.name} requires an expression`
        );
      }
      output.push({
        blockId: block.id,
        formula: props.formula,
        kind: "formula",
        name: props.name as string,
        varId: props.varId,
      } satisfies ProjectedFormula);
    }
    if (Array.isArray(block.children)) {
      visit(block.children as ModeloBlock[], output);
    }
  }
}

/** Projects editor blocks into a deterministic, editor-independent model registry. */
export function projectDocument(document: ModeloDocument): ProjectedModel {
  const variables: ProjectedVariable[] = [];
  visit(document, variables);

  const byId: Record<string, ProjectedVariable> = Object.create(null);
  const idByName: Record<string, string> = Object.create(null);
  for (const variable of variables) {
    if (Object.hasOwn(byId, variable.varId)) {
      throw new DuplicateVariableIdError(variable.varId);
    }
    if (Object.hasOwn(idByName, variable.name)) {
      throw new DuplicateVariableNameError(variable.name);
    }
    byId[variable.varId] = variable;
    idByName[variable.name] = variable.varId;
  }

  return { byId, idByName, variables };
}
