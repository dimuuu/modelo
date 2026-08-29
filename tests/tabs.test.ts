import { describe, expect, it } from "vitest";

import {
  activateTab,
  closeTab,
  goHome,
  initialTabs,
  newTab,
  openInTab,
  openNotebookId,
  pruneTabs,
} from "../src/tabs";
import type { TabState } from "../src/tabs";

const ids = (state: TabState) => state.tabs.map((tab) => tab.notebookId);

describe("tab strip", () => {
  it("starts on one home tab", () => {
    const state = initialTabs();
    expect(state.tabs).toHaveLength(1);
    expect(openNotebookId(state)).toBeNull();
  });

  it("turns the home tab in front into the notebook", () => {
    const state = openInTab(initialTabs(), "a");
    expect(state.tabs).toHaveLength(1);
    expect(openNotebookId(state)).toBe("a");
  });

  it("opens a second notebook beside the first, not over it", () => {
    const state = openInTab(openInTab(initialTabs(), "a"), "b");
    expect(ids(state)).toEqual(["a", "b"]);
    expect(openNotebookId(state)).toBe("b");
  });

  it("brings an already open notebook forward instead of duplicating it", () => {
    const two = openInTab(openInTab(initialTabs(), "a"), "b");
    const again = openInTab(two, "a");
    expect(ids(again)).toEqual(["a", "b"]);
    expect(openNotebookId(again)).toBe("a");
  });

  it("gives every new tab a home", () => {
    const state = newTab(openInTab(initialTabs(), "a"));
    expect(ids(state)).toEqual(["a", null]);
    expect(openNotebookId(state)).toBeNull();
  });

  it("sends the tab in front home without closing it", () => {
    const state = goHome(openInTab(initialTabs(), "a"));
    expect(ids(state)).toEqual([null]);
  });

  it("activates the neighbour when the tab in front closes", () => {
    const two = openInTab(openInTab(initialTabs(), "a"), "b");
    const closed = closeTab(two, two.tabs[1].id);
    expect(ids(closed)).toEqual(["a"]);
    expect(openNotebookId(closed)).toBe("a");
  });

  it("leaves a home tab when the last tab closes", () => {
    const one = openInTab(initialTabs(), "a");
    const closed = closeTab(one, one.tabs[0].id);
    expect(ids(closed)).toEqual([null]);
  });

  it("keeps the tab in front when another tab closes", () => {
    const two = openInTab(openInTab(initialTabs(), "a"), "b");
    const closed = closeTab(two, two.tabs[0].id);
    expect(openNotebookId(closed)).toBe("b");
  });

  it("ignores a tab id it does not have", () => {
    const state = initialTabs();
    expect(closeTab(state, "nope")).toBe(state);
    expect(activateTab(state, "nope")).toBe(state);
  });

  it("closes the tabs of deleted notebooks and leaves the rest", () => {
    const two = openInTab(openInTab(initialTabs(), "a"), "b");
    const pruned = pruneTabs(two, new Set(["b"]));
    expect(ids(pruned)).toEqual(["b"]);
  });

  it("keeps every tab when nothing was deleted", () => {
    const two = openInTab(openInTab(initialTabs(), "a"), "b");
    expect(pruneTabs(two, new Set(["a", "b"]))).toBe(two);
  });
});
