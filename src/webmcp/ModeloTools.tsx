import { useWebMCP } from "use-webmcp-tool";

import { toInputSchema } from "./schemas";
import { runTool, TOOLS } from "./tools";
import type { ToolDefinition, ToolRuntime } from "./tools";

/**
 * Registers every row of the tool table with WebMCP.
 *
 * One `<RegisteredTool>` per row keeps each `useWebMCP` call at the top level
 * of its own component, which is what React requires, while the table stays
 * the single description of what a tool is.
 */

/** JSON Schema is computed once per tool so registration does not churn. */
const INPUT_SCHEMAS = new Map(
  TOOLS.map((definition) => [definition.name, toInputSchema(definition.schema)])
);
const READ_ONLY = { readOnlyHint: true } as const;

function RegisteredTool({
  definition,
  runtime,
  enabled,
}: {
  definition: ToolDefinition;
  runtime: ToolRuntime;
  enabled: boolean;
}) {
  useWebMCP<unknown>({
    annotations: definition.readOnly ? READ_ONLY : undefined,
    description: definition.description,
    enabled,
    execute: (args) => runTool(runtime, definition, args),
    inputSchema: INPUT_SCHEMAS.get(definition.name),
    name: definition.name,
  });
  return null;
}

/**
 * Renders nothing. Registers the workspace tools always, and the notebook
 * tools while a notebook is open.
 */
export function ModeloTools({
  runtime,
  notebookOpen,
}: {
  runtime: ToolRuntime;
  notebookOpen: boolean;
}) {
  return (
    <>
      {TOOLS.map((definition) => (
        <RegisteredTool
          definition={definition}
          enabled={definition.scope === "workspace" || notebookOpen}
          key={definition.name}
          runtime={runtime}
        />
      ))}
    </>
  );
}
