#!/bin/bash
# YouTube transcript fetcher: downloads audio + transcribes with faster-whisper + translates via Omniroute
# Usage: bash fetch_transcript.sh <videoId> <outputJson>
VIDEO_ID="$1"
OUTPUT="$2"

if [ -z "$VIDEO_ID" ]; then
    echo '{"error":"videoId required"}'
    exit 1
fi

AUDIO_FILE="/tmp/yt_audio_${VIDEO_ID}.m4a"
HERMES_PYTHON="/home/nadim/.hermes/hermes-agent/venv/bin/python3"
SCRIPT_DIR="$(dirname "$0")"
PY_SCRIPT="${SCRIPT_DIR}/_whisper_transcribe.py"

# Step 1: Download audio (10s timeout)
yt-dlp -f 'bestaudio[ext=m4a]/bestaudio[ext=webm]/bestaudio' \
    --extract-audio --audio-format m4a --audio-quality 5 \
    --output "$AUDIO_FILE" --no-playlist --no-warnings -q \
    "https://www.youtube.com/watch?v=${VIDEO_ID}" 2>/dev/null

if [ ! -f "$AUDIO_FILE" ]; then
    echo "{\"error\":\"Failed to download audio\"}"
    exit 1
fi

# Step 2: Run Python transcription + translation
timeout 120 "$HERMES_PYTHON" "$PY_SCRIPT" "$VIDEO_ID" "$OUTPUT"
PY_EXIT=$?

# Cleanup audio
rm -f "$AUDIO_FILE"

if [ $PY_EXIT -eq 0 ]; then
    exit 0
else
    echo "{\"error\":\"Transcription failed (exit $PY_EXIT)\"}"
    exit 1
fi
