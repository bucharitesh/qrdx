import { getSVGString, QRCodeSVG } from "qrdx";
import { memo, StrictMode, useEffect, useId, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  MAX_SIZE,
  type MainMessage,
  MIN_SIZE,
  type QRMeta,
  type UIMessage,
} from "./messages";
import {
  buildQRProps,
  byteLength,
  checkColors,
  DEFAULT_STYLE,
  effectiveColors,
  MAX_QR_BYTES,
  PRESETS,
  type QRStyle,
  type StylePreset,
} from "./presets";

const DEFAULT_SIZE = 256;
const PREVIEW_SIZE = 160;
const THUMB_SIZE = 48;
const THUMB_VALUE = "https://qrdx.dev";
const LABEL_MAX = 80;

interface Form {
  value: string;
  style: QRStyle;
  size: string;
}

const INITIAL_FORM: Form = {
  value: "",
  style: DEFAULT_STYLE,
  size: String(DEFAULT_SIZE),
};

function post(message: UIMessage) {
  parent.postMessage({ pluginMessage: message }, "*");
}

function formFromMeta(meta: QRMeta): Form {
  return {
    value: meta.value,
    style: {
      presetId: meta.presetId,
      fgColor: meta.fgColor,
      bgColor: meta.bgColor,
    },
    size: String(meta.size),
  };
}

function parseSize(text: string): number | null {
  const size = Number(text);
  return Number.isInteger(size) && size >= MIN_SIZE && size <= MAX_SIZE
    ? size
    : null;
}

function truncate(text: string, max: number) {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

const PresetThumb = memo(function PresetThumb({
  preset,
}: {
  preset: StylePreset;
}) {
  return (
    <QRCodeSVG
      {...buildQRProps(THUMB_VALUE, { ...DEFAULT_STYLE, presetId: preset.id })}
      aria-hidden="true"
      focusable="false"
      size={THUMB_SIZE}
    />
  );
});

function App() {
  const [form, setForm] = useState<Form>(INITIAL_FORM);
  const [selected, setSelected] = useState<QRMeta | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const contentId = useId();
  const contentHintId = useId();
  const sizeId = useId();
  const sizeHintId = useId();

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const message = event.data?.pluginMessage as MainMessage | undefined;
      if (message?.type !== "selection") return;
      setSelected(message.qr);
      if (message.load && message.qr) setForm(formFromMeta(message.qr));
    };
    window.addEventListener("message", onMessage);
    post({ type: "ready" });
    return () => window.removeEventListener("message", onMessage);
  }, []);

  const text = form.value.trim();
  const bytes = byteLength(text);
  const tooLong = bytes > MAX_QR_BYTES;
  const size = parseSize(form.size);
  const canRender = text.length > 0 && !tooLong;
  const canSubmit = canRender && size !== null && !busy;
  const qrProps = useMemo(
    () => buildQRProps(text, form.style),
    [text, form.style]
  );
  const colors = effectiveColors(form.style);
  const scan = checkColors(form.style);
  const hasColorOverrides = Boolean(form.style.fgColor || form.style.bgColor);

  const updateStyle = (patch: Partial<QRStyle>) =>
    setForm((current) => ({
      ...current,
      style: { ...current.style, ...patch },
    }));

  async function submit(mode: "insert" | "replace") {
    if (!(canSubmit && size)) return;
    setBusy(true);
    setError(null);
    try {
      const svg = await getSVGString({ ...qrProps, size });
      post({
        type: mode,
        svg,
        meta: { ...form.style, version: 1, value: text, size },
      });
    } catch (cause) {
      const detail = cause instanceof Error ? ` ${cause.message}` : "";
      setError(`Couldn't create the QR code.${detail}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="app">
      {selected && (
        <section aria-label="Selected QR code" className="selected">
          <p>
            <strong>Selected:</strong> {truncate(selected.value, LABEL_MAX)}
          </p>
          <button
            className="button"
            onClick={() => setForm(formFromMeta(selected))}
            type="button"
          >
            Load its settings
          </button>
        </section>
      )}

      <div className="field">
        <label htmlFor={contentId}>URL or text</label>
        <textarea
          aria-describedby={tooLong ? contentHintId : undefined}
          aria-invalid={tooLong}
          id={contentId}
          onChange={(event) =>
            setForm((current) => ({ ...current, value: event.target.value }))
          }
          placeholder="https://example.com"
          rows={3}
          spellCheck={false}
          value={form.value}
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
            {tooLong ? "Too long for a QR code" : "Enter a URL or text"}
          </p>
        )}
      </div>

      <fieldset className="field">
        <legend>Style</legend>
        <div className="presets">
          {PRESETS.map((preset) => (
            <label className="preset" key={preset.id} title={preset.label}>
              <input
                checked={form.style.presetId === preset.id}
                className="sr-only"
                name="preset"
                onChange={() =>
                  updateStyle({
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
              onChange={(event) => updateStyle({ fgColor: event.target.value })}
              type="color"
              value={colors.fg}
            />
            Foreground
          </label>
          <label className="color">
            <input
              onChange={(event) => updateStyle({ bgColor: event.target.value })}
              type="color"
              value={colors.bg}
            />
            Background
          </label>
          {hasColorOverrides && (
            <button
              className="button ghost"
              onClick={() => updateStyle({ fgColor: null, bgColor: null })}
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
        <label htmlFor={sizeId}>Size (px)</label>
        <input
          aria-describedby={sizeHintId}
          aria-invalid={size === null}
          id={sizeId}
          inputMode="numeric"
          max={MAX_SIZE}
          min={MIN_SIZE}
          onChange={(event) =>
            setForm((current) => ({ ...current, size: event.target.value }))
          }
          step={1}
          type="number"
          value={form.size}
        />
        <p
          className="hint"
          data-tone={size === null ? "error" : undefined}
          id={sizeHintId}
        >
          {size === null
            ? `Enter a whole number from ${MIN_SIZE} to ${MAX_SIZE}.`
            : "Width and height of new codes. Replacing keeps the selected code's size and position."}
        </p>
      </div>

      <footer className="footer">
        {error && (
          <p className="hint" data-tone="error" role="alert">
            {error}
          </p>
        )}
        <div className="footer-actions">
          {selected && (
            <button
              className="button primary"
              disabled={!canSubmit}
              onClick={() => submit("replace")}
              type="button"
            >
              Replace selected QR
            </button>
          )}
          <button
            className={selected ? "button" : "button primary"}
            disabled={!canSubmit}
            onClick={() => submit("insert")}
            type="button"
          >
            {selected ? "Insert new" : "Insert QR code"}
          </button>
        </div>
      </footer>
    </main>
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
