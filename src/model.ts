export type VariableId = string;

export type NumberFormat =
  | {
      style?: "number";
      locale?: string;
      minimumFractionDigits?: number;
      maximumFractionDigits?: number;
    }
  | {
      style: "currency";
      currency: string;
      locale?: string;
      minimumFractionDigits?: number;
      maximumFractionDigits?: number;
    }
  | {
      style: "unit";
      unit: string;
      locale?: string;
      minimumFractionDigits?: number;
      maximumFractionDigits?: number;
    };

export type FormatKind = "number" | "currency" | "unit" | "percent";

export interface VariableProps {
  varId: VariableId;
  name: string;
  value: number;
  format?: FormatKind | NumberFormat;
  currency?: string;
  unit?: string;
  locale?: string;
  decimals?: number;
  min?: number;
  max?: number;
}

export interface FormulaProps {
  varId: VariableId;
  name: string;
  formula: string;
}

export interface VariableBlock {
  id: string;
  type: "number" | "slider" | "select" | "boolean";
  props: VariableProps;
  children?: ModeloBlock[];
}

export interface FormulaBlock {
  id: string;
  type: "formula";
  props: FormulaProps;
  children?: ModeloBlock[];
}

/** A plain document block. It deliberately has no dependency on BlockNote. */
export interface DocumentBlock {
  id: string;
  type: string;
  props?: Record<string, unknown>;
  content?: unknown;
  children?: ModeloBlock[];
  [key: string]: unknown;
}

export type ModeloBlock = VariableBlock | FormulaBlock | DocumentBlock;
export type ModeloDocument = ModeloBlock[];

export interface ProjectedVariableBase {
  varId: VariableId;
  blockId: string;
  name: string;
}

export interface ProjectedInput extends ProjectedVariableBase {
  kind: "input";
  value: number;
  inputType?: "number" | "slider" | "select" | "boolean";
  format?: FormatKind | NumberFormat;
  currency?: string;
  unit?: string;
  locale?: string;
  decimals?: number;
  min?: number;
  max?: number;
}

export interface ProjectedFormula extends ProjectedVariableBase {
  kind: "formula";
  formula: string;
}

export type ProjectedVariable = ProjectedInput | ProjectedFormula;

/** A variable block the projector could not admit to the registry, and why. */
export interface ProjectionIssue {
  blockId: string;
  kind: "input" | "formula";
  varId?: VariableId;
  name?: string;
  message: string;
}

export interface ProjectedModel {
  variables: ProjectedVariable[];
  byId: Record<VariableId, ProjectedVariable>;
  idByName: Record<string, VariableId>;
  issues: ProjectionIssue[];
}

export type EvaluationStatus = "ok" | "missing" | "error";

export type EvaluatedVariable = ProjectedVariable & {
  status: EvaluationStatus;
  value?: number;
  formatted: string;
  error?: string;
  missing?: string[];
};

export interface EvaluationResult {
  variables: EvaluatedVariable[];
  byId: Record<VariableId, EvaluatedVariable>;
  byName: Record<string, EvaluatedVariable>;
}
