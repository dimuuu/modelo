export type SectionInputKind = "number" | "slider" | "select" | "boolean";

export interface SectionInput {
  kind: SectionInputKind;
  name: string;
  value: number;
  label?: string;
  min?: number;
  max?: number;
  step?: number;
  format?: "number" | "currency" | "percent" | "unit";
  unit?: string;
  currency?: string;
  options?: Array<{ label: string; value: number }>;
  decimals?: number;
}

export interface SectionFormula {
  name: string;
  formula: string;
  label?: string;
}

export interface WriteSectionArgs {
  heading: string;
  body: string;
  inputs?: SectionInput[];
  formulas?: SectionFormula[];
  referenceBlockId?: string;
  placement?: "before" | "after";
  dry_run?: boolean;
}

export function inlineContentFromText(text: string, idByName: Record<string, string>): Array<string | { type: "ref"; varId: string; label: string }> {
  const inline: Array<string | { type: "ref"; varId: string; label: string }> = [];
  const pattern = /@([A-Za-z_][A-Za-z0-9_]*)/g;
  let start = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text))) {
    if (match.index > start) inline.push(text.slice(start, match.index));
    const varId = Object.prototype.hasOwnProperty.call(idByName, match[1]) ? idByName[match[1]] : undefined;
    inline.push(varId ? { type: "ref", varId, label: match[1] } : match[0]);
    start = match.index + match[0].length;
  }
  if (start < text.length) inline.push(text.slice(start));
  return inline;
}

export function buildSectionBlocks(
  args: WriteSectionArgs,
  existingIdByName: Record<string, string>,
  makeId: () => string,
): any[] {
  const idByName = Object.assign(Object.create(null) as Record<string, string>, existingIdByName);
  const variables = [
    ...(args.inputs ?? []).map((input) => ({ kind: input.kind, value: input })),
    ...(args.formulas ?? []).map((formula) => ({ kind: "formula" as const, value: formula })),
  ].map(({ kind, value }) => {
    const varId = makeId();
    idByName[value.name] = varId;
    const format = kind === "formula" ? "number" : value.format ?? ("currency" in value && value.currency ? "currency" : "unit" in value && value.unit ? "unit" : "number");
    return {
      id: makeId(),
      type: kind,
      props: {
        varId,
        name: value.name,
        label: value.label ?? value.name,
        ...(kind === "formula" ? { formula: (value as SectionFormula).formula } : { value: kind === "boolean" ? ((value as SectionInput).value ? 1 : 0) : (value as SectionInput).value }),
        ...(kind !== "formula" && format !== "number" ? { format } : {}),
        ...(kind !== "formula" && "currency" in value && value.currency ? { currency: value.currency } : {}),
        ...(kind !== "formula" && "unit" in value && value.unit ? { unit: value.unit } : {}),
        ...("min" in value && value.min !== undefined ? { min: value.min } : {}),
        ...("max" in value && value.max !== undefined ? { max: value.max } : {}),
        ...("step" in value && value.step !== undefined ? { step: value.step } : {}),
        ...("options" in value && value.options ? { options: value.options } : {}),
        ...(kind !== "formula" && value.decimals !== undefined ? { decimals: value.decimals } : {}),
      },
    };
  });

  const paragraphs = args.body.split(/\n+/).map((text) => text.trim()).filter(Boolean).map((text) => ({
    id: makeId(),
    type: "paragraph",
    inline: inlineContentFromText(text, idByName),
  }));

  return [
    { id: makeId(), type: "heading", level: 2, text: args.heading },
    ...paragraphs,
    ...variables,
  ];
}
