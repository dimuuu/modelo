import { all, create, isSymbolNode, isUnit, type MathNode } from "mathjs";
import type {
  EvaluatedVariable,
  EvaluationResult,
  ProjectedFormula,
  ProjectedModel,
  ProjectedVariable,
} from "../model";
import { formatValue, type FormatDefaults } from "./format";

const math = create(all, { number: "number", predictable: true });
const forbiddenSymbols = new Set(["random", "randomInt", "pickRandom"]);
const forbiddenNodes = new Set(["AssignmentNode", "FunctionAssignmentNode", "BlockNode"]);

type EvaluationState = "visiting" | "done";

function errorResult(variable: ProjectedVariable, message: string): EvaluatedVariable {
  return { ...variable, status: "error", formatted: `Error: ${message}`, error: message };
}

function missingResult(variable: ProjectedVariable, missing: string[]): EvaluatedVariable {
  const names = [...new Set(missing)].sort();
  return {
    ...variable,
    status: "missing",
    formatted: `Missing: ${names.join(", ")}`,
    error: `Missing variable${names.length === 1 ? "" : "s"}: ${names.join(", ")}`,
    missing: names,
  };
}

function inspectFormula(variable: ProjectedFormula, model: ProjectedModel): {
  node?: MathNode;
  dependencies: string[];
  missing: string[];
  error?: string;
} {
  try {
    const node = math.parse(variable.formula);
    const dependencies = new Set<string>();
    const missing = new Set<string>();
    let forbidden: string | undefined;
    node.traverse((child) => {
      if (forbiddenNodes.has(child.type)) forbidden = child.type;
      if (isSymbolNode(child)) {
        const name = child.name;
        if (forbiddenSymbols.has(name)) forbidden = `function ${name}`;
        else if (Object.prototype.hasOwnProperty.call(model.idByName, name)) dependencies.add(name);
        else if (!math.Unit.isValuelessUnit(name) && !Object.prototype.hasOwnProperty.call(math, name)) missing.add(name);
      }
    });
    if (forbidden) return { dependencies: [], missing: [], error: `Unsupported ${forbidden}` };
    return { node, dependencies: [...dependencies].sort(), missing: [...missing].sort() };
  } catch (error) {
    return {
      dependencies: [],
      missing: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/** Returns exact MathJS symbol dependencies for a projected formula. */
export function getFormulaDependencies(variable: ProjectedFormula, model: ProjectedModel): string[] {
  return inspectFormula(variable, model).dependencies;
}

/** Evaluates a projected registry with dependency ordering independent of block order. */
export function evaluateModel(model: ProjectedModel, defaults: FormatDefaults = {}): EvaluationResult {
  const byId: Record<string, EvaluatedVariable> = Object.create(null);
  const states: Record<string, EvaluationState | undefined> = Object.create(null);

  const evaluate = (variable: ProjectedVariable): EvaluatedVariable => {
    if (states[variable.varId] === "done") return byId[variable.varId];
    if (states[variable.varId] === "visiting") {
      return errorResult(variable, `Circular reference involving ${variable.name}`);
    }
    states[variable.varId] = "visiting";

    let result: EvaluatedVariable;
    if (variable.kind === "input") {
      result = Number.isFinite(variable.value)
        ? { ...variable, status: "ok", formatted: variable.inputType === "boolean" ? (variable.value ? "Yes" : "No") : formatValue(variable.value, variable, defaults) }
        : errorResult(variable, "Input must be a finite number");
    } else {
      const inspected = inspectFormula(variable, model);
      if (inspected.error) {
        result = errorResult(variable, inspected.error);
      } else if (inspected.missing.length > 0) {
        result = missingResult(variable, inspected.missing);
      } else {
        const scope: Record<string, number> = {};
        const inheritedMissing: string[] = [];
        let dependencyError: string | undefined;
        for (const name of inspected.dependencies) {
          const dependency = evaluate(model.byId[model.idByName[name]]);
          if (dependency.status === "missing") inheritedMissing.push(...(dependency.missing ?? [name]));
          else if (dependency.status === "error") dependencyError = dependency.error ?? `Invalid dependency ${name}`;
          else scope[name] = dependency.value as number;
        }
        if (inheritedMissing.length > 0) {
          result = missingResult(variable, inheritedMissing);
        } else if (dependencyError) {
          result = errorResult(variable, dependencyError);
        } else {
          try {
            const value = inspected.node!.compile().evaluate(scope);
            if (isUnit(value)) {
              const numeric = Number(value.toNumeric(variable.unit || undefined));
              result = Number.isFinite(numeric)
                ? { ...variable, status: "ok", value: numeric, formatted: variable.unit ? formatValue(numeric, { style: "unit", unit: variable.unit, locale: variable.locale || defaults.locale, minimumFractionDigits: variable.decimals, maximumFractionDigits: variable.decimals }) : value.toString() }
                : errorResult(variable, "Formula must return a finite quantity");
            } else {
              result = typeof value === "number" && Number.isFinite(value)
                ? { ...variable, status: "ok", value, formatted: formatValue(value, variable, defaults) }
                : errorResult(variable, "Formula must return a finite number");
            }
          } catch (error) {
            result = errorResult(variable, error instanceof Error ? error.message : String(error));
          }
        }
      }
    }

    byId[variable.varId] = result;
    states[variable.varId] = "done";
    return result;
  };

  const variables = model.variables.map(evaluate);
  const byName: Record<string, EvaluatedVariable> = Object.create(null);
  for (const variable of variables) byName[variable.name] = variable;
  return { variables, byId, byName };
}
