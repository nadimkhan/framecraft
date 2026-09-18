#!/usr/bin/env python3
"""
YouTube transcript fetcher with fallback chain:
1. yt-dlp auto-captions (instant)
2. Omniroute LLM transcription (if no captions)
3. Omniroute translation to English (if needed)
"""
import json
import os
import re
import subprocess
import sys
import urllib.request
import urllib.error

VIDEO_ID = sys.argv[1] if len(sys.argv) > 1 else None
OUTPUT = sys.argv[2] if len(sys.argv) > 2 else f"/tmp/transcript_{VIDEO_ID}.json"

def run_cmd(cmd, timeout=60):
    """Run a command list, return (stdout, stderr, exitcode)."""
    p = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    try:
        out, err = p.communicate(timeout=timeout)
        return out.decode('utf-8', errors='replace'), err.decode('utf-8', errors='replace'), p.returncode
    except subprocess.TimeoutExpired:
        p.kill()
        return '', 'timeout', -1

def extract_captions_ytdlp(video_id):
    """Try yt-dlp auto-captions. Returns transcript text or None."""
    # Get available captions info first
    cmd = [
        'yt-dlp', '--list-subs',
        '--no-playlist', '--no-warnings', '--quiet',
        f'https://www.youtube.com/watch?v={video_id}'
    ]
    out, err, code = run_cmd(cmd, timeout=30)
    if code != 0:
        return None

    # Try to download auto-generated English captions
    formats = ['en', 'en-US', 'English', '']
    for lang in formats:
        extra = ['--write-auto-subs', '--sub-lang', lang] if lang else ['--write-auto-subs']
        out_file = f'/tmp/yt_subs_{video_id}'
        cmd = [
            'yt-dlp',
            '-f', 'bestaudio/best',
            '--skip-download',
            '--convert-subs', 'vtt',
            '--output', out_file,
            '--no-playlist', '--no-warnings', '--quiet',
        ] + extra + [f'https://www.youtube.com/watch?v={video_id}']

        out2, err2, code2 = run_cmd(cmd, timeout=30)
        vtt_file = f'{out_file}.en.vtt'
        if lang == 'English':
            vtt_file = f'{out_file}.English.vtt'
        # Check all possible files
        possible = [f'{out_file}.en.vtt', f'{out_file}.English.vtt', f'{out_file}.vtt']
        actual = None
        for p in possible:
            if os.path.exists(p):
                actual = p
                break
        if actual:
            try:
                with open(actual, 'r', errors='replace') as f:
                    content = f.read()
                # Parse VTT to plain text
                text = parse_vtt(content)
                if text.strip():
                    return text
            except Exception:
                pass
    return None

def parse_vtt(content):
    """Extract plain text from VTT subtitle content.
    YouTube auto-captions have blocks like:
    00:00:09.559 --> 00:00:12.530
    [word-timing line with <00:00:xx> tags]
    [plain text line]   ← LAST non-blank line in this block

    Strategy: after each '-->' arrow, track the LAST non-blank line.
    When we see the next arrow (or EOF), emit that buffered line.
    The last line = the plain text, not the word-timing one.
    """
    lines = content.split('\n')
    result = []
    last_nonblank = None
    in_block = False

    for line in lines:
        line = line.strip()
        if not line or line.startswith('WEBVTT') or line.startswith('Kind:') or line.startswith('Language:'):
            continue
        if '-->' in line:
            # End of previous block: emit the last non-blank line (the plain text), stripped of tags
            if last_nonblank is not None:
                # Strip ALL timing/word tags like <00:00:10.559>, <c>, </c>
                clean = re.sub(r'<[^>]+>', '', last_nonblank).strip()
                if clean:
                    result.append(clean)
            last_nonblank = None
            in_block = True
            continue

        if in_block and line:
            last_nonblank = line

    # Emit last block at EOF
    if last_nonblank is not None:
        clean = re.sub(r'<[^>]+>', '', last_nonblank).strip()
        if clean:
            result.append(clean)

    return ' '.join(result)

def dedup_sentences(text):
    """Remove duplicate sentence fragments from YouTube auto-captions.
    Each VTT block ends with a phrase that starts the next block.
    We only keep the longer (complete) version.
    """
    if not text:
        return text
    tokens = text.split()
    result = []
    i = 0
    n = len(tokens)

    while i < n:
        # Check for overlap: do the upcoming tokens start with the tail of result?
        overlap_len = 0
        for ol in range(min(15, len(result)), 0, -1):
            tail = result[-ol:]
            if tokens[i:i+ol] == tail:
                overlap_len = ol
                break

        if overlap_len > 0:
            # Skip the duplicate overlap
            i += overlap_len
        else:
            result.append(tokens[i])
            i += 1

    return ' '.join(result)

def translate_text(text, source_lang='auto'):
    """Translate text to English using Omniroute."""
    if not text or not text.strip():
        return text

    try:
        payload = json.dumps({
            "model": "auto/best-free",
            "messages": [
                {
                    "role": "system",
                    "content": "You are a professional translator. Translate the following transcript to clear, natural English. Preserve all meaning, emotional tone, names, and places exactly. Return ONLY the English translation — nothing else."
                },
                {
                    "role": "user",
                    "content": text
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
            return result_data["choices"][0]["message"]["content"].strip()
    except Exception as e:
        return None

def detect_language(text):
    """Simple language detection."""
    # Use Omniroute for language detection
    try:
        payload = json.dumps({
            "model": "auto/best-free",
            "messages": [
                {"role": "system", "content": "Detect the language of the following text. Reply with only the ISO 639-1 two-letter language code (e.g. 'en', 'es', 'hi', 'fr', 'de'). If unsure, reply 'en'."},
                {"role": "user", "content": text[:200]}
            ],
            "stream": False
        }).encode()
        req = urllib.request.Request(
            "http://localhost:20128/v1/chat/completions",
            data=payload,
            headers={"Content-Type": "application/json"},
            method="POST"
        )
        with urllib.request.urlopen(req, timeout=30) as resp:
            result = json.loads(resp.read())
            lang = result["choices"][0]["message"]["content"].strip().lower()
            return lang[:2]
    except:
        return 'en'

def main():
    if not VIDEO_ID:
        result = {"error": "videoId required", "videoId": None}
        with open(OUTPUT, 'w') as f:
            json.dump(result, f)
        print(json.dumps({"error": "videoId required"}))
        sys.exit(1)

    try:
        # Step 1: Try yt-dlp captions (fast)
        transcript = extract_captions_ytdlp(VIDEO_ID)
        method = "ytdlp"

        if not transcript:
            # Step 2: No captions — download audio and store the file path
            audio_file = f'/tmp/yt_audio_{VIDEO_ID}.m4a'
            cmd = [
                'yt-dlp', '-f', 'bestaudio[ext=m4a]/bestaudio[ext=webm]/bestaudio',
                '--extract-audio', '--audio-format', 'm4a', '--audio-quality', '5',
                '--output', audio_file, '--no-playlist', '--no-warnings', '-q',
                f'https://www.youtube.com/watch?v={VIDEO_ID}'
            ]
            out, err, code = run_cmd(cmd, timeout=90)
            if code == 0 and os.path.exists(audio_file):
                # Return the audio path as the "transcript" — narrator will process it later
                result = {
                    "transcript": f"[AUDIO:{audio_file}]",
                    "detectedLanguage": "unknown",
                    "method": "audio_download",
                    "videoId": VIDEO_ID,
                }
                with open(OUTPUT, 'w') as f:
                    json.dump(result, f)
                print(json.dumps({"ok": True, "method": "audio_download"}))
                sys.exit(0)

        if not transcript:
            # Audio download also failed — write error JSON
            result = {"error": "Could not extract transcript or download audio", "videoId": VIDEO_ID}
            with open(OUTPUT, 'w') as f:
                json.dump(result, f)
            print(json.dumps({"error": "Could not extract transcript or download audio"}))
            sys.exit(1)

        # Step 3: Deduplicate auto-caption artifacts
        transcript = dedup_sentences(transcript)

        # Step 4: Detect language and translate if needed
        detected_lang = detect_language(transcript)
        final_text = transcript

        if detected_lang != 'en':
            translated = translate_text(transcript)
            if translated:
                final_text = translated
                method = f"{method}+translation"

        result = {
            "transcript": final_text,
            "originalTranscript": transcript if final_text != transcript else None,
            "detectedLanguage": detected_lang,
            "method": method,
            "videoId": VIDEO_ID,
        }
        result = {k: v for k, v in result.items() if v is not None}

        with open(OUTPUT, 'w') as f:
            json.dump(result, f)

        print(json.dumps({"ok": True, "method": method}))
    except Exception as e:
        import traceback
        sys.stderr.write(f"FATAL: {e}\n")
        traceback.print_exc()
        # Write a valid JSON error file so the API route can read it
        try:
            with open(OUTPUT, 'w') as f:
                json.dump({"error": str(e), "videoId": VIDEO_ID}, f)
        except Exception:
            pass
        sys.exit(1)

if __name__ == "__main__":
    main()
