import { useCallback, useEffect, useState } from "react";
import { useWebMCP } from "use-webmcp-tool";
import type { WebMCPState } from "use-webmcp-tool";

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

export interface ModeloToolsState {
  supported: boolean;
  registered: boolean;
  errors: Error[];
  tools: Record<string, WebMCPState>;
}

export const EMPTY_TOOLS_STATE: ModeloToolsState = {
  errors: [],
  registered: false,
  supported: false,
  tools: {},
};

/** Folds per-tool states into one. Only tools that should be registered count. */
export function aggregateToolState(
  states: Record<string, WebMCPState>,
  enabled: (definition: ToolDefinition) => boolean
): ModeloToolsState {
  const entries = TOOLS.map((definition) => ({
    definition,
    state: states[definition.name],
  }));
  const present = entries.flatMap(({ state }) => (state ? [state] : []));
  const expected = entries.filter(({ definition }) => enabled(definition));
  return {
    errors: present.flatMap((state) => (state.error ? [state.error] : [])),
    registered:
      expected.length > 0 &&
      expected.every(({ state }) => state?.registered === true),
    supported: present.some((state) => state.supported),
    tools: states,
  };
}

function RegisteredTool({
  definition,
  runtime,
  enabled,
  onState,
}: {
  definition: ToolDefinition;
  runtime: ToolRuntime;
  enabled: boolean;
  onState: (name: string, state: WebMCPState) => void;
}) {
  const state = useWebMCP<unknown>({
    annotations: definition.readOnly ? READ_ONLY : undefined,
    description: definition.description,
    enabled,
    execute: (args) => runTool(runtime, definition, args),
    inputSchema: INPUT_SCHEMAS.get(definition.name),
    name: definition.name,
  });
  const { supported, registered, error } = state;
  useEffect(() => {
    onState(definition.name, { error, registered, supported });
  }, [definition.name, error, onState, registered, supported]);
  return null;
}

/**
 * Renders nothing. Registers the workspace tools always and the notebook
 * tools while a notebook is open, and reports the combined state upward.
 */
export function ModeloTools({
  runtime,
  notebookOpen,
  onChange,
}: {
  runtime: ToolRuntime;
  notebookOpen: boolean;
  onChange: (state: ModeloToolsState) => void;
}) {
  const [states, setStates] = useState<Record<string, WebMCPState>>({});
  const report = useCallback((name: string, state: WebMCPState) => {
    setStates((previous) => {
      const current = previous[name];
      const same =
        current &&
        current.supported === state.supported &&
        current.registered === state.registered &&
        current.error === state.error;
      return same ? previous : { ...previous, [name]: state };
    });
  }, []);
  const isEnabled = useCallback(
    (definition: ToolDefinition) =>
      definition.scope === "workspace" || notebookOpen,
    [notebookOpen]
  );
  useEffect(() => {
    onChange(aggregateToolState(states, isEnabled));
  }, [isEnabled, onChange, states]);

  return (
    <>
      {TOOLS.map((definition) => (
        <RegisteredTool
          definition={definition}
          enabled={isEnabled(definition)}
          key={definition.name}
          onState={report}
          runtime={runtime}
        />
      ))}
    </>
  );
}
