import type { DragEvent } from "react";

// Drag and drop between the codes table and the folder tree (HTML5 DnD, so
// mouse only; "Move to folder" covers keyboard and touch).
export const DRAG_CODES = "application/x-qrdx-codes";
export const DRAG_FOLDER = "application/x-qrdx-folder";

export function startCodesDrag(event: DragEvent, ids: string[]) {
  event.dataTransfer.setData(DRAG_CODES, JSON.stringify(ids));
  event.dataTransfer.effectAllowed = "move";
  if (ids.length > 1) {
    const ghost = document.createElement("div");
    ghost.textContent = `${ids.length} codes`;
    ghost.style.cssText =
      "position:fixed;top:-100px;left:-100px;padding:4px 10px;border-radius:9999px;background:#155dfc;color:#fff;font:600 12px system-ui,sans-serif";
    document.body.appendChild(ghost);
    event.dataTransfer.setDragImage(ghost, 0, 0);
    setTimeout(() => ghost.remove(), 0);
  }
}

export function draggedCodes(event: DragEvent): string[] | null {
  try {
    const ids = JSON.parse(event.dataTransfer.getData(DRAG_CODES));
    return Array.isArray(ids) && ids.every((id) => typeof id === "string")
      ? ids
      : null;
  } catch {
    return null;
  }
}

export const isDragOf = (event: DragEvent, type: string) =>
  event.dataTransfer.types.includes(type);
