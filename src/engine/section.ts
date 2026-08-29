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
  options?: { label: string; value: number }[];
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

export function inlineContentFromText(
  text: string,
  idByName: Record<string, string>
): (string | { type: "ref"; varId: string; label: string })[] {
  const inline: (string | { type: "ref"; varId: string; label: string })[] = [];
  const pattern = /@(?<name>[A-Za-z_][A-Za-z0-9_]*)/gu;
  let start = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text))) {
    if (match.index > start) {
      inline.push(text.slice(start, match.index));
    }
    const varId = Object.hasOwn(idByName, match[1])
      ? idByName[match[1]]
      : undefined;
    inline.push(varId ? { label: match[1], type: "ref", varId } : match[0]);
    start = match.index + match[0].length;
  }
  if (start < text.length) {
    inline.push(text.slice(start));
  }
  return inline;
}

/** The display format an input declares, or the one its fields imply. */
function inputFormat(value: SectionInput | SectionFormula): string {
  if ("format" in value && value.format) {
    return value.format;
  }
  if ("currency" in value && value.currency) {
    return "currency";
  }
  if ("unit" in value && value.unit) {
    return "unit";
  }
  return "number";
}

/** Boolean inputs persist as 0 or 1, every other input keeps its number. */
function sectionInputValue(kind: string, value: SectionInput): number {
  if (kind !== "boolean") {
    return value.value;
  }
  return value.value ? 1 : 0;
}

export function buildSectionBlocks(
  args: WriteSectionArgs,
  existingIdByName: Record<string, string>,
  makeId: () => string
): any[] {
  const idByName = Object.assign(
    Object.create(null) as Record<string, string>,
    existingIdByName
  );
  const variables = [
    ...(args.inputs ?? []).map((input) => ({ kind: input.kind, value: input })),
    ...(args.formulas ?? []).map((formula) => ({
      kind: "formula" as const,
      value: formula,
    })),
  ].map(({ kind, value }) => {
    const varId = makeId();
    idByName[value.name] = varId;
    const format = kind === "formula" ? "number" : inputFormat(value);
    return {
      id: makeId(),
      props: {
        label: value.label ?? value.name,
        name: value.name,
        varId,
        ...(kind === "formula"
          ? { formula: (value as SectionFormula).formula }
          : {
              value: sectionInputValue(kind, value as SectionInput),
            }),
        ...(kind !== "formula" && format !== "number" ? { format } : {}),
        ...(kind !== "formula" && "currency" in value && value.currency
          ? { currency: value.currency }
          : {}),
        ...(kind !== "formula" && "unit" in value && value.unit
          ? { unit: value.unit }
          : {}),
        ...("min" in value && value.min !== undefined
          ? { min: value.min }
          : {}),
        ...("max" in value && value.max !== undefined
          ? { max: value.max }
          : {}),
        ...("step" in value && value.step !== undefined
          ? { step: value.step }
          : {}),
        ...("options" in value && value.options
          ? { options: value.options }
          : {}),
        ...(kind !== "formula" && value.decimals !== undefined
          ? { decimals: value.decimals }
          : {}),
      },
      type: kind,
    };
  });

  const paragraphs = args.body
    .split(/\n+/u)
    .map((text) => text.trim())
    .filter(Boolean)
    .map((text) => ({
      id: makeId(),
      inline: inlineContentFromText(text, idByName),
      type: "paragraph",
    }));

  return [
    { id: makeId(), level: 2, text: args.heading, type: "heading" },
    ...paragraphs,
    ...variables,
  ];
}
