import { createContext, useContext } from "react";
import { BlockNoteSchema, defaultBlockSpecs, defaultInlineContentSpecs } from "@blocknote/core";
import { createReactBlockSpec, createReactInlineContentSpec } from "@blocknote/react";
import type { EvaluationResult } from "./model";
import { renameVariable } from "./engine/rename";
import { CURRENCIES, UNIT_GROUPS, UNITS } from "./engine/units";

const ModelContext = createContext<EvaluationResult | null>(null);
export const ModelProvider = ModelContext.Provider;

type SelectOption = { label: string; value: number };
type ModelKind = "number" | "slider" | "select" | "boolean" | "formula";

const sharedProps = {
  varId: { default: "" },
  name: { default: "variable" },
  label: { default: "Variable" },
  value: { default: 0 },
  format: { default: "number" },
  currency: { default: "EUR" },
  unit: { default: "" },
  locale: { default: "" },
  decimals: { default: -1 },
};

export function parseSelectOptions(value: string): SelectOption[] {
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((option): option is SelectOption => option && typeof option.label === "string" && typeof option.value === "number" && Number.isFinite(option.value));
  } catch {
    return [];
  }
}

export function clampSliderValue(value: number, min: number, max: number): number {
  const low = Math.min(min, max);
  const high = Math.max(min, max);
  return Math.min(high, Math.max(low, value));
}

function updateProps(editor: any, block: any, props: Record<string, unknown>) {
  editor.transact(() => editor.updateBlock(block, { props }));
}

function Value({ varId, fallback, boolean = false }: { varId: string; fallback?: number; boolean?: boolean }) {
  const model = useContext(ModelContext);
  const variable = model?.byId[varId];
  const rendered = boolean && variable?.status === "ok"
    ? (variable.value ? "Yes" : "No")
    : variable?.formatted ?? (boolean ? (fallback ? "Yes" : "No") : (fallback ?? "missing"));
  return <span className="model-value">{rendered}</span>;
}

function VariableName({ block, editor }: any) {
  return <input className="variable-name" aria-label="Variable name" defaultValue={block.props.name} onBlur={(event) => {
    const nextName = event.currentTarget.value.trim();
    if (!nextName || nextName === block.props.name) return;
    try {
      const renamed = renameVariable(editor.document as any, block.props.varId, nextName);
      editor.transact(() => editor.replaceBlocks(editor.document as any, renamed as any));
    } catch (error) {
      event.currentTarget.value = block.props.name;
      window.alert(error instanceof Error ? error.message : "Could not rename variable");
    }
  }}/>;
}

function LabelField({ block, editor }: any) {
  return <label>Label<input aria-label="Label" value={block.props.label} onChange={(event) => updateProps(editor, block, { label: event.currentTarget.value })}/></label>;
}

function FormatFields({ block, editor, includeStep = false }: any) {
  const set = (props: Record<string, unknown>) => updateProps(editor, block, props);
  const unknownCurrency = block.props.currency && !CURRENCIES.includes(block.props.currency as typeof CURRENCIES[number]);
  const unknownUnit = block.props.unit && !UNITS.includes(block.props.unit);
  return <div className="config-row">
    <LabelField block={block} editor={editor}/>
    <label>Format<select aria-label="Format" value={block.props.format} onChange={(event) => set({ format: event.currentTarget.value })}>
      <option value="number">Number</option><option value="currency">Currency</option><option value="percent">Percent</option><option value="unit">Unit</option>
    </select></label>
    {block.props.format === "currency" && <label>Currency<select aria-label="Currency code" value={block.props.currency} onChange={(event) => set({ currency: event.currentTarget.value })}>
      {unknownCurrency && <option value={block.props.currency}>{block.props.currency}</option>}
      {CURRENCIES.map((currency) => <option key={currency} value={currency}>{currency}</option>)}
    </select></label>}
    {block.props.format === "unit" && <label>Unit<select aria-label="Unit" value={block.props.unit} onChange={(event) => set({ unit: event.currentTarget.value })}>
      {unknownUnit && <option value={block.props.unit}>{block.props.unit}</option>}
      {UNIT_GROUPS.map((group) => <optgroup key={group.label} label={group.label}>{group.units.map((unit) => <option key={unit} value={unit}>{unit}</option>)}</optgroup>)}
    </select></label>}
    <label>Decimals<input aria-label="Decimals" type="number" min="0" max="8" placeholder="Auto" value={block.props.decimals < 0 ? "" : block.props.decimals} onChange={(event) => {
      const raw = event.currentTarget.value;
      set({ decimals: raw === "" ? -1 : Math.max(0, Math.min(8, Math.round(Number(raw)))) });
    }}/></label>
    {includeStep && <label>Step<input aria-label="Number step" type="number" value={block.props.step} onChange={(event) => set({ step: Number(event.currentTarget.value) })}/></label>}
  </div>;
}

function SliderFields({ block, editor }: any) {
  const setBound = (key: "min" | "max" | "step", raw: string) => {
    const next = Number(raw);
    if (!Number.isFinite(next)) return;
    if (key === "step") updateProps(editor, block, { step: next });
    else {
      const min = key === "min" ? Math.min(next, block.props.max) : block.props.min;
      const max = key === "max" ? Math.max(next, block.props.min) : block.props.max;
      updateProps(editor, block, { min, max, value: clampSliderValue(block.props.value, min, max) });
    }
  };
  return <div className="config-row slider-config">
    <label>Min<input aria-label="Slider minimum" type="number" value={block.props.min} onChange={(event) => setBound("min", event.currentTarget.value)}/></label>
    <label>Max<input aria-label="Slider maximum" type="number" value={block.props.max} onChange={(event) => setBound("max", event.currentTarget.value)}/></label>
    <label>Step<input aria-label="Slider step" type="number" value={block.props.step} onChange={(event) => setBound("step", event.currentTarget.value)}/></label>
  </div>;
}

function SelectOptions({ block, editor }: any) {
  const options = parseSelectOptions(block.props.options);
  const save = (next: SelectOption[]) => {
    const safe = next.length ? next : [{ label: "Option", value: 0 }];
    const value = safe.some((option) => option.value === block.props.value) ? block.props.value : safe[0].value;
    updateProps(editor, block, { options: JSON.stringify(safe), value });
  };
  const edit = (index: number, patch: Partial<SelectOption>) => save(options.map((option, optionIndex) => optionIndex === index ? { ...option, ...patch } : option));
  return <div className="select-options" aria-label="Select options">
    {options.map((option, index) => <div className="option-row" key={index}>
      <input aria-label={`Option ${index + 1} label`} value={option.label} onChange={(event) => edit(index, { label: event.currentTarget.value })}/>
      <input aria-label={`Option ${index + 1} value`} type="number" value={option.value} onChange={(event) => edit(index, { value: Number(event.currentTarget.value) })}/>
      <button type="button" aria-label={`Remove option ${index + 1}`} disabled={options.length <= 1} onClick={() => save(options.filter((_, optionIndex) => optionIndex !== index))}>×</button>
    </div>)}
    <button type="button" className="add-option" onClick={() => save([...options, { label: `Option ${options.length + 1}`, value: options.length }])}>+ Add option</button>
  </div>;
}

const NumberBlock = createReactBlockSpec(
  { type: "number", propSchema: { ...sharedProps, min: { default: undefined, type: "number" }, max: { default: undefined, type: "number" }, step: { default: 1 } }, content: "none" },
  { render: ({ block, editor }) => <div className="model-block"><div className="model-meta"><strong>{block.props.label}</strong><VariableName block={block} editor={editor}/></div><div className="number-row"><input aria-label={block.props.label} type="number" value={block.props.value} min={block.props.min} max={block.props.max} step={block.props.step} onChange={(e) => updateProps(editor, block, { value: Number(e.target.value) })}/><Value varId={block.props.varId} fallback={block.props.value}/></div><FormatFields block={block} editor={editor} includeStep/></div> }
);

const SliderBlock = createReactBlockSpec(
  { type: "slider", propSchema: { ...sharedProps, min: { default: 0 }, max: { default: 100 }, step: { default: 1 } }, content: "none" },
  { render: ({ block, editor }) => <div className="model-block"><div className="model-meta"><strong>{block.props.label}</strong><VariableName block={block} editor={editor}/></div><div className="slider-row"><input aria-label={block.props.label} type="range" min={block.props.min} max={block.props.max} step={block.props.step} value={clampSliderValue(block.props.value, block.props.min, block.props.max)} onChange={(e) => updateProps(editor, block, { value: Number(e.target.value) })}/><Value varId={block.props.varId} fallback={block.props.value}/></div><FormatFields block={block} editor={editor}/><SliderFields block={block} editor={editor}/></div> }
);

const SelectBlock = createReactBlockSpec(
  { type: "select", propSchema: { ...sharedProps, options: { default: "[{\"label\":\"No\",\"value\":0},{\"label\":\"Yes\",\"value\":1}]" } }, content: "none" },
  { render: ({ block, editor }) => {
    const options = parseSelectOptions(block.props.options);
    return <div className="model-block"><div className="model-meta"><strong>{block.props.label}</strong><VariableName block={block} editor={editor}/></div><div className="number-row"><select aria-label={block.props.label} value={block.props.value} onChange={(e) => updateProps(editor, block, { value: Number(e.target.value) })}>{options.map((option, index) => <option key={`${index}-${option.value}`} value={option.value}>{option.label}</option>)}</select><Value varId={block.props.varId} fallback={block.props.value}/></div><LabelField block={block} editor={editor}/><SelectOptions block={block} editor={editor}/></div>;
  }}
);

const BooleanBlock = createReactBlockSpec(
  { type: "boolean", propSchema: sharedProps, content: "none" },
  { render: ({ block, editor }) => <div className="model-block boolean-block"><div className="model-meta"><strong>{block.props.label}</strong><VariableName block={block} editor={editor}/></div><div className="boolean-row"><button type="button" role="switch" aria-checked={Boolean(block.props.value)} aria-label={block.props.label} className={`toggle ${block.props.value ? "on" : ""}`} onClick={() => updateProps(editor, block, { value: block.props.value ? 0 : 1 })}><span/></button><Value varId={block.props.varId} fallback={block.props.value} boolean/></div><div className="config-row"><LabelField block={block} editor={editor}/></div></div> }
);

const FormulaBlock = createReactBlockSpec(
  { type: "formula", propSchema: { varId: { default: "" }, name: { default: "result" }, label: { default: "Formula" }, formula: { default: "1 + 1" } }, content: "none" },
  { render: ({ block, editor }) => <div className="model-block formula-block"><div className="model-meta"><strong>{block.props.label}</strong><VariableName block={block} editor={editor}/></div><input className="formula-input" aria-label={`${block.props.label} expression`} value={block.props.formula} onChange={(e) => updateProps(editor, block, { formula: e.target.value })}/><Value varId={block.props.varId}/><div className="config-row"><LabelField block={block} editor={editor}/></div></div> }
);

const VariableRef = createReactInlineContentSpec(
  { type: "variableRef", propSchema: { varId: { default: "" }, label: { default: "" } }, content: "none" },
  { render: ({ inlineContent }) => {
    const model = useContext(ModelContext);
    const variable = model?.byId[inlineContent.props.varId];
    return <span className={`variable-chip ${variable?.status ?? "missing"}`} title={inlineContent.props.label || variable?.name || "Missing variable"}>{variable?.formatted ?? "missing"}</span>;
  }}
);

export const modeloSchema = BlockNoteSchema.create({
  blockSpecs: { ...defaultBlockSpecs, number: NumberBlock(), slider: SliderBlock(), select: SelectBlock(), boolean: BooleanBlock(), formula: FormulaBlock() },
  inlineContentSpecs: { ...defaultInlineContentSpecs, variableRef: VariableRef },
});
export type ModeloEditor = typeof modeloSchema.BlockNoteEditor;

export function newVariableProps(kind: ModelKind) {
  const id = crypto.randomUUID();
  const base = { varId: id, name: `variable_${id.slice(0, 4)}`, label: kind === "boolean" ? "Toggle" : kind[0].toUpperCase() + kind.slice(1) };
  if (kind === "slider") return { ...base, value: 50, min: 0, max: 100, step: 1 };
  if (kind === "select") return { ...base, value: 0, options: '[{"label":"No","value":0},{"label":"Yes","value":1}]' };
  if (kind === "boolean") return { ...base, value: 0 };
  if (kind === "formula") return { ...base, name: `result_${id.slice(0, 4)}`, formula: "1 + 1" };
  return { ...base, value: 0, step: 1 };
}
