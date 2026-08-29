import {
  BlockNoteSchema,
  createHeadingBlockSpec,
  defaultBlockSpecs,
  defaultInlineContentSpecs,
  defaultStyleSpecs,
} from "@blocknote/core";
import {
  createReactBlockSpec,
  createReactInlineContentSpec,
} from "@blocknote/react";
import { InfoIcon, XIcon } from "lucide-react";
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import { HEADING_LEVELS } from "./engine/document";
import { CURRENCIES, UNIT_GROUPS, UNITS } from "./engine/units";
import {
  clampSliderValue,
  DECIMALS_AUTO,
  DECIMALS_MAX,
  FORMULA_PROP_DEFAULTS,
  INPUT_PROP_DEFAULTS,
  parseSelectOptions,
  serializeSelectOptions,
} from "./engine/variable";
import type { SelectOption } from "./engine/variable";
import type { EvaluationResult } from "./model";
import { createBlockNotePort } from "./notebook/blocknote-port";
import { renameVariableIn, setBlockProps } from "./notebook/mutations";

const ModelContext = createContext<EvaluationResult | null>(null);
export const ModelProvider = ModelContext.Provider;

/** BlockNote prop schema for every input block, derived from the shared defaults. */
const sharedProps = {
  currency: { default: INPUT_PROP_DEFAULTS.currency as string },
  decimals: { default: INPUT_PROP_DEFAULTS.decimals as number },
  format: { default: INPUT_PROP_DEFAULTS.format as string },
  locale: { default: INPUT_PROP_DEFAULTS.locale as string },
  name: { default: INPUT_PROP_DEFAULTS.name as string },
  unit: { default: INPUT_PROP_DEFAULTS.unit as string },
  value: { default: INPUT_PROP_DEFAULTS.value as number },
  varId: { default: INPUT_PROP_DEFAULTS.varId as string },
};

const FORMAT_OPTIONS = [
  { label: "Number", value: "number" },
  { label: "Currency", value: "currency" },
  { label: "Percent", value: "percent" },
  { label: "Unit", value: "unit" },
];

/**
 * The props a model block carries. Every input block has the shared fields;
 * bounds, options, and formula are present only on the blocks that use them.
 */
interface ModelBlockProps {
  varId: string;
  name: string;
  value?: number;
  format?: string;
  currency?: string;
  unit?: string;
  decimals?: number;
  locale?: string;
  min?: number;
  max?: number;
  step?: number;
  options?: string;
  formula?: string;
}

/** What a block component needs: the block's identity and props, and the editor to write through. */
interface ModelBlockFields {
  block: { id: string; type: string; props: ModelBlockProps };
  // The editor is only handed to the port, so its BlockNote generics stay opaque.
  editor: unknown;
}

/** Every control writes through the shared mutation, never the raw editor. */
function updateProps(
  editor: unknown,
  block: ModelBlockFields["block"],
  props: Record<string, unknown>
) {
  setBlockProps(createBlockNotePort(editor), block.id, props);
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

/** What a model block shows when the variable evaluated. */
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

/** The one-word label a failure shows. The reason goes in the tooltip. */
const FAILURE_LABELS = { error: "Error", missing: "Missing" } as const;

/**
 * A failed variable, in the width of a word. The block stays readable, and
 * the reason is one hover away.
 */
function Failure({
  status,
  detail,
}: {
  status: "error" | "missing";
  detail: string;
}) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger
          aria-label={detail}
          className="text-destructive flex shrink-0 cursor-help items-center gap-1 bg-transparent text-sm font-semibold whitespace-nowrap"
          type="button"
        >
          {FAILURE_LABELS[status]}
          <InfoIcon aria-hidden="true" className="size-3.5" />
        </TooltipTrigger>
        <TooltipContent>{detail}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
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
  if (variable?.status === "error" || variable?.status === "missing") {
    return (
      <Failure
        detail={variable.error ?? variable.formatted}
        status={variable.status}
      />
    );
  }
  return (
    <span className="text-foreground shrink-0 text-sm font-semibold whitespace-nowrap tabular-nums">
      {renderValue(variable, fallback, boolean)}
    </span>
  );
}

/** The editable variable name: the only caption a model block has. */
function VariableName({
  block,
  editor,
  className = "-mx-1.5 w-56",
}: ModelBlockFields & { className?: string }) {
  return (
    <Input
      aria-label="Variable name"
      className={`h-7 border-transparent bg-transparent px-1.5 font-mono text-[13px] font-semibold shadow-none ${className}`}
      defaultValue={block.props.name}
      onBlur={(event) => {
        const nextName = event.currentTarget.value.trim();
        if (!nextName || nextName === block.props.name) {
          return;
        }
        try {
          renameVariableIn(
            createBlockNotePort(editor),
            block.props.varId,
            nextName
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

function FormatFields({
  block,
  editor,
  includeStep = false,
}: ModelBlockFields & { includeStep?: boolean }) {
  const set = (props: Record<string, unknown>) =>
    updateProps(editor, block, props);
  const unknownCurrency =
    block.props.currency &&
    !CURRENCIES.includes(block.props.currency as (typeof CURRENCIES)[number]);
  const unknownUnit =
    block.props.unit &&
    !(UNITS as readonly string[]).includes(block.props.unit);
  const currencies = unknownCurrency
    ? [block.props.currency, ...CURRENCIES]
    : [...CURRENCIES];
  return (
    <div className="flex flex-wrap items-end gap-x-3 gap-y-2 border-t pt-3">
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
            value={
              (block.props.decimals ?? DECIMALS_AUTO) < 0
                ? ""
                : block.props.decimals
            }
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

function SliderFields({ block, editor }: ModelBlockFields) {
  const { min = 0, max = 0, value = 0 } = block.props;
  const setBound = (key: "min" | "max" | "step", raw: string) => {
    const next = Number(raw);
    if (!Number.isFinite(next)) {
      return;
    }
    if (key === "step") {
      updateProps(editor, block, { step: next });
      return;
    }
    const nextMin = key === "min" ? Math.min(next, max) : min;
    const nextMax = key === "max" ? Math.max(next, min) : max;
    updateProps(editor, block, {
      max: nextMax,
      min: nextMin,
      value: clampSliderValue(value, nextMin, nextMax),
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

/**
 * The option list of a select block. It lives in the six-dot menu, not in the
 * block, so the block shows only the name, the choice, and the value.
 */
export function SelectOptions({ block, editor }: ModelBlockFields) {
  const options = parseSelectOptions(block.props.options);
  const save = (next: SelectOption[]) => {
    const safe = next.length ? next : [{ label: "Option", value: 0 }];
    const value = safe.some((option) => option.value === block.props.value)
      ? block.props.value
      : safe[0].value;
    updateProps(editor, block, {
      options: serializeSelectOptions(safe),
      value,
    });
  };
  const edit = (index: number, patch: Partial<SelectOption>) =>
    save(
      options.map((option, optionIndex) =>
        optionIndex === index ? { ...option, ...patch } : option
      )
    );
  return (
    <div aria-label="Select options" className="flex w-72 flex-col gap-1.5 p-2">
      <p className="text-muted-foreground px-0.5 text-[10px] font-medium tracking-wide uppercase">
        Options
      </p>
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
function ModelBlock({ children }: { children: React.ReactNode }) {
  return (
    <Card className="modelo-block bg-card my-1.5 gap-3 rounded-lg px-4 py-3 shadow-none">
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
        <VariableName block={block} editor={editor} />
        <div className="flex items-center gap-3">
          <Input
            aria-label={block.props.name}
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
        <VariableName block={block} editor={editor} />
        <div className="flex items-center gap-4">
          <Slider
            aria-label={block.props.name}
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
          <VariableName block={block} editor={editor} />
          <div className="flex items-center gap-3">
            <Select
              items={items}
              onValueChange={(next) =>
                updateProps(editor, block, { value: Number(next) })
              }
              value={String(block.props.value)}
            >
              <SelectTrigger aria-label={block.props.name} className="w-44">
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
        <VariableName block={block} editor={editor} />
        <div className="flex items-center gap-3">
          <Switch
            aria-label={block.props.name}
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
      </ModelBlock>
    ),
  }
);

/** The `=` sign that separates the name, the formula, and the result. */
function Equals() {
  return (
    <span
      aria-hidden="true"
      className="text-muted-foreground shrink-0 font-mono text-[13px]"
    >
      =
    </span>
  );
}

const FormulaBlock = createReactBlockSpec(
  {
    content: "none",
    propSchema: {
      formula: { default: FORMULA_PROP_DEFAULTS.formula as string },
      name: { default: FORMULA_PROP_DEFAULTS.name as string },
      varId: { default: FORMULA_PROP_DEFAULTS.varId as string },
    },
    type: "formula",
  },
  {
    render: ({ block, editor }) => (
      <ModelBlock>
        <div className="flex w-full items-center gap-2">
          <VariableName
            block={block}
            className="field-sizing-content max-w-56 min-w-24 shrink-0"
            editor={editor}
          />
          <Equals />
          <Input
            aria-label={`${block.props.name} expression`}
            className="field-sizing-content h-7 max-w-full min-w-32 font-mono text-[13px]"
            onChange={(e) =>
              updateProps(editor, block, { formula: e.target.value })
            }
            value={block.props.formula}
          />
          <div className="ml-auto flex shrink-0 items-center gap-2 pl-2">
            <Equals />
            <Value varId={block.props.varId} />
          </div>
        </div>
      </ModelBlock>
    ),
  }
);

/** The live value chip an `@name` reference renders as inside prose. */
function VariableRefChip({ name, varId }: { name: string; varId: string }) {
  const model = useContext(ModelContext);
  const variable = model?.byId[varId];
  const failed =
    !variable || variable.status === "error" || variable.status === "missing";
  return (
    <Badge
      className="mx-px rounded-md px-1.5 py-0 align-baseline text-[0.92em] font-semibold tabular-nums"
      title={name || variable?.name || "Missing variable"}
      variant={failed ? "destructive" : "secondary"}
    >
      {variable?.formatted ?? "missing"}
    </Badge>
  );
}

const VariableRef = createReactInlineContentSpec(
  {
    content: "none",
    propSchema: { name: { default: "" }, varId: { default: "" } },
    type: "variableRef",
  },
  {
    render: ({ inlineContent }) => (
      <VariableRefChip
        name={inlineContent.props.name}
        varId={inlineContent.props.varId}
      />
    ),
  }
);

/**
 * What Modelo removes from BlockNote's defaults.
 *
 * A notebook holds prose and a model, not media, so the four file blocks go.
 * The code block goes too: a calculation belongs in a formula block. So does
 * the quote. The toggle list and the toggleable heading go with them, and so
 * do the two colour styles. What cannot leave the schema leaves the menus instead
 * (`editor-menus.tsx`): every default block carries text alignment and block
 * colour, and nesting is structural.
 */
const {
  audio: _audio,
  codeBlock: _codeBlock,
  file: _file,
  image: _image,
  quote: _quote,
  toggleListItem: _toggleListItem,
  video: _video,
  ...keptBlockSpecs
} = defaultBlockSpecs;
const {
  backgroundColor: _backgroundColor,
  textColor: _textColor,
  ...keptStyleSpecs
} = defaultStyleSpecs;

export const modeloSchema = BlockNoteSchema.create({
  blockSpecs: {
    ...keptBlockSpecs,
    boolean: BooleanBlock(),
    formula: FormulaBlock(),
    heading: createHeadingBlockSpec({
      allowToggleHeadings: false,
      levels: HEADING_LEVELS,
    }),
    number: NumberBlock(),
    select: SelectBlock(),
    slider: SliderBlock(),
  },
  inlineContentSpecs: {
    ...defaultInlineContentSpecs,
    variableRef: VariableRef,
  },
  styleSpecs: keptStyleSpecs,
});
export type ModeloEditor = typeof modeloSchema.BlockNoteEditor;
