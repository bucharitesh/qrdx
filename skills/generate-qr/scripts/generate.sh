#!/bin/bash
set -e

# ── Args ──────────────────────────────────────────────────────────────────────
# Usage: generate.sh <data> [output.svg|output.png] [flags...]
DATA="$1"
OUTPUT="${2:-qr.svg}"

if [ -z "$DATA" ]; then
  echo '{"error":"No data provided. Usage: generate.sh <data> [output.svg] [flags]"}'
  exit 1
fi

# Remaining args (after data and optional output) are passed to the CLI
if [ "$#" -ge 2 ]; then
  shift 2
else
  shift 1
fi
EXTRA_FLAGS=("$@")

# ── Ensure output directory exists ────────────────────────────────────────────
OUTPUT_DIR="$(dirname "$OUTPUT")"
if [ "$OUTPUT_DIR" != "." ] && [ -n "$OUTPUT_DIR" ]; then
  mkdir -p "$OUTPUT_DIR"
fi

# ── Generate ──────────────────────────────────────────────────────────────────
echo "Generating QR code for: $DATA" >&2
echo "Output: $OUTPUT" >&2

if ! npx --yes @qrdx/cli generate "$DATA" -o "$OUTPUT" ${EXTRA_FLAGS[@]+"${EXTRA_FLAGS[@]}"} >&2; then
  echo '{"error":"qrdx CLI failed — see the message above (stderr)"}'
  exit 1
fi

# ── Collect result metadata ───────────────────────────────────────────────────
if [ ! -f "$OUTPUT" ]; then
  echo '{"error":"Generation failed — output file was not created"}'
  exit 1
fi

BYTES=$(wc -c < "$OUTPUT" | tr -d ' ')

# Infer format from extension (tr instead of ${EXT,,}: macOS ships bash 3.2)
EXT="$(echo "${OUTPUT##*.}" | tr '[:upper:]' '[:lower:]')"
FORMAT="svg"
if [ "$EXT" = "png" ]; then
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
