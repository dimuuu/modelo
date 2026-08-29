import { all, create, isSymbolNode, isUnit } from "mathjs";
import type { MathJsInstance, MathNode, Unit } from "mathjs";

import type {
  EvaluatedVariable,
  EvaluationResult,
  ProjectedFormula,
  ProjectedInput,
  ProjectedModel,
  ProjectedVariable,
  ProjectionIssue,
} from "../model";
import { formatValue } from "./format";
import type { FormatDefaults } from "./format";
import { currencyOf, formatKindOf } from "./variable";

const forbiddenSymbols = new Set(["random", "randomInt", "pickRandom"]);
const forbiddenNodes = new Set([
  "AssignmentNode",
  "FunctionAssignmentNode",
  "BlockNode",
]);
const EPSILON = 1e-12;

type Quantity = number | Unit;
interface UnitPart {
  unit: { name: string; base?: { key?: string } };
  power: number;
}

interface Inspection {
  node?: MathNode;
  dependencies: string[];
  missing: string[];
  error?: string;
}

/**
 * Owns one MathJS instance and the currency units registered on it.
 *
 * Currencies are units with a private base, so `EUR + EUR` adds and
 * `EUR + USD` fails. Each engine keeps its own registry, so tests can hold an
 * isolated instance and production shares one.
 */
export class FormulaEngine {
  private readonly math: MathJsInstance;
  private readonly currencies = new Set<string>();

  constructor() {
    this.math = create(all, { number: "number", predictable: true });
    this.math.createUnit("percent", { aliases: ["pct"], definition: "0.01" });
    this.math.createUnit("ha", { definition: "10000 m2" });
  }

  ensureCurrency(code: string): void {
    if (this.currencies.has(code)) {
      return;
    }
    this.math.createUnit(code, { baseName: `money_${code}` });
    this.currencies.add(code);
  }

  parse(expression: string): MathNode {
    return this.math.parse(expression);
  }

  unit(value: number, name: string): Unit {
    return this.math.unit(value, name);
  }

  /** True for a unit name or a MathJS constant or function. */
  isKnownSymbol(name: string): boolean {
    return (
      this.math.Unit.isValuelessUnit(name) || Object.hasOwn(this.math, name)
    );
  }

  /** Parses a formula and classifies each symbol as a dependency, a builtin, or missing. */
  inspect(variable: ProjectedFormula, model: ProjectedModel): Inspection {
    try {
      const node = this.parse(variable.formula);
      const dependencies = new Set<string>();
      const missing = new Set<string>();
      let forbidden: string | undefined;
      node.traverse((child) => {
        if (forbiddenNodes.has(child.type)) {
          forbidden = child.type;
        }
        if (!isSymbolNode(child)) {
          return;
        }
        const { name } = child;
        if (forbiddenSymbols.has(name)) {
          forbidden = `function ${name}`;
        } else if (Object.hasOwn(model.idByName, name)) {
          dependencies.add(name);
        } else if (!this.isKnownSymbol(name)) {
          missing.add(name);
        }
      });
      if (forbidden) {
        return {
          dependencies: [],
          error: `Unsupported ${forbidden}`,
          missing: [],
        };
      }
      return {
        dependencies: [...dependencies].toSorted(),
        missing: [...missing].toSorted(),
        node,
      };
    } catch (error) {
      return {
        dependencies: [],
        error: error instanceof Error ? error.message : String(error),
        missing: [],
      };
    }
  }
}

/** The engine production shares. Tests may construct their own. */
export const defaultFormulaEngine = new FormulaEngine();

/** Returns exact MathJS symbol dependencies for a projected formula. */
export function getFormulaDependencies(
  variable: ProjectedFormula,
  model: ProjectedModel,
  engine: FormulaEngine = defaultFormulaEngine
): string[] {
  return engine.inspect(variable, model).dependencies;
}

function inputQuantity(
  variable: ProjectedInput,
  defaults: FormatDefaults,
  engine: FormulaEngine
): Quantity {
  if (variable.inputType === "boolean") {
    return variable.value;
  }
  const kind = formatKindOf(variable);
  if (kind === "currency") {
    const code = currencyOf(variable, defaults);
    engine.ensureCurrency(code);
    return engine.unit(variable.value, code);
  }
  if (kind === "unit" && variable.unit) {
    return engine.unit(variable.value, variable.unit);
  }
  // Percent inputs are display values (20 means 20%) but formulas receive a
  // dimensionless ratio so ordinary scalar algebra works: 1 + 20% = 1.2.
  if (kind === "percent") {
    return variable.value / 100;
  }
  return variable.value;
}

function normalizeQuantity(value: Unit): Quantity {
  const units = value.units as UnitPart[];
  const moneyPowers = new Map<string, number>();
  for (const { unit, power } of units) {
    const base = unit.base?.key;
    if (base?.startsWith("money_")) {
      moneyPowers.set(base, (moneyPowers.get(base) ?? 0) + power);
    }
  }
  const activeMoney = [...moneyPowers.entries()].filter(
    ([, power]) => Math.abs(power) > EPSILON
  );
  if (moneyPowers.size > 1) {
    throw new Error("Currency arithmetic requires matching currencies");
  }
  if (activeMoney.some(([, power]) => Math.abs(power - 1) > EPSILON)) {
    throw new Error("Currency multiplication is not supported");
  }

  const dimensions =
    (value as Unit & { dimensions?: number[] }).dimensions ?? [];
  const shouldSimplify =
    units.length > 1 &&
    (units.some(({ unit }) => unit.name === "percent") ||
      dimensions.every((power) => Math.abs(power) < EPSILON));
  const normalized = shouldSimplify ? value.clone().simplify() : value;
  if ((normalized.units as UnitPart[]).length === 0) {
    const numeric = Number(normalized.toNumeric());
    if (!Number.isFinite(numeric)) {
      throw new TypeError("Formula must return a finite number");
    }
    return numeric;
  }
  return normalized;
}

function formatQuantity(
  value: Unit,
  defaults: FormatDefaults
): { value: number; formatted: string } {
  const numeric = Number(value.toNumeric());
  if (!Number.isFinite(numeric)) {
    throw new TypeError("Formula must return a finite quantity");
  }

  const units = value.units as UnitPart[];
  if (units.length === 1 && units[0].power === 1) {
    const { name } = units[0].unit;
    const base = units[0].unit.base?.key;
    if (base?.startsWith("money_")) {
      const currency = base.slice("money_".length);
      return {
        formatted: formatValue(numeric, {
          currency,
          locale: defaults.locale,
          style: "currency",
        }),
        value: numeric,
      };
    }
    if (name === "percent") {
      return {
        formatted: formatValue(numeric / 100, "percent", defaults),
        value: numeric,
      };
    }
  }

  return {
    formatted: formatValue(numeric, {
      locale: defaults.locale,
      style: "unit",
      unit: value.formatUnits(),
    }),
    value: numeric,
  };
}

function errorResult(
  variable: ProjectedVariable,
  message: string
): EvaluatedVariable {
  return {
    ...variable,
    error: message,
    formatted: `Error: ${message}`,
    status: "error",
  };
}

function missingResult(
  variable: ProjectedVariable,
  missing: string[]
): EvaluatedVariable {
  const names = [...new Set(missing)].toSorted();
  return {
    ...variable,
    error: `Missing variable${names.length === 1 ? "" : "s"}: ${names.join(", ")}`,
    formatted: `Missing: ${names.join(", ")}`,
    missing: names,
    status: "missing",
  };
}

/** A projection issue rendered as an evaluation error, so its block shows why. */
function issueResult(
  issue: ProjectionIssue & { varId: string }
): EvaluatedVariable {
  const base = {
    blockId: issue.blockId,
    name: issue.name ?? "",
    varId: issue.varId,
  };
  const variable: ProjectedVariable =
    issue.kind === "formula"
      ? { ...base, formula: "", kind: "formula" }
      : { ...base, kind: "input", value: Number.NaN };
  return errorResult(variable, issue.message);
}

function evaluateInput(
  variable: ProjectedInput,
  defaults: FormatDefaults,
  engine: FormulaEngine,
  quantities: Record<string, Quantity>
): EvaluatedVariable {
  if (!Number.isFinite(variable.value)) {
    return errorResult(variable, "Input must be a finite number");
  }
  try {
    quantities[variable.varId] = inputQuantity(variable, defaults, engine);
    if (variable.inputType === "boolean") {
      return {
        ...variable,
        formatted: variable.value ? "Yes" : "No",
        status: "ok",
      };
    }
    const shown =
      formatKindOf(variable) === "percent"
        ? variable.value / 100
        : variable.value;
    return {
      ...variable,
      formatted: formatValue(shown, variable, defaults),
      status: "ok",
    };
  } catch (error) {
    return errorResult(
      variable,
      error instanceof Error ? error.message : String(error)
    );
  }
}

function formulaResult(
  variable: ProjectedFormula,
  value: unknown,
  defaults: FormatDefaults,
  quantities: Record<string, Quantity>
): EvaluatedVariable {
  if (isUnit(value)) {
    const cancelledCurrency = (value.units as UnitPart[]).some(({ unit }) =>
      unit.base?.key?.startsWith("money_")
    );
    const normalized = normalizeQuantity(value);
    quantities[variable.varId] = normalized;
    if (isUnit(normalized)) {
      return {
        ...variable,
        status: "ok",
        ...formatQuantity(normalized, defaults),
      };
    }
    const format = cancelledCurrency
      ? { maximumFractionDigits: 2, style: "number" as const }
      : undefined;
    return {
      ...variable,
      formatted: formatValue(normalized, format, defaults),
      status: "ok",
      value: normalized,
    };
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    quantities[variable.varId] = value;
    return {
      ...variable,
      formatted: formatValue(value, undefined, defaults),
      status: "ok",
      value,
    };
  }
  return errorResult(variable, "Formula must return a finite number");
}

function evaluateFormula(
  variable: ProjectedFormula,
  model: ProjectedModel,
  defaults: FormatDefaults,
  engine: FormulaEngine,
  quantities: Record<string, Quantity>,
  evaluate: (variable: ProjectedVariable) => EvaluatedVariable
): EvaluatedVariable {
  const inspected = engine.inspect(variable, model);
  if (inspected.error) {
    return errorResult(variable, inspected.error);
  }
  if (inspected.missing.length > 0) {
    return missingResult(variable, inspected.missing);
  }
  if (!inspected.node) {
    return errorResult(variable, "Formula could not be parsed");
  }
  const scope: Record<string, Quantity> = {};
  const inheritedMissing: string[] = [];
  let dependencyError: string | undefined;
  for (const name of inspected.dependencies) {
    const dependency = evaluate(model.byId[model.idByName[name]]);
    if (dependency.status === "missing") {
      inheritedMissing.push(...(dependency.missing ?? [name]));
    } else if (dependency.status === "error") {
      dependencyError = dependency.error ?? `Invalid dependency ${name}`;
    } else {
      scope[name] = quantities[dependency.varId];
    }
  }
  if (inheritedMissing.length > 0) {
    return missingResult(variable, inheritedMissing);
  }
  if (dependencyError) {
    return errorResult(variable, dependencyError);
  }
  try {
    const value = inspected.node.compile().evaluate(scope);
    return formulaResult(variable, value, defaults, quantities);
  } catch (error) {
    return errorResult(
      variable,
      error instanceof Error ? error.message : String(error)
    );
  }
}

/** Evaluates a projected registry with dependency ordering independent of block order. */
export function evaluateModel(
  model: ProjectedModel,
  defaults: FormatDefaults = {},
  engine: FormulaEngine = defaultFormulaEngine
): EvaluationResult {
  // Register currency symbols before parsing so expressions such as `usd to EUR`
  // recognize the conversion target as a unit rather than a missing variable.
  for (const variable of model.variables) {
    if (variable.kind === "input" && formatKindOf(variable) === "currency") {
      engine.ensureCurrency(currencyOf(variable, defaults));
    }
  }
  const byId: Record<string, EvaluatedVariable> = Object.create(null);
  const quantities: Record<string, Quantity> = Object.create(null);
  const visiting = new Set<string>();

  const evaluate = (variable: ProjectedVariable): EvaluatedVariable => {
    if (Object.hasOwn(byId, variable.varId)) {
      return byId[variable.varId];
    }
    if (visiting.has(variable.varId)) {
      return errorResult(
        variable,
        `Circular reference involving ${variable.name}`
      );
    }
    visiting.add(variable.varId);
    const result =
      variable.kind === "input"
        ? evaluateInput(variable, defaults, engine, quantities)
        : evaluateFormula(
            variable,
            model,
            defaults,
            engine,
            quantities,
            evaluate
          );
    byId[variable.varId] = result;
    visiting.delete(variable.varId);
    return result;
  };

  const variables = model.variables.map(evaluate);
  for (const issue of model.issues) {
    if (issue.varId && !Object.hasOwn(byId, issue.varId)) {
      const result = issueResult({ ...issue, varId: issue.varId });
      byId[issue.varId] = result;
      variables.push(result);
    }
  }
  const byName: Record<string, EvaluatedVariable> = Object.create(null);
  for (const variable of variables) {
    if (!Object.hasOwn(byName, variable.name)) {
      byName[variable.name] = variable;
    }
  }
  return { byId, byName, variables };
}
