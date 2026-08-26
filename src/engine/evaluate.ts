import { all, create, isSymbolNode, isUnit, type MathNode, type Unit } from "mathjs";
import type {
  EvaluatedVariable,
  EvaluationResult,
  ProjectedFormula,
  ProjectedInput,
  ProjectedModel,
  ProjectedVariable,
} from "../model";
import { formatValue, type FormatDefaults } from "./format";

const math = create(all, { number: "number", predictable: true });
math.createUnit("percent", { definition: "0.01", aliases: ["pct"] });
const forbiddenSymbols = new Set(["random", "randomInt", "pickRandom"]);
const forbiddenNodes = new Set(["AssignmentNode", "FunctionAssignmentNode", "BlockNode"]);

type EvaluationState = "visiting" | "done";
type Quantity = number | Unit;

const registeredCurrencies = new Set<string>();

function formatKind(variable: ProjectedInput): string | undefined {
  return typeof variable.format === "string" ? variable.format : variable.format?.style;
}

function currencyCode(variable: ProjectedInput, defaults: FormatDefaults): string {
  const nested = typeof variable.format === "object" && variable.format.style === "currency" ? variable.format.currency : undefined;
  return (variable.currency || nested || defaults.currency || "EUR").toUpperCase();
}

function ensureCurrency(code: string): void {
  if (registeredCurrencies.has(code)) return;
  math.createUnit(code, { baseName: `money_${code}` });
  registeredCurrencies.add(code);
}

function inputQuantity(variable: ProjectedInput, defaults: FormatDefaults): Quantity {
  if (variable.inputType === "boolean") return variable.value;
  const kind = formatKind(variable);
  if (kind === "currency") {
    const code = currencyCode(variable, defaults);
    ensureCurrency(code);
    return math.unit(variable.value, code);
  }
  if (kind === "unit" && variable.unit) return math.unit(variable.value, variable.unit);
  if (kind === "percent") return math.unit(variable.value, "percent");
  return variable.value;
}

function normalizeQuantity(value: Unit): Unit {
  const units = value.units as Array<{ unit: { name: string } }>;
  return units.length > 1 && units.some(({ unit }) => unit.name === "percent")
    ? value.clone().simplify()
    : value;
}

function formatQuantity(value: Unit, defaults: FormatDefaults): { value: number; formatted: string } {
  const normalized = normalizeQuantity(value);
  const numeric = Number(normalized.toNumeric());
  if (!Number.isFinite(numeric)) throw new Error("Formula must return a finite quantity");

  const units = normalized.units as Array<{ unit: { name: string; base?: { key?: string } }; power: number }>;
  if (units.length === 1 && units[0].power === 1) {
    const name = units[0].unit.name;
    const base = units[0].unit.base?.key;
    if (base?.startsWith("money_")) {
      const currency = base.slice("money_".length);
      return { value: numeric, formatted: formatValue(numeric, { style: "currency", currency, locale: defaults.locale }) };
    }
    if (name === "percent") {
      return { value: numeric, formatted: formatValue(numeric / 100, "percent", defaults) };
    }
  }

  return { value: numeric, formatted: formatValue(numeric, { style: "unit", unit: normalized.formatUnits(), locale: defaults.locale }) };
}

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
  // Register currency symbols before parsing so expressions such as `usd to EUR`
  // recognize the conversion target as a unit rather than a missing variable.
  for (const variable of model.variables) {
    if (variable.kind === "input" && formatKind(variable) === "currency") ensureCurrency(currencyCode(variable, defaults));
  }
  const byId: Record<string, EvaluatedVariable> = Object.create(null);
  const quantities: Record<string, Quantity> = Object.create(null);
  const states: Record<string, EvaluationState | undefined> = Object.create(null);

  const evaluate = (variable: ProjectedVariable): EvaluatedVariable => {
    if (states[variable.varId] === "done") return byId[variable.varId];
    if (states[variable.varId] === "visiting") {
      return errorResult(variable, `Circular reference involving ${variable.name}`);
    }
    states[variable.varId] = "visiting";

    let result: EvaluatedVariable;
    if (variable.kind === "input") {
      if (Number.isFinite(variable.value)) {
        try {
          quantities[variable.varId] = inputQuantity(variable, defaults);
          const formatted = variable.inputType === "boolean"
            ? (variable.value ? "Yes" : "No")
            : formatValue(formatKind(variable) === "percent" ? variable.value / 100 : variable.value, variable, defaults);
          result = { ...variable, status: "ok", formatted };
        } catch (error) {
          result = errorResult(variable, error instanceof Error ? error.message : String(error));
        }
      } else result = errorResult(variable, "Input must be a finite number");
    } else {
      const inspected = inspectFormula(variable, model);
      if (inspected.error) {
        result = errorResult(variable, inspected.error);
      } else if (inspected.missing.length > 0) {
        result = missingResult(variable, inspected.missing);
      } else {
        const scope: Record<string, Quantity> = {};
        const inheritedMissing: string[] = [];
        let dependencyError: string | undefined;
        for (const name of inspected.dependencies) {
          const dependency = evaluate(model.byId[model.idByName[name]]);
          if (dependency.status === "missing") inheritedMissing.push(...(dependency.missing ?? [name]));
          else if (dependency.status === "error") dependencyError = dependency.error ?? `Invalid dependency ${name}`;
          else scope[name] = quantities[dependency.varId];
        }
        if (inheritedMissing.length > 0) {
          result = missingResult(variable, inheritedMissing);
        } else if (dependencyError) {
          result = errorResult(variable, dependencyError);
        } else {
          try {
            const value = inspected.node!.compile().evaluate(scope);
            if (isUnit(value)) {
              const rendered = formatQuantity(value, defaults);
              quantities[variable.varId] = normalizeQuantity(value);
              result = { ...variable, status: "ok", ...rendered };
            } else {
              if (typeof value === "number" && Number.isFinite(value)) {
                quantities[variable.varId] = value;
                result = { ...variable, status: "ok", value, formatted: formatValue(value, undefined, defaults) };
              } else result = errorResult(variable, "Formula must return a finite number");
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
