import { describe, expect, it } from "vitest";

import {
  activateTab,
  closeTab,
  goHome,
  initialTabs,
  newTab,
  openInTab,
  openNotebookId,
  parseTabList,
  pruneTabs,
  serializeTabList,
} from "../src/tabs";

describe("tab strip", () => {
  it("starts on one home tab", () => {
    const state = initialTabs();
    expect(state.tabs).toEqual([null]);
    expect(openNotebookId(state)).toBeNull();
  });

  it("turns the home tab in front into the notebook", () => {
    const state = openInTab(initialTabs(), "a");
    expect(state.tabs).toEqual(["a"]);
    expect(openNotebookId(state)).toBe("a");
  });

  it("opens a second notebook beside the first, not over it", () => {
    const state = openInTab(openInTab(initialTabs(), "a"), "b");
    expect(state.tabs).toEqual(["a", "b"]);
    expect(openNotebookId(state)).toBe("b");
  });

  it("brings an already open notebook forward instead of duplicating it", () => {
    const two = openInTab(openInTab(initialTabs(), "a"), "b");
    const again = openInTab(two, "a");
    expect(again.tabs).toEqual(["a", "b"]);
    expect(openNotebookId(again)).toBe("a");
  });

  it("gives every new tab a home", () => {
    const state = newTab(openInTab(initialTabs(), "a"));
    expect(state.tabs).toEqual(["a", null]);
    expect(openNotebookId(state)).toBeNull();
  });

  it("sends the tab in front home without closing it", () => {
    const state = goHome(openInTab(initialTabs(), "a"));
    expect(state.tabs).toEqual([null]);
  });

  it("activates the neighbour when the tab in front closes", () => {
    const two = openInTab(openInTab(initialTabs(), "a"), "b");
    const closed = closeTab(two, 1);
    expect(closed.tabs).toEqual(["a"]);
    expect(openNotebookId(closed)).toBe("a");
  });

  it("leaves a home tab when the last tab closes", () => {
    const closed = closeTab(openInTab(initialTabs(), "a"), 0);
    expect(closed.tabs).toEqual([null]);
  });

  it("keeps the tab in front when an earlier tab closes", () => {
    const two = openInTab(openInTab(initialTabs(), "a"), "b");
    const closed = closeTab(two, 0);
    expect(openNotebookId(closed)).toBe("b");
  });

  it("ignores an index it does not have", () => {
    const state = initialTabs();
    expect(closeTab(state, 4)).toBe(state);
    expect(activateTab(state, 4)).toBe(state);
  });

  it("closes the tabs of deleted notebooks and leaves the rest", () => {
    const two = openInTab(openInTab(initialTabs(), "a"), "b");
    expect(pruneTabs(two, new Set(["b"])).tabs).toEqual(["b"]);
  });

  it("keeps every tab when nothing was deleted", () => {
    const two = openInTab(openInTab(initialTabs(), "a"), "b");
    expect(pruneTabs(two, new Set(["a", "b"]))).toBe(two);
  });
});

describe("the query string form", () => {
  it("round trips home tabs and notebooks", () => {
    const tabs = [null, "sales", null, "runway"];
    expect(serializeTabList(tabs)).toBe("home,sales,home,runway");
    expect(parseTabList("home,sales,home,runway")).toEqual(tabs);
  });

  it("reads a blank entry as home", () => {
    expect(parseTabList("")).toEqual([null]);
    expect(parseTabList(",sales")).toEqual([null, "sales"]);
  });

  it("keeps only the first tab of a repeated notebook", () => {
    // Two editors over one record would fork the document.
    expect(parseTabList("sales,home,sales")).toEqual(["sales", null]);
  });
});
