export { randomUUID, guestToken } from "../../../../shared/browser";

/**
 * Call directly from a click handler, before awaiting any network request.
 * execCommand covers HTTP LAN testing and browsers without Clipboard API access.
 * false means the UI must show selectable text for manual copying; never claim success.
 */
export async function copyText(text: string): Promise<boolean> {
  if (!text || typeof document === "undefined") return false;
  const focused = document.activeElement as HTMLElement | null;
  const editable =
    focused instanceof HTMLInputElement ||
    focused instanceof HTMLTextAreaElement
      ? focused
      : null;
  const caret = editable
    ? {
        start: editable.selectionStart,
        end: editable.selectionEnd,
        direction: editable.selectionDirection,
      }
    : null;
  const selection = window.getSelection();
  const ranges = selection
    ? Array.from({ length: selection.rangeCount }, (_, index) =>
        selection.getRangeAt(index).cloneRange(),
      )
    : [];
  const field = document.createElement("textarea");
  field.value = text;
  field.readOnly = true;
  field.setAttribute("aria-label", "Text to copy");
  field.style.cssText =
    "position:fixed;top:0;left:0;width:1px;height:1px;padding:0;border:0;opacity:0;font-size:16px;pointer-events:none;";
  // Native dialogs and Bits UI focus traps both require a field inside the modal.
  const host =
    focused?.closest('dialog[open], [role="dialog"]') ??
    document.querySelector('dialog[open], [role="dialog"]') ??
    document.body;
  let copied = false;
  try {
    host.appendChild(field);
    field.focus({ preventScroll: true });
    field.select();
    field.setSelectionRange(0, text.length);
    copied =
      typeof document.execCommand === "function" &&
      document.execCommand("copy");
  } catch {
    // Browser policy can deny both APIs. The caller then presents manual copying.
  } finally {
    field.remove();
    try {
      focused?.focus({ preventScroll: true });
      if (editable && caret && caret.start !== null && caret.end !== null)
        editable.setSelectionRange(
          caret.start,
          caret.end,
          caret.direction ?? undefined,
        );
      else if (selection) {
        selection.removeAllRanges();
        for (const range of ranges) selection.addRange(range);
      }
    } catch {
      // A focus target may have been removed; this does not change copy success.
    }
  }
  if (copied) return true;
  try {
    if (typeof navigator.clipboard?.writeText !== "function") return false;
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
