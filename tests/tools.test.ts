import { describe, expect, it } from "vitest";

import { toEditorBlocks } from "../src/engine/portable";
import { titleBlock } from "../src/engine/title";
import type { ModeloDocument } from "../src/model";
import { createMemoryPort } from "../src/notebook/port";
import { toInputSchema } from "../src/webmcp/schemas";
import { findTool, runTool, TOOLS } from "../src/webmcp/tools";
import type { ToolRuntime } from "../src/webmcp/tools";
import { notebookTitle } from "../src/workspace";
import type { Workspace } from "../src/workspace";

function harness(
  blocks: ModeloDocument,
  scenarios: Workspace["notebooks"][number]["scenarios"] = []
) {
  let workspace: Workspace = {
    currency: "EUR",
    locale: "en-US",
    notebooks: [
      {
        blocks: [titleBlock("Test")],
        id: "nb",
        scenarios,
        updatedAt: "",
      },
    ],
    version: 1,
  };
  let openId: string | null = "nb";
  let counter = 0;
  const makeId = () => `id-${(counter += 1)}`;
  const port = createMemoryPort(blocks, makeId);
  const runtime: ToolRuntime = {
    editor: () => (openId ? port : null),
    makeId,
    workspace: {
      current: () => workspace,
      open: (id) => {
        openId = id;
      },
      openId: () => openId,
      update: (change) => {
        workspace = change(workspace);
        return workspace;
      },
    },
  };
  const call = (name: string, args: unknown = {}) =>
    runTool(runtime, findTool(name), args);
  return {
    call,
    get openId() {
      return openId;
    },
    port,
    runtime,
    get workspace() {
      return workspace;
    },
  };
}

const price = {
  id: "price",
  props: {
    currency: "EUR",
    format: "currency",
    name: "price",
    value: 10,
    varId: "price-id",
  },
  type: "number",
};
const doubled = {
  id: "doubled",
  props: { formula: "price * 2", name: "doubled", varId: "doubled-id" },
  type: "formula",
};
const paragraph = {
  content: [{ styles: {}, text: "Price: today.", type: "text" }],
  id: "p",
  type: "paragraph",
};
const blank: ModeloDocument = [{ content: [], id: "blank", type: "paragraph" }];

interface ToolData {
  changed: Record<string, string>;
  errors: { name: string; status: string; error?: string }[];
  insertedBlockIds?: string[];
  warnings?: string[];
  dry_run?: boolean;
  [key: string]: unknown;
}
type Result = Awaited<ReturnType<typeof runTool>>;

const data = (result: Result): ToolData => (result as { data: ToolData }).data;
const failure = (result: Result) =>
  (result as { error: { code: string; details?: unknown } }).error;
const props = (block: unknown) =>
  (block as { props: Record<string, unknown> }).props;
const content = (block: unknown) =>
  (block as { content: { type: string; text?: string }[] }).content;

describe("the tool table", () => {
  it("gives every tool a unique name and a publishable JSON schema", () => {
    const names = TOOLS.map((tool) => tool.name);
    expect(new Set(names).size).toBe(names.length);
    for (const tool of TOOLS) {
      const schema = toInputSchema(tool.schema) as {
        type?: string;
        anyOf?: unknown[];
      };
      expect(schema.type === "object" || Array.isArray(schema.anyOf)).toBe(
        true
      );
    }
  });

  it("refuses document tools while no notebook is open", async () => {
    const h = harness([price]);
    h.runtime.workspace.open(null);
    expect(failure(await h.call("get_model")).code).toBe("NO_NOTEBOOK_OPEN");
    expect(data(await h.call("list_notebooks")).openNotebookId).toBeNull();
  });

  it("rejects arguments that do not match the schema, naming the path", async () => {
    const h = harness([price]);
    const result = await h.call("set_variable", { name: "price" });
    expect(failure(result).code).toBe("INVALID_ARGUMENTS");
    const [issue] = failure(result).details as { path: string }[];
    expect(issue.path).toBe("value");
  });
});

describe("writing sections", () => {
  const section = {
    body: "Revenue is @revenue and doubled it is @double.",
    formulas: [{ formula: "revenue * 2", name: "double" }],
    heading: "Unit economics",
    inputs: [{ currency: "EUR", kind: "number", name: "revenue", value: 10 }],
  };

  it("replaces the blank first paragraph and reports the evaluated result", async () => {
    const h = harness(blank);
    const result = data(await h.call("write_section", section));
    expect(result.changed).toMatchObject({ double: "€20", revenue: "€10" });
    expect(result.errors).toEqual([]);
    expect(result.insertedBlockIds).toHaveLength(4);
    expect(h.port.document.map((block) => block.type)).toEqual([
      "heading",
      "paragraph",
      "number",
      "formula",
    ]);
    expect(
      content(h.port.document[1]).filter((node) => node.type === "variableRef")
    ).toHaveLength(2);
  });

  it("previews with dry_run and leaves the document untouched", async () => {
    const h = harness(blank);
    const result = data(
      await h.call("write_section", { ...section, dry_run: true })
    );
    expect(result.dry_run).toBe(true);
    expect(result.changed.double).toBe("€20");
    expect(h.port.document).toHaveLength(1);
    expect(h.port.document[0].type).toBe("paragraph");
  });

  it("refuses a name the notebook already has", async () => {
    const h = harness([price]);
    const result = await h.call("write_section", {
      ...section,
      inputs: [{ kind: "number", name: "price", value: 1 }],
    });
    expect(failure(result).code).toBe("DUPLICATE_VARIABLE_NAME");
  });

  it("keeps two appended sections in call order", async () => {
    const h = harness([price]);
    await h.call("write_sections", {
      sections: [
        { body: "First.", heading: "A" },
        { body: "Second.", heading: "B" },
      ],
    });
    const headings = h.port.document
      .filter((block) => block.type === "heading")
      .map((block) => content(block)[0].text);
    expect(headings).toEqual(["A", "B"]);
  });
});

describe("the title block", () => {
  const titleHeading = toEditorBlocks([titleBlock("Runway")]) as ModeloDocument;
  const reportedTitle = (result: Result) =>
    (data(result).notebook as { title: string }).title;

  it("reports the document heading as the notebook title", async () => {
    const h = harness([...titleHeading, price]);
    expect(reportedTitle(await h.call("get_document"))).toBe("Runway");
  });

  it("refuses to remove it", async () => {
    const h = harness([...titleHeading, price]);
    const result = await h.call("remove_blocks", {
      ids: [h.port.document[0].id],
    });
    expect(failure(result).code).toBe("TITLE_BLOCK");
    expect(h.port.document).toHaveLength(2);
  });

  it("refuses to demote it below level 1", async () => {
    const h = harness([...titleHeading, price]);
    const [title] = h.port.document;
    const { id } = title;
    expect(failure(await h.call("update_block", { id, level: 2 })).code).toBe(
      "TITLE_BLOCK"
    );
    await h.call("update_block", { id, text: "Runway v2" });
    expect(reportedTitle(await h.call("get_document"))).toBe("Runway v2");
  });

  it("refuses to insert anything above it", async () => {
    const h = harness([...titleHeading, price]);
    const result = await h.call("write_section", {
      body: "Anything.",
      heading: "Above",
      placement: "before",
      referenceBlockId: h.port.document[0].id,
    });
    expect(failure(result).code).toBe("TITLE_BLOCK");
  });
});

describe("prose tools", () => {
  it("inserts an inline reference at the requested offset", async () => {
    const h = harness([price, paragraph]);
    const result = data(
      await h.call("insert_inline_ref", {
        blockId: "p",
        offset: 7,
        variable: "price",
      })
    );
    expect(result.varId).toBe("price-id");
    expect(content(h.port.getBlock("p"))).toEqual([
      { styles: {}, text: "Price: ", type: "text" },
      { props: { name: "price", varId: "price-id" }, type: "variableRef" },
      { styles: {}, text: "today.", type: "text" },
    ]);
  });

  it("replace_paragraph resolves @names to live references", async () => {
    const h = harness([price, paragraph]);
    await h.call("replace_paragraph", { id: "p", text: "Now @price." });
    expect(content(h.port.getBlock("p"))[1]).toEqual({
      props: { name: "price", varId: "price-id" },
      type: "variableRef",
    });
  });

  it("get_document reports prose as text with its neighbours", async () => {
    const h = harness([price, paragraph]);
    const { blocks } = data(await h.call("get_document")) as unknown as {
      blocks: Record<string, unknown>[];
    };
    expect(blocks[1]).toMatchObject({
      nextId: null,
      previousId: "price",
      text: "Price: today.",
      type: "paragraph",
    });
    expect(blocks[0]).toMatchObject({
      currency: "EUR",
      name: "price",
      value: 10,
    });
  });
});

describe("update_block", () => {
  const slider = {
    id: "growth",
    props: { max: 10, min: 0, name: "growth", value: 5, varId: "growth-id" },
    type: "slider",
  };
  const toggle = {
    id: "hired",
    props: { name: "hired", value: 0, varId: "hired-id" },
    type: "boolean",
  };

  it("applies the field table per block type", async () => {
    const h = harness([slider, toggle, price]);
    expect(
      failure(await h.call("update_block", { format: "currency", id: "hired" }))
        .code
    ).toBe("INVALID_UPDATE");
    expect(
      failure(await h.call("update_block", { id: "growth", min: 20 })).code
    ).toBe("INVALID_VALUE");
    expect(
      failure(await h.call("update_block", { format: "unit", id: "price" }))
        .code
    ).toBe("INVALID_VALUE");
  });

  it("clamps a slider value into its bounds", async () => {
    const h = harness([slider]);
    await h.call("update_block", { id: "growth", value: 50 });
    expect(props(h.port.getBlock("growth")).value).toBe(10);
  });

  it("renames by symbol and rewrites the formulas that used the old name", async () => {
    const h = harness([price, doubled]);
    const result = data(
      await h.call("update_block", { id: "price", name: "cost" })
    );
    expect(result.id).toBe("price");
    expect(props(h.port.getBlock("doubled")).formula).toBe("cost * 2");
    expect(props(h.port.getBlock("price")).name).toBe("cost");
  });

  it("update_blocks fails before touching anything when one update is invalid", async () => {
    const h = harness([price, toggle]);
    const result = await h.call("update_blocks", {
      blocks: [
        { id: "price", value: 99 },
        { format: "currency", id: "hired" },
      ],
    });
    expect(failure(result).code).toBe("INVALID_UPDATE");
    expect(props(h.port.getBlock("price")).value).toBe(10);
  });
});

describe("variables", () => {
  it("remove_variable refuses a referenced input unless forced, then shows missing", async () => {
    const h = harness([price, doubled]);
    const refused = await h.call("remove_variable", { name: "price" });
    expect(failure(refused).code).toBe("VARIABLE_REFERENCED");
    const details = failure(refused).details as { formulas: string[] };
    expect(details.formulas).toEqual(["doubled"]);

    const removed = data(
      await h.call("remove_variable", { force: true, name: "price" })
    );
    expect(removed.removed).toEqual({
      id: "price",
      name: "price",
      varId: "price-id",
    });
    expect(removed.errors).toEqual([
      { error: "Missing variable: price", name: "doubled", status: "missing" },
    ]);
  });

  it("set_variable stores booleans as 0 or 1 and refuses formulas", async () => {
    const h = harness([
      {
        id: "hired",
        props: { name: "hired", value: 0, varId: "hired-id" },
        type: "boolean",
      },
      doubled,
      price,
    ]);
    const result = data(
      await h.call("set_variable", { name: "hired", value: 5 })
    );
    expect(result.value).toBe(1);
    expect(
      failure(await h.call("set_variable", { name: "doubled", value: 1 })).code
    ).toBe("READ_ONLY");
  });
});

describe("scenarios", () => {
  it("save, apply, and delete through the workspace store", async () => {
    const h = harness([price]);
    await h.call("save_scenario", { name: "Base" });
    expect(h.workspace.notebooks[0].scenarios[0]).toMatchObject({
      name: "Base",
      values: { "price-id": 10 },
    });

    await h.call("set_variable", { name: "price", value: 20 });
    expect(data(await h.call("list_scenarios")).active).toBeNull();

    const applied = data(await h.call("apply_scenario", { name: "Base" }));
    expect(applied.changed.price).toBe("€10");
    expect(data(await h.call("list_scenarios")).active).toBe("Base");

    await h.call("delete_scenario", { name: "Base" });
    expect(h.workspace.notebooks[0].scenarios).toEqual([]);
    expect(
      failure(await h.call("delete_scenario", { name: "Base" })).code
    ).toBe("NOT_FOUND");
  });
});

describe("workspace tools", () => {
  it("create, rename, duplicate, open, and delete notebooks", async () => {
    const h = harness([price]);
    const created = data(await h.call("create_notebook", { name: "Plan" }));
    expect(h.openId).toBe(created.id);
    expect(h.workspace.notebooks).toHaveLength(2);

    await h.call("rename_notebook", { id: created.id, name: "Plan B" });
    expect(notebookTitle(h.workspace.notebooks[1])).toBe("Plan B");

    const copy = data(await h.call("duplicate_notebook", { id: "nb" }));
    expect(copy.title).toBe("Test copy");
    expect(h.workspace.notebooks).toHaveLength(3);

    expect(failure(await h.call("open_notebook", { id: "nope" })).code).toBe(
      "NOT_FOUND"
    );
    await h.call("delete_notebook", { id: created.id });
    expect(h.openId).toBeNull();
    expect(h.workspace.notebooks.map((n) => n.id)).not.toContain(created.id);
  });
});
