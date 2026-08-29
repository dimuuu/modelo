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
import { createContext, useContext } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
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
export interface ModelBlockFields {
  block: { id: string; type: string; props: ModelBlockProps };
  // The editor is only handed to the port, so its BlockNote generics stay opaque.
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

/** The editable variable name: the only caption a model block has. */
function VariableName({
  block,
  editor,
  className = "field-sizing-content max-w-56 min-w-24 shrink-0",
}: ModelBlockFields & { className?: string }) {
  return (
    <Input
      aria-label="Variable name"
      className={`h-7 border-transparent bg-transparent px-1.5 text-[13px] font-semibold shadow-none ${className}`}
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

/**
 * The shared frame every model block renders inside. The border answers the
 * cursor, so a reader can see which variable they are editing without the
 * block growing any chrome of its own.
 */
function ModelBlock({ children }: { children: React.ReactNode }) {
  return (
    <Card className="modelo-block bg-card focus-within:border-ring my-1.5 w-full flex-row items-center gap-2 rounded-lg px-4 py-2 shadow-none transition-colors duration-150 ease-out">
      {children}
    </Card>
  );
}

/** The right end of a block's one line, where the value sits. */
function BlockEnd({ children }: { children: React.ReactNode }) {
  return (
    <div className="ml-auto flex shrink-0 items-center gap-2 pl-2">
      {children}
    </div>
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
        <Input
          aria-label={block.props.name}
          className="h-7 max-w-44 text-[13px]"
          max={block.props.max}
          min={block.props.min}
          onChange={(e) =>
            updateProps(editor, block, { value: Number(e.target.value) })
          }
          // A number input takes any value; only a slider steps.
          step="any"
          type="number"
          value={block.props.value}
        />
        <BlockEnd>
          <Value fallback={block.props.value} varId={block.props.varId} />
        </BlockEnd>
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
        <Slider
          aria-label={block.props.name}
          className="min-w-24"
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
          <Select
            items={items}
            onValueChange={(next) =>
              updateProps(editor, block, { value: Number(next) })
            }
            value={String(block.props.value)}
          >
            <SelectTrigger
              aria-label={block.props.name}
              className="h-7 w-44 text-[13px]"
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
      </ModelBlock>
    ),
  }
);

/** The `=` sign that separates the name, the formula, and the result. */
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
        <Equals />
        <Input
          aria-label={`${block.props.name} expression`}
          className="field-sizing-content h-7 max-w-full min-w-32 text-[13px] tabular-nums"
          onChange={(e) =>
            updateProps(editor, block, { formula: e.target.value })
          }
          value={block.props.formula}
        />
        <BlockEnd>
          <Equals />
          <Value varId={block.props.varId} />
        </BlockEnd>
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
