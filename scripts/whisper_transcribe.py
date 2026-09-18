#!/usr/bin/env python3
"""Whisper transcription script — called by fetch_transcript.py"""
import json
import sys
import time

audio_path = sys.argv[1] if len(sys.argv) > 1 else None
output_file = sys.argv[2] if len(sys.argv) > 2 else None

if not audio_path or not output_file:
    print("error: missing args")
    sys.exit(1)

try:
    from faster_whisper import WhisperModel
    model = WhisperModel("tiny", device="cpu", compute_type="int8")
    segments, info = model.transcribe(audio_path, language=None, vad_filter=False)
    text = " ".join(s.text for s in segments)
    result = {"transcript": text, "language": info.language or "en"}
    with open(output_file, "w") as f:
        json.dump(result, f)
    print("ok")
except Exception as e:
    with open(output_file.replace(".json", ".err"), "w") as f:
        f.write(str(e))
    print("err:" + str(e))
