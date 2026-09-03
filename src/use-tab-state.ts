import { createParser, parseAsIndex, useQueryStates } from "nuqs";
import { useCallback, useMemo } from "react";

import {
  clampIndex,
  parseTabList,
  sameTabList,
  serializeTabList,
} from "./tabs";
import type { TabState } from "./tabs";

const tabsParser = createParser({
  eq: sameTabList,
  parse: parseTabList,
  serialize: serializeTabList,
}).withDefault([null]);

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
