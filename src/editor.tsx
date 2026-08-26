import { createContext, useContext } from "react";
import { BlockNoteSchema, defaultBlockSpecs, defaultInlineContentSpecs } from "@blocknote/core";
import { createReactBlockSpec, createReactInlineContentSpec } from "@blocknote/react";
import type { EvaluationResult } from "./model";
import { renameVariable } from "./engine/rename";

const ModelContext = createContext<EvaluationResult | null>(null);
export const ModelProvider = ModelContext.Provider;

const sharedProps = {
  varId: { default: "" },
  name: { default: "variable" },
  label: { default: "Variable" },
  value: { default: 0 },
  format: { default: "number" },
  currency: { default: "EUR" },
  unit: { default: "" },
};

function Value({ varId, fallback }: { varId: string; fallback?: number }) {
  const model = useContext(ModelContext);
  return <span className="model-value">{model?.byId[varId]?.formatted ?? (fallback ?? "missing")}</span>;
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

const NumberBlock = createReactBlockSpec(
  { type: "number", propSchema: { ...sharedProps, step: { default: 1 } }, content: "none" },
  { render: ({ block, editor }) => <div className="model-block"><div className="model-meta"><strong>{block.props.label}</strong><VariableName block={block} editor={editor}/></div><div className="number-row"><input aria-label={block.props.label} type="number" value={block.props.value} step={block.props.step} onChange={(e) => editor.transact(() => editor.updateBlock(block, { props: { value: Number(e.target.value) } }))}/><Value varId={block.props.varId} fallback={block.props.value}/></div></div> }
);

const SliderBlock = createReactBlockSpec(
  { type: "slider", propSchema: { ...sharedProps, min: { default: 0 }, max: { default: 100 }, step: { default: 1 } }, content: "none" },
  { render: ({ block, editor }) => <div className="model-block"><div className="model-meta"><strong>{block.props.label}</strong><VariableName block={block} editor={editor}/></div><div className="slider-row"><input aria-label={block.props.label} type="range" min={block.props.min} max={block.props.max} step={block.props.step} value={block.props.value} onChange={(e) => editor.transact(() => editor.updateBlock(block, { props: { value: Number(e.target.value) } }))}/><Value varId={block.props.varId} fallback={block.props.value}/></div><small>{block.props.min} – {block.props.max}, step {block.props.step}</small></div> }
);

const SelectBlock = createReactBlockSpec(
  { type: "select", propSchema: { ...sharedProps, options: { default: "[{\"label\":\"No\",\"value\":0},{\"label\":\"Yes\",\"value\":1}]" } }, content: "none" },
  { render: ({ block, editor }) => {
    let options: Array<{label:string;value:number}> = [];
    try { options = JSON.parse(block.props.options); } catch { options = []; }
    return <div className="model-block"><div className="model-meta"><strong>{block.props.label}</strong><VariableName block={block} editor={editor}/></div><div className="number-row"><select aria-label={block.props.label} value={block.props.value} onChange={(e) => editor.transact(() => editor.updateBlock(block, { props: { value: Number(e.target.value) } }))}>{options.map((option) => <option key={`${option.label}-${option.value}`} value={option.value}>{option.label}</option>)}</select><Value varId={block.props.varId} fallback={block.props.value}/></div></div>;
  }}
);

const FormulaBlock = createReactBlockSpec(
  { type: "formula", propSchema: { varId: { default: "" }, name: { default: "result" }, label: { default: "Formula" }, formula: { default: "1 + 1" }, format: { default: "number" }, currency: { default: "EUR" }, unit: { default: "" } }, content: "none" },
  { render: ({ block, editor }) => <div className="model-block formula-block"><div className="model-meta"><strong>{block.props.label}</strong><VariableName block={block} editor={editor}/></div><input className="formula-input" aria-label={`${block.props.label} expression`} value={block.props.formula} onChange={(e) => editor.transact(() => editor.updateBlock(block, { props: { formula: e.target.value } }))}/><Value varId={block.props.varId}/></div> }
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
  blockSpecs: { ...defaultBlockSpecs, number: NumberBlock(), slider: SliderBlock(), select: SelectBlock(), formula: FormulaBlock() },
  inlineContentSpecs: { ...defaultInlineContentSpecs, variableRef: VariableRef },
});
export type ModeloEditor = typeof modeloSchema.BlockNoteEditor;

export function newVariableProps(kind: "number"|"slider"|"select"|"formula") {
  const id = crypto.randomUUID();
  const base = { varId: id, name: `variable_${id.slice(0, 4)}`, label: kind[0].toUpperCase() + kind.slice(1) };
  if (kind === "slider") return { ...base, value: 50, min: 0, max: 100, step: 1 };
  if (kind === "select") return { ...base, value: 0, options: '[{"label":"No","value":0},{"label":"Yes","value":1}]' };
  if (kind === "formula") return { ...base, name: `result_${id.slice(0, 4)}`, formula: "1 + 1" };
  return { ...base, value: 0, step: 1 };
}
