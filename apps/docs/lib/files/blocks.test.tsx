// File-backed landing blocks: schemas, defaults and server-rendered output.
// Run: cd apps/docs && npx tsx --test lib/files/blocks.test.tsx
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import "./blocks";
import {
  type BlockRenderContext,
  createBlock,
  getBlock,
  parseLandingPageContent,
} from "@/lib/landing/registry";
import {
  DEFAULT_LANDING_THEME,
  emptyLandingPageContent,
} from "@/types/landing";

// tsx compiles JSX with the classic runtime here (Next's tsconfig preserves it).
Object.assign(globalThis, { React });

const ID = "cmvwdh3f80000d2cfbvda2bl3";
const ID2 = "cmvwdh3f90002d2cfbx93h9ih";
const TYPES = ["pdf", "gallery", "audio", "video-file", "file-download"];

const context = (mode: "live" | "preview"): BlockRenderContext => ({
  theme: DEFAULT_LANDING_THEME,
  mode,
  pageId: null,
  qrCodeId: null,
});

function render(
  type: string,
  props: Record<string, unknown>,
  mode: "live" | "preview" = "live",
) {
  const definition = getBlock(type);
  assert.ok(definition, `${type} is registered`);
  const parsed = definition.schema.parse(props);
  const { Render } = definition;
  return renderToStaticMarkup(
    <Render context={context(mode)} id="b1" props={parsed} />,
  );
}

const file = (fileId = ID, name = "menu.pdf") => ({
  type: "file",
  fileId,
  name,
});

describe("file blocks", () => {
  it("register with schema-valid defaults in the Media category", () => {
    for (const type of TYPES) {
      const definition = getBlock(type);
      assert.ok(definition, type);
      assert.equal(definition.category, "media");
      assert.ok(createBlock(type).props, type);
    }
  });

  it("render nothing live and a placeholder in the editor until filled", () => {
    for (const type of TYPES) {
      assert.equal(render(type, {}, "live"), "", type);
      assert.match(render(type, {}, "preview"), /border-dashed/, type);
    }
  });

  it("PDF: absolute file link live, relative in preview, download via ?download=1", () => {
    const live = render("pdf", { source: file(), title: "Our menu" });
    assert.match(live, new RegExp(`href="https?://[^"]+/api/files/${ID}"`));
    assert.match(live, new RegExp(`/api/files/${ID}\\?download=1`));
    assert.match(live, /Open PDF/);
    assert.match(live, /Our menu/);
    const preview = render("pdf", { source: file() }, "preview");
    assert.match(preview, new RegExp(`href="/api/files/${ID}"`));
    const noDownload = render("pdf", { source: file(), allowDownload: false });
    assert.doesNotMatch(noDownload, /Download/);
  });

  it("PDF: external links are used as they are", () => {
    const html = render("pdf", {
      source: { type: "url", url: "https://cdn.test/a.pdf" },
    });
    assert.match(html, /href="https:\/\/cdn\.test\/a\.pdf"/);
    assert.doesNotMatch(html, /api\/files/);
  });

  it("Gallery: accessible photo buttons and a closed dialog", () => {
    const html = render("gallery", {
      title: "Photos",
      images: [
        { id: "i1", source: file(ID, "a.jpg"), alt: "Front door" },
        { id: "i2", source: { type: "url", url: "https://cdn.test/b.jpg" } },
      ],
    });
    assert.match(html, /aria-label="Open photo 1 of 2: Front door"/);
    assert.match(html, /alt="Front door"/);
    assert.match(html, /src="https:\/\/cdn\.test\/b\.jpg"/);
    assert.match(html, /<dialog/);
    assert.doesNotMatch(html, /<dialog[^>]*\sopen(=|\s|>)/);
  });

  it("Audio: native player with a playlist for several tracks", () => {
    const html = render("audio", {
      tracks: [
        { id: "t1", source: file(ID, "intro.mp3"), title: "Intro" },
        { id: "t2", source: file(ID2, "Second_Song.mp3") },
      ],
      allowDownload: true,
    });
    assert.match(html, /<audio[^>]*controls/);
    assert.match(html, new RegExp(`src="https?://[^"]+/api/files/${ID}"`));
    assert.match(html, /aria-label="Playlist"/);
    assert.match(html, /Second_Song/);
    assert.match(html, /aria-label="Download Intro"/);
  });

  it("Video file: plays inline; autoplay is muted and loops", () => {
    const html = render("video-file", {
      source: file(ID, "clip.mp4"),
      autoplay: true,
    });
    assert.match(html, /<video/);
    assert.match(html, /playsinline/i);
    assert.match(html, /muted/);
    assert.match(html, /loop/);
  });

  it("Downloads: one big link per file", () => {
    const html = render("file-download", {
      files: [
        { id: "d1", source: file(), label: "Spring menu", kind: "pdf" },
        { id: "d2", source: { type: "url", url: "https://cdn.test/x.zip" } },
      ],
    });
    assert.match(html, new RegExp(`/api/files/${ID}\\?download=1`));
    assert.match(html, /Spring menu/);
    assert.match(html, /target="_blank"/);
    assert.match(html, /opens in a new tab/);
  });

  it("validate inside page content and drop nothing valid", () => {
    const content = {
      ...emptyLandingPageContent(),
      blocks: [
        { id: "a", type: "pdf", props: { source: file() } },
        {
          id: "b",
          type: "gallery",
          props: { images: [{ source: file(ID2, "x.png") }] },
        },
      ],
    };
    const parsed = parseLandingPageContent(content);
    assert.ok(parsed.success);
    const bad = parseLandingPageContent({
      ...content,
      blocks: [
        {
          id: "a",
          type: "pdf",
          props: { source: { type: "url", url: "javascript:alert(1)" } },
        },
      ],
    });
    assert.equal(bad.success, false);
  });
});
