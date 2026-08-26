import { describe, expect, it } from "vitest";
import { loadWorkspace, saveWorkspace, seededWorkspace, STORAGE_KEY } from "../src/workspace";

describe("workspace persistence", () => {
  it("copies three seeds only on first run", () => {
    const storage = { getItem: () => null } as Pick<Storage, "getItem">;
    const workspace = loadWorkspace(storage);
    expect(workspace.notebooks).toHaveLength(3);
    expect(workspace.notebooks.map((n) => n.id)).toContain("sales-ae-comp-plan");
  });

  it("reloads latest save without resurrecting a deleted seed", () => {
    let value: string | null = null;
    const storage = { getItem: (key: string) => key === STORAGE_KEY ? value : null, setItem: (_key: string, next: string) => { value = next; } } as Pick<Storage, "getItem"|"setItem">;
    const edited = seededWorkspace();
    edited.notebooks = edited.notebooks.filter((n) => n.id !== "founders-runway-plan");
    edited.notebooks[0].title = "My changed model";
    saveWorkspace(edited, storage);
    const restored = loadWorkspace(storage);
    expect(restored.notebooks).toHaveLength(2);
    expect(restored.notebooks[0].title).toBe("My changed model");
    expect(restored.notebooks.some((n) => n.id === "founders-runway-plan")).toBe(false);
  });
});
