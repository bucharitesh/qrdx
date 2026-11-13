// Which inline editors the playground preview mounts over the code: the
// part toolbars (part-inline/) and frame text editing (frame-inline/).
// Neither is on the blurred sample shown before there's content: no
// buttons, outlines, Tab stops or editors. Unmounting an editor keeps an
// edit that was open as one undo step and closes it, so clearing the
// content mid-edit loses nothing. Pure.

export interface PreviewEditors {
  /** The eyes, dots, logo, background and frame buttons */
  parts: boolean;
  /** The frame text buttons, inline editor and phone sheet */
  frameText: boolean;
}

export function previewEditors({
  hasContent,
  frameActive,
}: {
  /** There's real content (not the sample) */
  hasContent: boolean;
  /** A frame is drawn around the code */
  frameActive: boolean;
}): PreviewEditors {
  return { parts: hasContent, frameText: hasContent && frameActive };
}
