import {
  BlockNoteSchema,
  defaultBlockSpecs,
  defaultInlineContentSpecs,
} from "@blocknote/core";
import {
  createReactBlockSpec,
  createReactInlineContentSpec,
} from "@blocknote/react";
import { XIcon } from "lucide-react";
import { createContext, useContext, useId } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";

import { renameVariable } from "./engine/rename";
import { CURRENCIES, UNIT_GROUPS, UNITS } from "./engine/units";
import type { EvaluationResult } from "./model";

const ModelContext = createContext<EvaluationResult | null>(null);
export const ModelProvider = ModelContext.Provider;

interface SelectOption {
  label: string;
  value: number;
}
type ModelKind = "number" | "slider" | "select" | "boolean" | "formula";

const DECIMALS_AUTO = -1;
const DECIMALS_MAX = 8;

const sharedProps = {
  currency: { default: "EUR" },
  decimals: { default: DECIMALS_AUTO },
  format: { default: "number" },
  label: { default: "Variable" },
  locale: { default: "" },
  name: { default: "variable" },
  unit: { default: "" },
  value: { default: 0 },
  varId: { default: "" },
};

const FORMAT_OPTIONS = [
  { label: "Number", value: "number" },
  { label: "Currency", value: "currency" },
  { label: "Percent", value: "percent" },
  { label: "Unit", value: "unit" },
];

export function parseSelectOptions(value: string): SelectOption[] {
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter(
      (option): option is SelectOption =>
        option &&
        typeof option.label === "string" &&
        typeof option.value === "number" &&
        Number.isFinite(option.value)
    );
  } catch {
    return [];
  }
}

export function clampSliderValue(
  value: number,
  min: number,
  max: number
): number {
  const low = Math.min(min, max);
  const high = Math.max(min, max);
  return Math.min(high, Math.max(low, value));
}

function updateProps(editor: any, block: any, props: Record<string, unknown>) {
  editor.transact(() => editor.updateBlock(block, { props }));
}

/** One captioned control in a model block's configuration row. */
function Field({
  caption,
  children,
  className,
}: {
  caption: string;
  children: (id: string) => React.ReactNode;
  className?: string;
}) {
  const id = useId();
  return (
    <div className={`flex min-w-0 flex-col gap-1 ${className ?? ""}`}>
      <Label
        className="text-muted-foreground text-[10px] font-medium tracking-wide uppercase"
        htmlFor={id}
      >
        {caption}
      </Label>
      {children(id)}
    </div>
  );
}

/** What a model block shows: the evaluated value, or the raw prop until then. */
function renderValue(
  variable: EvaluationResult["byId"][string] | undefined,
  fallback: number | undefined,
  boolean: boolean
): string | number {
  if (boolean) {
    if (variable?.status === "ok") {
      return variable.value ? "Yes" : "No";
    }
    return variable?.formatted ?? (fallback ? "Yes" : "No");
  }
  return variable?.formatted ?? fallback ?? "missing";
}

function Value({
  varId,
  fallback,
  boolean = false,
}: {
  varId: string;
  fallback?: number;
  boolean?: boolean;
}) {
  const model = useContext(ModelContext);
  const variable = model?.byId[varId];
  const rendered = renderValue(variable, fallback, boolean);
  const failed = variable?.status === "error" || variable?.status === "missing";
  return (
    <span
      className={`shrink-0 text-sm font-semibold whitespace-nowrap tabular-nums ${
        failed ? "text-destructive" : "text-foreground"
      }`}
    >
      {rendered}
    </span>
  );
}

function VariableName({ block, editor }: any) {
  return (
    <Input
      aria-label="Variable name"
      className="text-muted-foreground h-6 w-36 border-transparent bg-transparent px-1.5 text-right font-mono text-[11px] shadow-none"
      defaultValue={block.props.name}
      onBlur={(event) => {
        const nextName = event.currentTarget.value.trim();
        if (!nextName || nextName === block.props.name) {
          return;
        }
        try {
          const renamed = renameVariable(
            editor.document as any,
            block.props.varId,
            nextName
          );
          editor.transact(() =>
            editor.replaceBlocks(editor.document as any, renamed as any)
          );
        } catch (error) {
          event.currentTarget.value = block.props.name;
          toast.error(
            error instanceof Error ? error.message : "Could not rename variable"
          );
        }
      }}
    />
  );
}

/** The bold caption and the editable variable name shown above every control. */
function BlockHeader({ block, editor }: any) {
  return (
    <div className="flex items-center justify-between gap-3">
      <strong className="truncate text-sm font-semibold">
        {block.props.label}
      </strong>
      <VariableName block={block} editor={editor} />
    </div>
  );
}

function LabelField({ block, editor }: any) {
  return (
    <Field caption="Label">
      {(id) => (
        <Input
          aria-label="Label"
          className="h-7 text-[13px]"
          id={id}
          onChange={(event) =>
            updateProps(editor, block, { label: event.currentTarget.value })
          }
          value={block.props.label}
        />
      )}
    </Field>
  );
}

function FormatFields({ block, editor, includeStep = false }: any) {
  const set = (props: Record<string, unknown>) =>
    updateProps(editor, block, props);
  const unknownCurrency =
    block.props.currency &&
    !CURRENCIES.includes(block.props.currency as (typeof CURRENCIES)[number]);
  const unknownUnit = block.props.unit && !UNITS.includes(block.props.unit);
  const currencies = unknownCurrency
    ? [block.props.currency, ...CURRENCIES]
    : [...CURRENCIES];
  return (
    <div className="flex flex-wrap items-end gap-x-3 gap-y-2 border-t pt-3">
      <LabelField block={block} editor={editor} />
      <Field caption="Format">
        {(id) => (
          <Select
            items={FORMAT_OPTIONS}
            onValueChange={(format) => set({ format })}
            value={block.props.format}
          >
            <SelectTrigger
              aria-label="Format"
              className="h-7 w-28 text-[13px]"
              id={id}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FORMAT_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </Field>
      {block.props.format === "currency" && (
        <Field caption="Currency">
          {(id) => (
            <Select
              onValueChange={(currency) => set({ currency })}
              value={block.props.currency}
            >
              <SelectTrigger
                aria-label="Currency code"
                className="h-7 w-24 text-[13px]"
                id={id}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {currencies.map((currency) => (
                  <SelectItem key={currency} value={currency}>
                    {currency}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </Field>
      )}
      {block.props.format === "unit" && (
        <Field caption="Unit">
          {(id) => (
            <Select
              onValueChange={(unit) => set({ unit })}
              value={block.props.unit}
            >
              <SelectTrigger
                aria-label="Unit"
                className="h-7 w-24 text-[13px]"
                id={id}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {unknownUnit && (
                  <SelectItem value={block.props.unit}>
                    {block.props.unit}
                  </SelectItem>
                )}
                {UNIT_GROUPS.map((group) => (
                  <SelectGroup key={group.label}>
                    <SelectLabel>{group.label}</SelectLabel>
                    {group.units.map((unit) => (
                      <SelectItem key={unit} value={unit}>
                        {unit}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
          )}
        </Field>
      )}
      <Field caption="Decimals">
        {(id) => (
          <Input
            aria-label="Decimals"
            className="h-7 w-20 text-[13px]"
            id={id}
            max={DECIMALS_MAX}
            min="0"
            onChange={(event) => {
              const raw = event.currentTarget.value;
              set({
                decimals:
                  raw === ""
                    ? DECIMALS_AUTO
                    : Math.max(
                        0,
                        Math.min(DECIMALS_MAX, Math.round(Number(raw)))
                      ),
              });
            }}
            placeholder="Auto"
            type="number"
            value={block.props.decimals < 0 ? "" : block.props.decimals}
          />
        )}
      </Field>
      {includeStep && (
        <Field caption="Step">
          {(id) => (
            <Input
              aria-label="Number step"
              className="h-7 w-20 text-[13px]"
              id={id}
              onChange={(event) =>
                set({ step: Number(event.currentTarget.value) })
              }
              type="number"
              value={block.props.step}
            />
          )}
        </Field>
      )}
    </div>
  );
}

function SliderFields({ block, editor }: any) {
  const setBound = (key: "min" | "max" | "step", raw: string) => {
    const next = Number(raw);
    if (!Number.isFinite(next)) {
      return;
    }
    if (key === "step") {
      updateProps(editor, block, { step: next });
      return;
    }
    const min =
      key === "min" ? Math.min(next, block.props.max) : block.props.min;
    const max =
      key === "max" ? Math.max(next, block.props.min) : block.props.max;
    updateProps(editor, block, {
      max,
      min,
      value: clampSliderValue(block.props.value, min, max),
    });
  };
  const bounds = [
    { caption: "Min", key: "min" as const, label: "Slider minimum" },
    { caption: "Max", key: "max" as const, label: "Slider maximum" },
    { caption: "Step", key: "step" as const, label: "Slider step" },
  ];
  return (
    <div className="flex flex-wrap items-end gap-x-3 gap-y-2">
      {bounds.map((bound) => (
        <Field caption={bound.caption} key={bound.key}>
          {(id) => (
            <Input
              aria-label={bound.label}
              className="h-7 w-20 text-[13px]"
              id={id}
              onChange={(event) =>
                setBound(bound.key, event.currentTarget.value)
              }
              type="number"
              value={block.props[bound.key]}
            />
          )}
        </Field>
      ))}
    </div>
  );
}

function SelectOptions({ block, editor }: any) {
  const options = parseSelectOptions(block.props.options);
  const save = (next: SelectOption[]) => {
    const safe = next.length ? next : [{ label: "Option", value: 0 }];
    const value = safe.some((option) => option.value === block.props.value)
      ? block.props.value
      : safe[0].value;
    updateProps(editor, block, { options: JSON.stringify(safe), value });
  };
  const edit = (index: number, patch: Partial<SelectOption>) =>
    save(
      options.map((option, optionIndex) =>
        optionIndex === index ? { ...option, ...patch } : option
      )
    );
  return (
    <div
      aria-label="Select options"
      className="flex flex-col gap-1.5 border-t pt-3"
    >
      {options.map((option, index) => (
        <div
          className="grid grid-cols-[minmax(0,1fr)_6rem_auto] gap-1.5"
          key={index}
        >
          <Input
            aria-label={`Option ${index + 1} label`}
            className="h-7 text-[13px]"
            onChange={(event) =>
              edit(index, { label: event.currentTarget.value })
            }
            value={option.label}
          />
          <Input
            aria-label={`Option ${index + 1} value`}
            className="h-7 text-[13px]"
            onChange={(event) =>
              edit(index, { value: Number(event.currentTarget.value) })
            }
            type="number"
            value={option.value}
          />
          <Button
            aria-label={`Remove option ${index + 1}`}
            disabled={options.length <= 1}
            onClick={() =>
              save(options.filter((_, optionIndex) => optionIndex !== index))
            }
            size="icon-sm"
            type="button"
            variant="ghost"
          >
            <XIcon />
          </Button>
        </div>
      ))}
      <Button
        className="self-start"
        onClick={() =>
          save([
            ...options,
            { label: `Option ${options.length + 1}`, value: options.length },
          ])
        }
        size="xs"
        type="button"
        variant="outline"
      >
        + Add option
      </Button>
    </div>
  );
}

/** The shared frame every model block renders inside. */
function ModelBlock({
  accent = false,
  children,
}: {
  accent?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Card
      className={`bg-card my-1.5 gap-3 rounded-lg px-4 py-3 shadow-none ${
        accent ? "border-l-primary border-l-2" : ""
      }`}
    >
      {children}
    </Card>
  );
}

const NumberBlock = createReactBlockSpec(
  {
    content: "none",
    propSchema: {
      ...sharedProps,
      max: { default: undefined, type: "number" },
      min: { default: undefined, type: "number" },
      step: { default: 1 },
    },
    type: "number",
  },
  {
    render: ({ block, editor }) => (
      <ModelBlock>
        <BlockHeader block={block} editor={editor} />
        <div className="flex items-center gap-3">
          <Input
            aria-label={block.props.label}
            className="max-w-44"
            max={block.props.max}
            min={block.props.min}
            onChange={(e) =>
              updateProps(editor, block, { value: Number(e.target.value) })
            }
            step={block.props.step}
            type="number"
            value={block.props.value}
          />
          <Value fallback={block.props.value} varId={block.props.varId} />
        </div>
        <FormatFields block={block} editor={editor} includeStep />
      </ModelBlock>
    ),
  }
);

const SliderBlock = createReactBlockSpec(
  {
    content: "none",
    propSchema: {
      ...sharedProps,
      max: { default: 100 },
      min: { default: 0 },
      step: { default: 1 },
    },
    type: "slider",
  },
  {
    render: ({ block, editor }) => (
      <ModelBlock>
        <BlockHeader block={block} editor={editor} />
        <div className="flex items-center gap-4">
          <Slider
            aria-label={block.props.label}
            max={block.props.max}
            min={block.props.min}
            onValueChange={(next) =>
              updateProps(editor, block, {
                value: Array.isArray(next) ? next[0] : next,
              })
            }
            step={block.props.step}
            value={clampSliderValue(
              block.props.value,
              block.props.min,
              block.props.max
            )}
          />
          <Value fallback={block.props.value} varId={block.props.varId} />
        </div>
        <FormatFields block={block} editor={editor} />
        <SliderFields block={block} editor={editor} />
      </ModelBlock>
    ),
  }
);

const SelectBlock = createReactBlockSpec(
  {
    content: "none",
    propSchema: {
      ...sharedProps,
      options: {
        default: '[{"label":"No","value":0},{"label":"Yes","value":1}]',
      },
    },
    type: "select",
  },
  {
    render: ({ block, editor }) => {
      const options = parseSelectOptions(block.props.options);
      const items = options.map((option) => ({
        label: option.label,
        value: String(option.value),
      }));
      return (
        <ModelBlock>
          <BlockHeader block={block} editor={editor} />
          <div className="flex items-center gap-3">
            <Select
              items={items}
              onValueChange={(next) =>
                updateProps(editor, block, { value: Number(next) })
              }
              value={String(block.props.value)}
            >
              <SelectTrigger aria-label={block.props.label} className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {options.map((option, index) => (
                  <SelectItem
                    key={`${index}-${option.value}`}
                    value={String(option.value)}
                  >
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Value fallback={block.props.value} varId={block.props.varId} />
          </div>
          <div className="flex flex-wrap items-end gap-x-3 gap-y-2 border-t pt-3">
            <LabelField block={block} editor={editor} />
          </div>
          <SelectOptions block={block} editor={editor} />
        </ModelBlock>
      );
    },
  }
);

const BooleanBlock = createReactBlockSpec(
  { content: "none", propSchema: sharedProps, type: "boolean" },
  {
    render: ({ block, editor }) => (
      <ModelBlock>
        <BlockHeader block={block} editor={editor} />
        <div className="flex items-center gap-3">
          <Switch
            aria-label={block.props.label}
            checked={Boolean(block.props.value)}
            onCheckedChange={(checked) =>
              updateProps(editor, block, { value: checked ? 1 : 0 })
            }
          />
          <Value
            boolean
            fallback={block.props.value}
            varId={block.props.varId}
          />
        </div>
        <div className="flex flex-wrap items-end gap-x-3 gap-y-2 border-t pt-3">
          <LabelField block={block} editor={editor} />
        </div>
      </ModelBlock>
    ),
  }
);

const FormulaBlock = createReactBlockSpec(
  {
    content: "none",
    propSchema: {
      formula: { default: "1 + 1" },
      label: { default: "Formula" },
      name: { default: "result" },
      varId: { default: "" },
    },
    type: "formula",
  },
  {
    render: ({ block, editor }) => (
      <ModelBlock accent>
        <BlockHeader block={block} editor={editor} />
        <div className="flex items-center gap-3">
          <Input
            aria-label={`${block.props.label} expression`}
            className="font-mono text-[13px]"
            onChange={(e) =>
              updateProps(editor, block, { formula: e.target.value })
            }
            value={block.props.formula}
          />
          <Value varId={block.props.varId} />
        </div>
        <div className="flex flex-wrap items-end gap-x-3 gap-y-2 border-t pt-3">
          <LabelField block={block} editor={editor} />
        </div>
      </ModelBlock>
    ),
  }
);

/** The live value chip an `@name` reference renders as inside prose. */
function VariableRefChip({ label, varId }: { label: string; varId: string }) {
  const model = useContext(ModelContext);
  const variable = model?.byId[varId];
  const failed =
    !variable || variable.status === "error" || variable.status === "missing";
  return (
    <Badge
      className="mx-px rounded-md px-1.5 py-0 align-baseline text-[0.92em] font-semibold tabular-nums"
      title={label || variable?.name || "Missing variable"}
      variant={failed ? "destructive" : "secondary"}
    >
      {variable?.formatted ?? "missing"}
    </Badge>
  );
}

const VariableRef = createReactInlineContentSpec(
  {
    content: "none",
    propSchema: { label: { default: "" }, varId: { default: "" } },
    type: "variableRef",
  },
  {
    render: ({ inlineContent }) => (
      <VariableRefChip
        label={inlineContent.props.label}
        varId={inlineContent.props.varId}
      />
    ),
  }
);

export const modeloSchema = BlockNoteSchema.create({
  blockSpecs: {
    ...defaultBlockSpecs,
    boolean: BooleanBlock(),
    formula: FormulaBlock(),
    number: NumberBlock(),
    select: SelectBlock(),
    slider: SliderBlock(),
  },
  inlineContentSpecs: {
    ...defaultInlineContentSpecs,
    variableRef: VariableRef,
  },
});
export type ModeloEditor = typeof modeloSchema.BlockNoteEditor;

export function newVariableProps(kind: ModelKind) {
  const id = crypto.randomUUID();
  const base = {
    label:
      kind === "boolean" ? "Toggle" : kind[0].toUpperCase() + kind.slice(1),
    name: `variable_${id.slice(0, 4)}`,
    varId: id,
  };
  if (kind === "slider") {
    return { ...base, max: 100, min: 0, step: 1, value: 50 };
  }
  if (kind === "select") {
    return {
      ...base,
      options: '[{"label":"No","value":0},{"label":"Yes","value":1}]',
      value: 0,
    };
  }
  if (kind === "boolean") {
    return { ...base, value: 0 };
  }
  if (kind === "formula") {
    return { ...base, formula: "1 + 1", name: `result_${id.slice(0, 4)}` };
  }
  return { ...base, step: 1, value: 0 };
}
