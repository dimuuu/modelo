import { describe, expect, it } from "vitest";

import { describeNotebook, diffNotebooks } from "../src/engine/notebook";
import { inspectDocument, projectDocument } from "../src/engine/projector";
import type { ModeloDocument } from "../src/model";

const document: ModeloDocument = [
  { id: "a1", props: { name: "a", value: 2, varId: "a1-id" }, type: "number" },
  { id: "a2", props: { name: "a", value: 3, varId: "a2-id" }, type: "number" },
  {
    id: "f",
    props: { formula: "a * 10", name: "f", varId: "f-id" },
    type: "formula",
  },
  {
    id: "bad",
    props: { name: "9bad", value: 1, varId: "bad-id" },
    type: "number",
  },
];

describe("a notebook with an invalid block", () => {
  it("marks that block as an issue and evaluates everything else", () => {
    const { projected, evaluated } = describeNotebook(document, {
      locale: "en-US",
    });
    expect(projected.issues.map((issue) => issue.blockId)).toEqual([
      "a2",
      "bad",
    ]);
    expect(evaluated.byId["a1-id"]).toMatchObject({ status: "ok", value: 2 });
    expect(evaluated.byId["f-id"]).toMatchObject({ status: "ok", value: 20 });
    expect(evaluated.byId["a2-id"]).toMatchObject({
      error: "Variable name already exists: a",
      status: "error",
    });
    expect(evaluated.byId["bad-id"].status).toBe("error");
  });

  it("keeps the strict projection for callers that need a clean model", () => {
    expect(() => projectDocument(document)).toThrow(/already exists: a/u);
    expect(inspectDocument(document).issues).toHaveLength(2);
  });
});

describe("diffNotebooks", () => {
  it("reports only the variables whose value changed, plus the errors that remain", () => {
    const before = describeNotebook(document.slice(0, 3), { locale: "en-US" });
    const after = describeNotebook(
      [
        { ...document[0], props: { ...document[0].props, value: 5 } },
        document[2],
      ],
      { locale: "en-US" }
    );
    const report = diffNotebooks(before, after);
    expect(report.changed).toEqual({ a: "5", f: "50" });
    expect(report.errors).toEqual([]);
    expect(report.composition.variables).toBe(2);
  });
});
