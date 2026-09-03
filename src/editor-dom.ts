const CHANGED_CLASS = "modelo-changed";

function blockElement(blockId: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(
    `.bn-block-outer[data-id="${blockId}"]`
  );
}

/**
 * Puts the cursor in a new block's name field with its text selected, so the
 * first keystrokes name the variable instead of keeping the generated one. The
 * block renders on the next frame, so the lookup waits for it.
 */
export function focusVariableName(blockId: string): void {
  requestAnimationFrame(() => {
    const input = blockElement(blockId)?.querySelector<HTMLInputElement>(
      'input[aria-label="Variable name"]'
    );
    input?.focus();
    input?.select();
  });
}

/**
 * Flashes every block an agent touched and scrolls the first one into view. The
 * flash is a CSS animation in `blocknote-theme.css`; the class leaves when the
 * animation ends, so a second call can flash the same block again.
 */
export function revealBlocks(blockIds: readonly string[]): void {
  requestAnimationFrame(() => {
    let first = true;
    for (const blockId of blockIds) {
      const element = blockElement(blockId);
      if (!element) {
        continue;
      }
      element.classList.remove(CHANGED_CLASS);
      element.addEventListener(
        "animationend",
        () => element.classList.remove(CHANGED_CLASS),
        { once: true }
      );
      element.classList.add(CHANGED_CLASS);
      if (first) {
        element.scrollIntoView({ behavior: "smooth", block: "nearest" });
        first = false;
      }
    }
  });
}
