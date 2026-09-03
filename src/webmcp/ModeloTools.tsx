import { BotIcon } from "lucide-react";
import { toast } from "sonner";
import { useWebMCP } from "use-webmcp-tool";

import { revealBlocks } from "../editor-dom";
import type { MutationReport } from "../engine/notebook";
import { inspectDocument } from "../engine/projector";
import { toInputSchema } from "./schemas";
import { runTool, TOOLS } from "./tools";
import type { ToolDefinition, ToolResult, ToolRuntime } from "./tools";

const INPUT_SCHEMAS = new Map(
  TOOLS.map((definition) => [definition.name, toInputSchema(definition.schema)])
);
const READ_ONLY = { readOnlyHint: true } as const;
const AGENT_ICON = <BotIcon className="size-4" />;
const CHANGES_SHOWN = 2;

function touchedBlockIds(
  runtime: ToolRuntime,
  report: Partial<MutationReport> & { insertedBlockIds?: string[] }
): string[] {
  const editor = runtime.editor();
  if (!editor) {
    return [];
  }
  const { byId, idByName } = inspectDocument(editor.document);
  const ids = new Set(report.insertedBlockIds);
  for (const name of Object.keys(report.changed ?? {})) {
    const variable = byId[idByName[name]];
    if (variable) {
      ids.add(variable.blockId);
    }
  }
  return [...ids];
}

function announce(
  definition: ToolDefinition,
  runtime: ToolRuntime,
  result: ToolResult
): void {
  if (!result.ok) {
    toast.error(result.error.message, { icon: AGENT_ICON });
    return;
  }
  const report = result.data as Partial<MutationReport> & {
    dry_run?: boolean;
    insertedBlockIds?: string[];
  };
  if (definition.readOnly || report.dry_run) {
    return;
  }
  const changes = Object.entries(report.changed ?? {});
  const shown = changes
    .slice(0, CHANGES_SHOWN)
    .map(([name, value]) => `${name} ${value}`);
  if (changes.length > CHANGES_SHOWN) {
    shown.push(`+${changes.length - CHANGES_SHOWN}`);
  }
  toast(definition.name.replaceAll("_", " "), {
    description: shown.length ? shown.join(" · ") : undefined,
    icon: AGENT_ICON,
  });
  revealBlocks(touchedBlockIds(runtime, report));
}

function RegisteredTool({
  definition,
  runtime,
}: {
  definition: ToolDefinition;
  runtime: ToolRuntime;
}) {
  useWebMCP<unknown>({
    annotations: definition.readOnly ? READ_ONLY : undefined,
    description: definition.description,
    execute: async (args) => {
      const result = await runTool(runtime, definition, args);
      announce(definition, runtime, result);
      return result;
    },
    inputSchema: INPUT_SCHEMAS.get(definition.name),
    name: definition.name,
  });
  return null;
}

/** Renders nothing. Registers every tool for as long as the app is mounted. */
export function ModeloTools({ runtime }: { runtime: ToolRuntime }) {
  return (
    <>
      {TOOLS.map((definition) => (
        <RegisteredTool
          definition={definition}
          key={definition.name}
          runtime={runtime}
        />
      ))}
    </>
  );
}
