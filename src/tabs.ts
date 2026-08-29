/**
 * The tab strip: which tabs are open, and which one is in front.
 *
 * A tab shows one notebook, or home when `notebookId` is null. A notebook is
 * open in at most one tab, so its editor and its saved blocks never fork.
 * Every change here is a pure function from one `TabState` to the next, the
 * same shape the workspace catalogue uses.
 */

export interface Tab {
  id: string;
  notebookId: string | null;
}

export interface TabState {
  tabs: Tab[];
  activeId: string;
}

function homeTab(): Tab {
  return { id: crypto.randomUUID(), notebookId: null };
}

export function initialTabs(): TabState {
  const tab = homeTab();
  return { activeId: tab.id, tabs: [tab] };
}

export function activeTab(state: TabState): Tab {
  return state.tabs.find((tab) => tab.id === state.activeId) ?? state.tabs[0];
}

/** The notebook the tools act on: the one in the tab that is in front. */
export function openNotebookId(state: TabState): string | null {
  return activeTab(state).notebookId;
}

/** A new tab always starts on home, the way a browser opens a blank page. */
export function newTab(state: TabState): TabState {
  const tab = homeTab();
  return { activeId: tab.id, tabs: [...state.tabs, tab] };
}

export function activateTab(state: TabState, id: string): TabState {
  return state.tabs.some((tab) => tab.id === id)
    ? { ...state, activeId: id }
    : state;
}

/**
 * Shows a notebook. An open notebook comes to the front in the tab it already
 * has. A home tab turns into the notebook; any other tab opens a new one
 * beside itself.
 */
export function openInTab(state: TabState, notebookId: string): TabState {
  const existing = state.tabs.find((tab) => tab.notebookId === notebookId);
  if (existing) {
    return { ...state, activeId: existing.id };
  }
  const current = activeTab(state);
  if (current.notebookId === null) {
    return {
      activeId: current.id,
      tabs: state.tabs.map((tab) =>
        tab.id === current.id ? { ...tab, notebookId } : tab
      ),
    };
  }
  const tab: Tab = { id: crypto.randomUUID(), notebookId };
  const tabs = [...state.tabs];
  tabs.splice(state.tabs.indexOf(current) + 1, 0, tab);
  return { activeId: tab.id, tabs };
}

/** Sends the tab in front back to home without closing it. */
export function goHome(state: TabState): TabState {
  const current = activeTab(state);
  return {
    ...state,
    tabs: state.tabs.map((tab) =>
      tab.id === current.id ? { ...tab, notebookId: null } : tab
    ),
  };
}

/** Closing the last tab leaves a home tab, because there is no window to shut. */
export function closeTab(state: TabState, id: string): TabState {
  const index = state.tabs.findIndex((tab) => tab.id === id);
  if (index === -1) {
    return state;
  }
  const tabs = state.tabs.filter((tab) => tab.id !== id);
  if (tabs.length === 0) {
    return initialTabs();
  }
  const neighbour = tabs[index] ?? tabs.at(-1);
  return {
    activeId: state.activeId === id ? neighbour.id : state.activeId,
    tabs,
  };
}

/** Closes the tabs of notebooks that no longer exist, after a delete. */
export function pruneTabs(state: TabState, existing: Set<string>): TabState {
  const gone = state.tabs.filter(
    (tab) => tab.notebookId !== null && !existing.has(tab.notebookId)
  );
  let next = state;
  for (const tab of gone) {
    next = closeTab(next, tab.id);
  }
  return next;
}
