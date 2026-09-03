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
import { InfoIcon } from "lucide-react";
import { createContext, useContext, useState } from "react";
import { toast } from "sonner";

import { Badge, badgeVariants } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import { HEADING_LEVELS } from "./engine/document";
import {
  clampSliderValue,
  FORMULA_PROP_DEFAULTS,
  INPUT_PROP_DEFAULTS,
  parseSelectOptions,
} from "./engine/variable";
import type { EvaluationResult } from "./model";
import { createBlockNotePort } from "./notebook/blocknote-port";
import { renameVariableIn, setBlockProps } from "./notebook/mutations";

const ModelContext = createContext<EvaluationResult | null>(null);
export const ModelProvider = ModelContext.Provider;

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
export interface ModelBlockFields {
  block: { id: string; type: string; props: ModelBlockProps };
  editor: unknown;
}

/** Every control writes through the shared mutation, never the raw editor. */
export function updateProps(
  editor: unknown,
  block: ModelBlockFields["block"],
  props: Record<string, unknown>
) {
  setBlockProps(createBlockNotePort(editor), block.id, props);
}

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

const FAILURE_LABELS = { error: "Error", missing: "Missing" } as const;

function Failure({
  status,
  detail,
}: {
  status: "error" | "missing";
  detail: string;
}) {
  return (
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

function VariableName({
  block,
  editor,
  className = "w-full md:field-sizing-content md:max-w-56 md:min-w-24 md:shrink-0",
}: ModelBlockFields & { className?: string }) {
  return (
    <Input
      aria-label="Variable name"
      className={`h-9 border-transparent bg-transparent px-1.5 text-base font-semibold shadow-none md:h-7 md:text-[13px] ${className}`}
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

function ModelBlock({ children }: { children: React.ReactNode }) {
  return (
    <Card className="modelo-block bg-card focus-within:border-ring my-1 w-full flex-col items-stretch gap-1.5 rounded-lg px-3 py-2 shadow-none transition-colors duration-150 ease-out md:flex-row md:items-center md:gap-2 md:py-1.5">
      {children}
    </Card>
  );
}

/** The control row: everything after the name, on its own line on a phone. */
function BlockRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2">{children}</div>
  );
}

function BlockEnd({ children }: { children: React.ReactNode }) {
  return (
    <div className="ml-auto flex shrink-0 items-center gap-2 pl-2">
      {children}
    </div>
  );
}

function NumberField({ block, editor }: ModelBlockFields) {
  const [editing, setEditing] = useState(false);
  const variable = useContext(ModelContext)?.byId[block.props.varId];
  const atRest =
    variable?.status === "ok" ? variable.formatted : block.props.value;
  return (
    <Input
      aria-label={block.props.name}
      className="h-9 w-full text-base tabular-nums md:h-7 md:w-44 md:text-[13px]"
      max={block.props.max}
      min={block.props.min}
      onBlur={() => setEditing(false)}
      onChange={(event) =>
        updateProps(editor, block, { value: Number(event.target.value) })
      }
      onFocus={() => setEditing(true)}
      step="any"
      type={editing ? "number" : "text"}
      value={editing ? block.props.value : atRest}
    />
  );
}

const NumberBlock = createReactBlockSpec(
  {
    content: "none",
    propSchema: {
      ...sharedProps,
      max: { default: undefined, type: "number" },
      min: { default: undefined, type: "number" },
    },
    type: "number",
  },
  {
    render: ({ block, editor }) => (
      <ModelBlock>
        <VariableName block={block} editor={editor} />
        <BlockRow>
          <NumberField block={block} editor={editor} />
        </BlockRow>
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
        <BlockRow>
          <Slider
            aria-label={block.props.name}
            className="min-w-24 flex-1"
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
          <BlockEnd>
            <Value fallback={block.props.value} varId={block.props.varId} />
          </BlockEnd>
        </BlockRow>
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
          <BlockRow>
            <Select
              items={items}
              onValueChange={(next) =>
                updateProps(editor, block, { value: Number(next) })
              }
              value={String(block.props.value)}
            >
              <SelectTrigger
                aria-label={block.props.name}
                className="h-9 flex-1 text-base md:h-7 md:w-44 md:flex-none md:text-[13px]"
              >
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
            <BlockEnd>
              <Value fallback={block.props.value} varId={block.props.varId} />
            </BlockEnd>
          </BlockRow>
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
        <BlockRow>
          <Switch
            aria-label={block.props.name}
            checked={Boolean(block.props.value)}
            onCheckedChange={(checked) =>
              updateProps(editor, block, { value: checked ? 1 : 0 })
            }
          />
          <BlockEnd>
            <Value
              boolean
              fallback={block.props.value}
              varId={block.props.varId}
            />
          </BlockEnd>
        </BlockRow>
      </ModelBlock>
    ),
  }
);

function Equals() {
  return (
    <span
      aria-hidden="true"
      className="text-muted-foreground shrink-0 text-[13px]"
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
        <VariableName block={block} editor={editor} />
        <BlockRow>
          <Equals />
          <Input
            aria-label={`${block.props.name} expression`}
            className="h-9 min-w-0 flex-1 text-base tabular-nums md:h-7 md:text-[13px]"
            onChange={(e) =>
              updateProps(editor, block, { formula: e.target.value })
            }
            value={block.props.formula}
          />
          <BlockEnd>
            <Equals />
            <Value varId={block.props.varId} />
          </BlockEnd>
        </BlockRow>
      </ModelBlock>
    ),
  }
);

const CHIP_CLASS =
  "mx-px rounded-md px-1.5 py-0 align-baseline text-[0.92em] font-semibold tabular-nums";

function VariableRefChip({ name, varId }: { name: string; varId: string }) {
  const model = useContext(ModelContext);
  const variable = model?.byId[varId];
  if (variable?.status === "ok") {
    return (
      <Badge className={CHIP_CLASS} title={name} variant="secondary">
        {variable.formatted}
      </Badge>
    );
  }
  const status = variable?.status ?? "missing";
  const detail = variable?.error ?? `Missing variable: ${name}`;
  return (
    <Tooltip>
      <TooltipTrigger
        aria-label={detail}
        className={cn(badgeVariants({ variant: "destructive" }), CHIP_CLASS)}
        type="button"
      >
        {FAILURE_LABELS[status]}
      </TooltipTrigger>
      <TooltipContent>{detail}</TooltipContent>
    </Tooltip>
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
