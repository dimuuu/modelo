import { createParser, parseAsIndex, useQueryStates } from "nuqs";
import { useCallback, useMemo } from "react";

import {
  clampIndex,
  parseTabList,
  sameTabList,
  serializeTabList,
} from "./tabs";
import type { TabState } from "./tabs";

/**
 * Binds the tab strip to the query string, so a reload or a shared link opens
 * the same tabs. `?tabs=home,sales-ae-comp-plan&tab=2` is two tabs with the
 * notebook in front. One home tab is the default, and nuqs drops a parameter
 * that equals its default, so the plain URL stays clean.
 */

const tabsParser = createParser({
  eq: sameTabList,
  parse: parseTabList,
  serialize: serializeTabList,
}).withDefault([null]);

// parseAsIndex counts from 1 in the URL and from 0 in the code.
const tabParser = parseAsIndex.withDefault(0);

export type UpdateTabs = (change: (current: TabState) => TabState) => void;

export function useTabState(): [TabState, UpdateTabs] {
  const [{ tabs, tab }, setQuery] = useQueryStates({
    tab: tabParser,
    tabs: tabsParser,
  });

  const state = useMemo<TabState>(
    () => ({ active: clampIndex(tabs, tab), tabs }),
    [tab, tabs]
  );

  const update = useCallback<UpdateTabs>(
    (change) => {
      setQuery((current) => {
        const next = change({
          active: clampIndex(current.tabs, current.tab),
          tabs: current.tabs,
        });
        return { tab: next.active, tabs: next.tabs };
      });
    },
    [setQuery]
  );

  return [state, update];
}
