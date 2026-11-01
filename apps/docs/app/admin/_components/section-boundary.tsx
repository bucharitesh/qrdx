"use client";

import { Component, type ReactNode } from "react";

/**
 * Keeps one broken section of an admin page from taking the page down. Data
 * loaders already turn query failures into a notice (_lib/safe.ts); this
 * catches anything left, e.g. a render error.
 */
export class SectionBoundary extends Component<
  { children: ReactNode; name: string },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.warn(
      `Admin section "${this.props.name}" failed to render:`,
      error instanceof Error ? error.message : error,
    );
  }

  render() {
    if (this.state.failed) {
      return (
        <p className="text-muted-foreground py-4 text-sm">
          This section couldn&apos;t be shown. The rest of the page is fine;
          reload to try again.
        </p>
      );
    }
    return this.props.children;
  }
}
