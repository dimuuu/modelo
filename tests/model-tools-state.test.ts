import { describe, expect, it } from "vitest";

import { aggregateToolState } from "../src/webmcp/ModeloTools";
import { TOOLS } from "../src/webmcp/tools";

const registered = { error: null, registered: true, supported: true };
const idle = { error: null, registered: false, supported: true };

function statesWhere(
  pick: (scope: "workspace" | "notebook") => typeof registered
): Record<string, typeof registered> {
  return Object.fromEntries(TOOLS.map((tool) => [tool.name, pick(tool.scope)]));
}

describe("aggregateToolState", () => {
  it("counts only the tools that should be registered right now", () => {
    const states = statesWhere((scope) =>
      scope === "workspace" ? registered : idle
    );
    const closed = aggregateToolState(
      states,
      (tool) => tool.scope === "workspace"
    );
    expect(closed).toMatchObject({ registered: true, supported: true });

    const open = aggregateToolState(states, () => true);
    expect(open.registered).toBe(false);
  });

  it("collects errors and reports unsupported when nothing registered", () => {
    const failed = new Error("boom");
    const states = {
      list_notebooks: { error: failed, registered: false, supported: false },
    };
    const state = aggregateToolState(
      states,
      (tool) => tool.scope === "workspace"
    );
    expect(state.errors).toEqual([failed]);
    expect(state.supported).toBe(false);
    expect(state.registered).toBe(false);
  });
});
