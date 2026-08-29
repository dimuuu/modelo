import { PlusIcon, XIcon } from "lucide-react";

import { Button } from "@/components/ui/button";

import type { TabState } from "./tabs";

/**
 * The browser-style tab strip. It is the only navigation in the app: a
 * notebook is reached by opening it in a tab, and the catalogue of notebooks
 * lives on the home tab.
 */
export function TabStrip({
  state,
  titleOf,
  onActivate,
  onClose,
  onNewTab,
}: {
  state: TabState;
  titleOf: (notebookId: string | null) => string;
  onActivate: (index: number) => void;
  onClose: (index: number) => void;
  onNewTab: () => void;
}) {
  return (
    <nav
      aria-label="Open tabs"
      className="bg-muted/60 flex shrink-0 items-end gap-1 overflow-x-auto border-b px-2 pt-1.5"
    >
      {state.tabs.map((notebookId, index) => {
        const title = titleOf(notebookId);
        const active = index === state.active;
        return (
          <div
            className={`group flex h-9 w-[200px] shrink-0 items-center gap-1 rounded-t-lg border border-b-0 pr-1 pl-3 ${
              active
                ? "bg-background border-border"
                : "hover:bg-background/50 border-transparent"
            }`}
            key={`${notebookId ?? "home"}-${index}`}
          >
            <button
              aria-current={active ? "page" : undefined}
              className="min-w-0 flex-1 truncate text-left text-[13px]"
              onClick={() => onActivate(index)}
              type="button"
            >
              {title}
            </button>
            <Button
              aria-label={`Close ${title}`}
              className="text-muted-foreground opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
              onClick={() => onClose(index)}
              size="icon-sm"
              title="Close tab"
              type="button"
              variant="ghost"
            >
              <XIcon />
            </Button>
          </div>
        );
      })}
      <Button
        aria-label="New tab"
        className="text-muted-foreground mb-1 shrink-0"
        onClick={onNewTab}
        size="icon-sm"
        title="New tab"
        type="button"
        variant="ghost"
      >
        <PlusIcon />
      </Button>
    </nav>
  );
}
