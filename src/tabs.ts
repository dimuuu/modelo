/** What a home tab is called in the query string. */
export const HOME = "home";

export interface TabState {
  tabs: (string | null)[];
  active: number;
}

export function initialTabs(): TabState {
  return { active: 0, tabs: [null] };
}

/** The nearest index inside `tabs`, so a hand-typed URL cannot point nowhere. */
export function clampIndex(tabs: (string | null)[], index: number): number {
  if (tabs.length === 0) {
    return 0;
  }
  return Math.min(Math.max(index, 0), tabs.length - 1);
}

/** The notebook the tools act on: the one in the tab that is in front. */
export function openNotebookId(state: TabState): string | null {
  return state.tabs[state.active] ?? null;
}

/** A new tab always starts on home, the way a browser opens a blank page. */
export function newTab(state: TabState): TabState {
  return { active: state.tabs.length, tabs: [...state.tabs, null] };
}

export function activateTab(state: TabState, index: number): TabState {
  return index >= 0 && index < state.tabs.length
    ? { ...state, active: index }
    : state;
}

/**
 * Shows a notebook. An open notebook comes to the front in the tab it already
 * has. A home tab turns into the notebook; any other tab opens a new one beside
 * itself.
 */
export function openInTab(state: TabState, notebookId: string): TabState {
  const existing = state.tabs.indexOf(notebookId);
  if (existing !== -1) {
    return { ...state, active: existing };
  }
  const tabs = [...state.tabs];
  if (tabs[state.active] === null) {
    tabs[state.active] = notebookId;
    return { ...state, tabs };
  }
  tabs.splice(state.active + 1, 0, notebookId);
  return { active: state.active + 1, tabs };
}

/** Sends the tab in front back to home without closing it. */
export function goHome(state: TabState): TabState {
  if (state.tabs[state.active] === null) {
    return state;
  }
  const tabs = [...state.tabs];
  tabs[state.active] = null;
  return { ...state, tabs };
}

/** Closing the last tab leaves a home tab, because there is no window to shut. */
export function closeTab(state: TabState, index: number): TabState {
  if (index < 0 || index >= state.tabs.length) {
    return state;
  }
  const tabs = state.tabs.filter((_, position) => position !== index);
  if (tabs.length === 0) {
    return initialTabs();
  }
  return {
    active:
      index < state.active ? state.active - 1 : clampIndex(tabs, state.active),
    tabs,
  };
}

/** Closes the tabs of notebooks that no longer exist, after a delete. */
export function pruneTabs(state: TabState, existing: Set<string>): TabState {
  const gone = state.tabs.flatMap((id, index) =>
    id !== null && !existing.has(id) ? [index] : []
  );
  let next = state;
  for (const index of gone.toReversed()) {
    next = closeTab(next, index);
  }
  return next;
}

/**
 * Reads `home,sales-ae-comp-plan` into tabs. It is forgiving on purpose,
 * because a person can type this: a blank entry is home, and a notebook that
 * appears twice keeps only its first tab.
 */
export function parseTabList(value: string): (string | null)[] {
  const seen = new Set<string>();
  const tabs: (string | null)[] = [];
  for (const part of value.split(",")) {
    const id = part.trim();
    if (id === "" || id === HOME) {
      tabs.push(null);
    } else if (!seen.has(id)) {
      seen.add(id);
      tabs.push(id);
    }
  }
  return tabs.length > 0 ? tabs : [null];
}

/** Notebook ids are UUIDs or seed slugs, so they need no escaping. */
export function serializeTabList(tabs: (string | null)[]): string {
  return tabs.map((id) => id ?? HOME).join(",");
}

export function sameTabList(
  a: (string | null)[],
  b: (string | null)[]
): boolean {
  return a.length === b.length && a.every((id, index) => id === b[index]);
}
