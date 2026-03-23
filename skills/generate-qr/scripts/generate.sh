#!/bin/bash
set -e

# ── Args ──────────────────────────────────────────────────────────────────────
DATA="$1"
OUTPUT="${2:-qr.svg}"
shift 2 2>/dev/null || { echo '{"error":"No data provided. Usage: generate.sh <data> [output.svg] [flags]"}'; exit 1; }

# Remaining args are passed directly to the CLI
EXTRA_FLAGS=("$@")

# ── Validation ────────────────────────────────────────────────────────────────
if [ -z "$DATA" ]; then
  echo '{"error":"No data provided. Usage: generate.sh <data> [output.svg] [flags]"}' >&1
  exit 1
fi

# ── Ensure output directory exists ────────────────────────────────────────────
OUTPUT_DIR="$(dirname "$OUTPUT")"
if [ "$OUTPUT_DIR" != "." ] && [ -n "$OUTPUT_DIR" ]; then
  mkdir -p "$OUTPUT_DIR"
fi

# ── Generate ──────────────────────────────────────────────────────────────────
echo "Generating QR code for: $DATA" >&2
echo "Output: $OUTPUT" >&2

npx --yes @qrdx/cli generate "$DATA" -o "$OUTPUT" "${EXTRA_FLAGS[@]}" >&2

# ── Collect result metadata ───────────────────────────────────────────────────
if [ ! -f "$OUTPUT" ]; then
  echo '{"error":"Generation failed — output file was not created"}' >&1
  exit 1
fi

BYTES=$(wc -c < "$OUTPUT" | tr -d ' ')

# Infer format from extension
EXT="${OUTPUT##*.}"
FORMAT="svg"
if [ "${EXT,,}" = "png" ]; then
  FORMAT="png"
fi

# Extract --size flag value if provided, otherwise default 512
SIZE=512
for i in "${!EXTRA_FLAGS[@]}"; do
  if [ "${EXTRA_FLAGS[$i]}" = "--size" ]; then
    SIZE="${EXTRA_FLAGS[$((i+1))]}"
    break
  fi
done

# ── JSON output ───────────────────────────────────────────────────────────────
echo "{\"success\":true,\"outputPath\":\"$OUTPUT\",\"format\":\"$FORMAT\",\"size\":$SIZE,\"bytes\":$BYTES}"
