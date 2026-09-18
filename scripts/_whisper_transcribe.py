#!/usr/bin/env python3
"""
Pure whisper transcription + Omniroute translation.
Called by fetch_transcript.sh
Usage: python3 _whisper_transcribe.py <videoId> <outputFile>
"""
import json
import os
import re
import sys
import urllib.request

VIDEO_ID = sys.argv[1] if len(sys.argv) > 1 else None
OUTPUT = sys.argv[2] if len(sys.argv) > 2 else f"/tmp/transcript_{VIDEO_ID}.json"
AUDIO_FILE = f"/tmp/yt_audio_{VIDEO_ID}.m4a"

def format_ts(seconds):
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    if h > 0:
        return f"{h}:{m:02d}:{s:02d}"
    return f"{m}:{s:02d}"

def main():
    # Step 1: Transcribe
    from faster_whisper import WhisperModel
    model = WhisperModel("small", device="cpu", compute_type="int8")
    segments, info = model.transcribe(AUDIO_FILE, language=None, vad_filter=False)

    detected_lang = info.language or "en"
    full_lines = []
    for seg in segments:
        full_lines.append(f"[{format_ts(seg.start)}] {seg.text}")

    plain_text = re.sub(r'\[.*?\] ', '', "\n".join(full_lines)).strip()

    # Step 2: Translate to English if needed
    final_text = plain_text
    if detected_lang and not detected_lang.startswith("en"):
        sys.stderr.write(f"Detected language: {detected_lang}, translating...\n")
        sys.stderr.flush()
        try:
            payload = json.dumps({
                "model": "auto/best-free",
                "messages": [
                    {
                        "role": "system",
                        "content": "You are a professional translator. Translate the following video transcript to clear, natural English. Preserve all meaning, emotional tone, names, and places exactly. Return ONLY the English translation text — no comments, no explanations, nothing else."
                    },
                    {
                        "role": "user",
                        "content": plain_text
                    }
                ],
                "stream": False
            }).encode()
            req = urllib.request.Request(
                "http://localhost:20128/v1/chat/completions",
                data=payload,
                headers={"Content-Type": "application/json"},
                method="POST"
            )
            with urllib.request.urlopen(req, timeout=60) as resp:
                result_data = json.loads(resp.read())
                final_text = result_data["choices"][0]["message"]["content"].strip()
        except Exception as e:
            sys.stderr.write(f"Translation failed: {e}\n")

    result = {
        "transcript": final_text,
        "originalTranscript": plain_text,
        "detectedLanguage": detected_lang,
        "videoId": VIDEO_ID,
    }
    with open(OUTPUT, 'w') as f:
        json.dump(result, f)

if __name__ == "__main__":
    main()
