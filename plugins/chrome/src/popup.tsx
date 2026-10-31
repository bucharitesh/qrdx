import { copyQRCodeToClipboard, downloadQRCode, QRCodeSVG } from "qrdx";
import { memo, StrictMode, useEffect, useId, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  buildQRProps,
  byteLength,
  checkColors,
  DEFAULT_STYLE,
  effectiveColors,
  MAX_QR_BYTES,
  PRESETS,
  type StylePreset,
} from "./presets";
import {
  EXPORT_SIZES,
  getActiveTabUrl,
  loadPreferences,
  onPendingValue,
  type PendingValue,
  type Preferences,
  savePreferences,
  takePendingValue,
} from "./storage";

// The playground has no URL parameter for its content yet, so link to the homepage.
const QRDX_URL = "https://qrdx.dev";
const PREVIEW_SIZE = 192;
const THUMB_SIZE = 56;
const THUMB_VALUE = "https://qrdx.dev";
const LABEL_MAX = 80;

type Source = "page" | PendingValue["source"] | "edited";
type Action = "png" | "svg" | "copy";

const SOURCE_LABELS: Record<Source, string> = {
  page: "This page",
  link: "Link",
  image: "Image address",
  selection: "Selected text",
  edited: "Edited",
};

interface Status {
  tone: "success" | "error";
  text: string;
}

function truncate(text: string, max: number) {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function fileStem(text: string) {
  const hostname = URL.canParse(text) ? new URL(text).hostname : "";
  return hostname ? `qrdx-${hostname.replace(/^www\./, "")}` : "qrdx-qr-code";
}

function errorMessage(action: Action, error: unknown) {
  if (action === "copy") {
    return "Couldn't copy the image. Try downloading it instead.";
  }
  const detail = error instanceof Error ? ` ${error.message}` : "";
  return `Couldn't create the ${action.toUpperCase()}.${detail}`;
}

const PresetThumb = memo(function PresetThumb({
  preset,
}: {
  preset: StylePreset;
}) {
  return (
    <QRCodeSVG
      {...buildQRProps(THUMB_VALUE, {
        ...DEFAULT_STYLE,
        presetId: preset.id,
      })}
      aria-hidden="true"
      focusable="false"
      size={THUMB_SIZE}
    />
  );
});

interface GeneratorProps {
  value: string;
  source: Source;
  preferences: Preferences;
  onValueChange: (value: string) => void;
  onPreferencesChange: (patch: Partial<Preferences>) => void;
}

function Generator({
  value,
  source,
  preferences,
  onValueChange,
  onPreferencesChange,
}: GeneratorProps) {
  const [busy, setBusy] = useState<Action | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const contentId = useId();
  const contentHintId = useId();
  const sizeId = useId();

  const text = value.trim();
  const bytes = byteLength(text);
  const tooLong = bytes > MAX_QR_BYTES;
  const canRender = text.length > 0 && !tooLong;
  const canExport = canRender && busy === null;
  const qrProps = useMemo(
    () => buildQRProps(text, preferences),
    [text, preferences]
  );
  const colors = effectiveColors(preferences);
  const scan = checkColors(preferences);
  const exportSize = { width: preferences.size, height: preferences.size };
  const hasColorOverrides = Boolean(preferences.fgColor || preferences.bgColor);

  async function run(action: Action, task: () => Promise<void>, done: string) {
    setBusy(action);
    setStatus(null);
    try {
      await task();
      setStatus({ tone: "success", text: done });
    } catch (error) {
      setStatus({ tone: "error", text: errorMessage(action, error) });
    } finally {
      setBusy(null);
    }
  }

  const download = (format: "png" | "svg") =>
    run(
      format,
      () =>
        downloadQRCode(qrProps, {
          format,
          size: exportSize,
          filename: `${fileStem(text)}.${format}`,
        }),
      `${format.toUpperCase()} download started`
    );

  // No await before the clipboard write: it must stay inside the click gesture.
  const copy = () =>
    run(
      "copy",
      () => copyQRCodeToClipboard(qrProps, exportSize),
      "Image copied to clipboard"
    );

  return (
    <main className="popup">
      <header className="header">
        <img alt="" height={20} src="icons/icon-32.png" width={20} />
        <h1>QRdx</h1>
        <a className="link" href={QRDX_URL} rel="noreferrer" target="_blank">
          Open in QRdx
        </a>
      </header>

      <div className="columns">
        <section aria-label="Preview and export" className="preview-column">
          <div className="preview">
            {canRender ? (
              <QRCodeSVG
                {...qrProps}
                aria-label={`QR code for ${truncate(text, LABEL_MAX)}`}
                role="img"
                size={PREVIEW_SIZE}
              />
            ) : (
              <p className="preview-empty">
                {tooLong ? "Too long for a QR code" : "Enter a link or text"}
              </p>
            )}
          </div>

          <div className="actions">
            <button
              className="button primary"
              disabled={!canExport}
              onClick={() => download("png")}
              type="button"
            >
              {busy === "png" ? "Preparing…" : "Download PNG"}
            </button>
            <button
              className="button"
              disabled={!canExport}
              onClick={() => download("svg")}
              type="button"
            >
              {busy === "svg" ? "Preparing…" : "Download SVG"}
            </button>
            <button
              className="button"
              disabled={!canExport}
              onClick={copy}
              type="button"
            >
              {busy === "copy" ? "Copying…" : "Copy image"}
            </button>
          </div>

          <output
            aria-live="polite"
            className="status"
            data-tone={status?.tone}
          >
            {status?.text}
          </output>
        </section>

        <section aria-label="Content and style" className="controls-column">
          <div className="field">
            <div className="label-row">
              <label htmlFor={contentId}>Content</label>
              <span className="badge">{SOURCE_LABELS[source]}</span>
            </div>
            <textarea
              aria-describedby={tooLong ? contentHintId : undefined}
              aria-invalid={tooLong}
              id={contentId}
              onChange={(event) => onValueChange(event.target.value)}
              placeholder="https://example.com or any text"
              rows={3}
              spellCheck={false}
              value={value}
            />
            {bytes > MAX_QR_BYTES * 0.8 && (
              <p
                className="hint"
                data-tone={tooLong ? "error" : undefined}
                id={contentHintId}
              >
                {bytes} / {MAX_QR_BYTES} bytes
                {tooLong ? ". Shorten it to make a QR code." : ""}
              </p>
            )}
          </div>

          <fieldset className="field">
            <legend>Style</legend>
            <div className="presets">
              {PRESETS.map((preset) => (
                <label className="preset" key={preset.id} title={preset.label}>
                  <input
                    checked={preferences.presetId === preset.id}
                    className="sr-only"
                    name="preset"
                    onChange={() =>
                      onPreferencesChange({
                        presetId: preset.id,
                        fgColor: null,
                        bgColor: null,
                      })
                    }
                    type="radio"
                    value={preset.id}
                  />
                  <PresetThumb preset={preset} />
                  <span className="preset-label">{preset.label}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="field">
            <legend>Colors</legend>
            <div className="colors">
              <label className="color">
                <input
                  onChange={(event) =>
                    onPreferencesChange({ fgColor: event.target.value })
                  }
                  type="color"
                  value={colors.fg}
                />
                Foreground
              </label>
              <label className="color">
                <input
                  onChange={(event) =>
                    onPreferencesChange({ bgColor: event.target.value })
                  }
                  type="color"
                  value={colors.bg}
                />
                Background
              </label>
              {hasColorOverrides && (
                <button
                  className="button ghost"
                  onClick={() =>
                    onPreferencesChange({ fgColor: null, bgColor: null })
                  }
                  type="button"
                >
                  Reset
                </button>
              )}
            </div>
            {scan.lowContrast ? (
              <p className="hint" data-tone="warning">
                Low contrast ({scan.contrast.toFixed(1)}:1). Some phones may not
                scan this code.
              </p>
            ) : (
              scan.lightOnDark && (
                <p className="hint">
                  Light on dark: phone cameras read it, some older scanner apps
                  don't.
                </p>
              )
            )}
          </fieldset>

          <div className="field">
            <label htmlFor={sizeId}>Export size</label>
            <select
              id={sizeId}
              onChange={(event) =>
                onPreferencesChange({ size: Number(event.target.value) })
              }
              value={preferences.size}
            >
              {EXPORT_SIZES.map((size) => (
                <option key={size} value={size}>
                  {size} × {size} px
                </option>
              ))}
            </select>
          </div>
        </section>
      </div>
    </main>
  );
}

function App() {
  const [preferences, setPreferences] = useState<Preferences | null>(null);
  const [value, setValue] = useState("");
  const [source, setSource] = useState<Source>("page");

  useEffect(() => {
    let active = true;
    let receivedPending = false;

    const applyPending = (pending: PendingValue) => {
      receivedPending = true;
      setValue(pending.value);
      setSource(pending.source);
    };

    // A context-menu click can store its value just after the popup opens.
    const unsubscribe = onPendingValue((pending) => {
      if (active) applyPending(pending);
    });

    async function init() {
      const [saved, pending] = await Promise.all([
        loadPreferences(),
        takePendingValue().catch(() => null),
      ]);
      if (pending) {
        applyPending(pending);
      } else if (!receivedPending) {
        const url = await getActiveTabUrl();
        if (active && !receivedPending) setValue(url);
      }
      if (active) setPreferences(saved);
    }

    init();

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  if (!preferences) {
    return <main aria-busy="true" className="popup" />;
  }

  const updatePreferences = (patch: Partial<Preferences>) => {
    const next = { ...preferences, ...patch };
    setPreferences(next);
    savePreferences(next).catch(() => undefined);
  };

  return (
    <Generator
      onPreferencesChange={updatePreferences}
      onValueChange={(next) => {
        setValue(next);
        setSource("edited");
      }}
      preferences={preferences}
      source={source}
      value={value}
    />
  );
}

const container = document.getElementById("root");

if (container) {
  createRoot(container).render(
    <StrictMode>
      <App />
    </StrictMode>
  );
}
