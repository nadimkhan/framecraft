# YouTube & Instagram Content Automation

A self-hosted web app that automates the full pipeline from **topic research → script generation → AI image + voice generation → video rendering → social publishing**.

Built for creators who produce content across multiple niches and channels. No paid SaaS subscriptions required.

---

## What It Does

1. **Research** — Search YouTube for trending topics in your niche using yt-dlp (no API key needed)
2. **Generate** — Create a story script from a topic's transcript using AI (Groq/Kira)
3. **Split** — Divide the script into scenes automatically
4. **Render** — Generate AI images + voiceovers per scene, then stitch into a video using Remotion
5. **Publish** — Upload directly to YouTube and/or Instagram via OAuth

---

## Architecture

| Layer | Technology |
|---|---|
| Frontend | Next.js 16 (App Router), Tailwind CSS, Radix UI |
| Database | PostgreSQL + Prisma ORM |
| LLM | Groq → Kira → OmniRoute (fallback chain) |
| Images | Pollinations AI (Flux.1 Schnell) — free, no API key |
| Voice / TTS | Azure Cognitive Services |
| Video | Remotion (React-based video composition) |
| GPU rendering | VA-API (AMD GPU offload via ffmpeg) |
| Auth | OAuth 2.0 (YouTube + Instagram) |

---

## Prerequisites

- **Node.js 20+** and **pnpm** or **npm**
- **PostgreSQL 14+** (or Docker)
- **ffmpeg** with VA-API support (for GPU-accelerated video encoding)
- **Python 3.10+** (for transcript extraction with faster-whisper)

---

## Quick Start

### 1. Clone and install

```bash
git clone <your-repo-url>
cd framecraft
pnpm install
```

### 2. Configure environment

```bash
cp .env.example .env
# Edit .env with your credentials (see Configuration section below)
```

### 3. Set up the database

```bash
npx prisma db push      # Creates all tables
npx prisma db generate  # Generates Prisma client
```

### 4. Run the dev server

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) — you'll be taken through the onboarding flow to create your first channel/series.

---

## Configuration

Copy `.env.example` to `.env` and fill in each variable. Here's what each section is for:

### Database

```env
DATABASE_URL="postgresql://user:password@localhost:5432/framecraft?schema=public"
```

Any PostgreSQL instance works. Render, Supabase, or a local Docker container.

---

### LLM Providers (required)

The app uses a fallback chain: **Groq → Kira → OmniRoute**. At least one is required.

**Groq** (recommended — fastest, free tier available):

- Sign up at [console.groq.com](https://console.groq.com)
- Get your API key from the dashboard
- Free tier: `qwen/qwen3.8-27b` model works well

```env
GROQ_API_KEY="gsk_..."
GROQ_MODELS="qwen/qwen3.8-27b,allam-2-7b,groq/compound-mini"
```

**Kira AI** (free tier available):

- Sign up at [console.kira.ai](https://console.kira.ai)

```env
KIRA_API_KEY="kira_..."
KIRA_BASE_URL="https://kiraai.vn/api/v1"
KIRA_MODELS="kira-mini-1.0"
```

**OmniRoute** (optional fallback):

```env
OMNIROUTE_API_KEY="sk-..."
OMNIROUTE_BASE_URL="http://localhost:20128/v1"
```

---

### Image Generation (required)

Uses Pollinations AI — **no API key required** for basic use.

```env
POLLINATIONS_MODEL="black-forest-labs/flux.1-schnell"
```

Other options: `flux`, `flux-dev`. The Schnell model offers the best balance of quality and speed.

---

### Text-to-Speech (required)

Azure Cognitive Services Speech. Free tier available at [azure.microsoft.com](https://azure.microsoft.com):

1. Create an Azure account
2. Search **Speech** in the Azure Portal
3. Create a Speech resource (free tier S0 works)
4. Copy the key and region

```env
AZURE_SPEECH_KEY="..."
AZURE_SPEECH_REGION="centralindia"  # or your region
```

---

### OAuth: YouTube (required for publishing)

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create a project or select an existing one
3. Go to **APIs & Services → Credentials → Create Credentials → OAuth client ID**
4. Application type: **Web application**
5. Add an **Authorized redirect URI**:
   `http://localhost:3000/api/oauth/youtube/callback`
6. Copy the **Client ID** and **Client Secret**

```env
YOUTUBE_OAUTH_CLIENT_ID="...apps.googleusercontent.com"
YOUTUBE_OAUTH_CLIENT_SECRET="GOCSPX-..."
```

In the app: go to **Series Settings → Connect YouTube** and approve in your browser. Tokens are saved automatically.

---

### OAuth: Instagram (optional — for publishing to IG)

Instagram publishing works differently from YouTube. You have two options:

**Option A — OAuth (recommended)**:

1. Go to [developers.facebook.com](https://developers.facebook.com)
2. Create an app → **Consumer** type
3. Add **Facebook Login for Business** product
4. Add redirect URI: `http://localhost:3000/api/oauth/instagram/callback`
5. In the app: **Series Settings → Connect Instagram** and approve

```env
INSTAGRAM_OAUTH_APP_ID="..."
INSTAGRAM_OAUTH_APP_SECRET="..."
```

**Option B — Manual token** (legacy):

If you already have a long-lived Instagram access token, paste it directly in **Series Settings** and skip OAuth setup.

---

### Video CDN (required for Instagram publishing)

Instagram's server fetches your video from a **public HTTPS URL**. Localhost URLs won't work.

**For local development:**

```bash
# Install ngrok (or cloudflared tunnel)
ngrok http 3000
# Copy the https URL it gives you, e.g.:
NEXT_PUBLIC_VIDEO_CDN="https://abc123.ngrok-free.app"
```

**For production:**

Point `NEXT_PUBLIC_VIDEO_CDN` to your CDN, S3 bucket with CloudFront, or any public static file server serving `/public/videos/`.

---

### Token Encryption

OAuth tokens are encrypted at rest using AES-256-GCM. Generate a key:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

```env
SOCIAL_TOKEN_ENC_KEY="<paste 64-char hex key here>"
```

---

## Usage Guide

### Creating a channel (Series)

1. Go to **Overview** on first load
2. Click **New Series**
3. Set the niche (e.g. Horror, Comedy, Finance, Gaming, Motivation)
4. Configure video duration, default art style, and content type (Shorts or Long-form)

### Finding topics

1. Go to **Topics**
2. Select your Series from the dropdown
3. Click **YouTube Search** — enter a keyword (e.g. "horror stories 2024")
4. Results are pulled via yt-dlp with no API key
5. Click **Load Story** on any result to fetch the transcript

### Generating scenes

1. With a topic loaded, click **Generate Scenes**
2. The LLM splits your story into scenes based on the series duration
3. Click into any topic to see the scene list
4. Each scene shows: narration text, image prompt, art style

### Regenerating prompts

If an image doesn't match the narration:

- **Regenerate Prompt** — asks the LLM to rewrite the image prompt based on the narration
- **Validate** — reads the narration, rebuilds the prompt, checks for subject drift, and saves if consistent

### Generating assets (images + voice)

1. With scenes generated, click **Generate Assets** in the scene list
2. Images are generated via Pollinations, voiceovers via Azure TTS
3. Both run in parallel — 10 scenes complete in under 90 seconds

### Rendering video

1. With assets generated, click **Render Video** on a topic
2. Remotion renders frames via VA-API on your GPU (or CPU fallback)
3. ffmpeg encodes the final MP4 with background music mixed in
4. Rendered video is saved to `/public/generations/<topic-name>/video.mp4`

### Publishing

1. Go to **Uploads**
2. Select your Series to see all rendered videos
3. Edit title, description, tags, and privacy setting
4. Click **Publish to YouTube** and/or **Publish to Instagram**
5. For YouTube: OAuth tokens are used automatically
6. For Instagram: video must be publicly accessible via `NEXT_PUBLIC_VIDEO_CDN`

---

## Project Structure

```
framecraft/
├── app/
│   ├── api/
│   │   ├── assets/generate/      # Image + voice generation
│   │   ├── oauth/                # YouTube + Instagram OAuth
│   │   ├── render-batch/         # Batch video rendering
│   │   ├── render-topic/         # Single topic rendering
│   │   ├── scenes/               # Scene CRUD + regenerate/validate
│   │   ├── social/publish/       # Unified publish endpoint
│   │   ├── topics/               # Topic CRUD + YouTube search + transcript
│   │   └── uploads/             # Video list + metadata
│   └── dashboard/               # All UI pages
├── lib/
│   ├── assetGenerator.ts        # Parallel image + voice generation
│   ├── imageService.ts          # Pollinations AI wrapper
│   ├── llm.ts                   # Groq → Kira → OmniRoute chain
│   ├── promptSanitizer.ts       # Prompt cleanup + image prompt builder
│   ├── promptStyles.ts          # Art style descriptors + scene prompts
│   ├── sceneGenerator.ts        # Story → scenes splitter
│   ├── sceneTemplate.ts         # Scene prompt builder + character roster
│   ├── social/
│   │   ├── config.ts            # OAuth configs
│   │   ├── credentials.ts       # Load from Series model
│   │   ├── youtube.ts          # YouTube Data API v3 publishing
│   │   └── instagram.ts        # Instagram Graph API publishing
│   ├── crypto.ts               # AES-256-GCM token encryption
│   ├── db.ts                   # Prisma client
│   └── tts.ts                  # Azure TTS wrapper
├── prisma/
│   └── schema.prisma           # Database schema
├── public/
│   ├── images/art-styles/      # Art style preview thumbnails
│   ├── generations/            # Rendered videos and scene assets (gitignored)
│   ├── videos/                 # Rendered MP4s (gitignored)
│   └── audio/music/           # Background music files (gitignored)
├── remotion/
│   ├── components/            # Remotion composition components
│   └── utils/music.ts        # Background music selection by niche
└── scripts/
    ├── render-bundle.ts      # Two-stage render: frames + ffmpeg encode
    └── fetch_transcript.py   # yt-dlp + faster-whisper transcript extraction
```

---

## Environment Variables Summary

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `GROQ_API_KEY` | Yes* | Groq API key |
| `KIRA_API_KEY` | Yes* | Kira AI API key |
| `POLLINATIONS_MODEL` | Yes | Pollinations model name |
| `AZURE_SPEECH_KEY` | Yes | Azure TTS key |
| `AZURE_SPEECH_REGION` | Yes | Azure region |
| `SOCIAL_TOKEN_ENC_KEY` | Yes | 64-char hex for AES-256-GCM |
| `YOUTUBE_OAUTH_CLIENT_ID` | For YT publish | Google OAuth client ID |
| `YOUTUBE_OAUTH_CLIENT_SECRET` | For YT publish | Google OAuth client secret |
| `INSTAGRAM_OAUTH_APP_ID` | For IG publish | Meta app ID |
| `INSTAGRAM_OAUTH_APP_SECRET` | For IG publish | Meta app secret |
| `NEXT_PUBLIC_VIDEO_CDN` | For IG publish | Public URL for rendered videos |
| `NEXT_PUBLIC_APP_URL` | Recommended | App base URL (default: localhost:3000) |

*At least one LLM provider required.

---

## Troubleshooting

**YouTube OAuth redirect URI mismatch**

Make sure `http://localhost:3000/api/oauth/youtube/callback` is added in Google Cloud Console → APIs & Services → Credentials → OAuth 2.0 Client ID → Authorized redirect URIs.

**Instagram publishing fails**

Instagram fetches the video from `NEXT_PUBLIC_VIDEO_CDN`. Make sure:
- The URL is publicly accessible (not localhost)
- `video.mp4` exists at that URL (e.g. `curl -I <CDN_URL>/video.mp4` returns 200)

**GPU rendering fails / no video output**

The two-stage render pipeline uses VA-API for hardware encoding. If you don't have a GPU:
- `scripts/render-bundle.ts` Stage 2 falls back to software ffmpeg encoding
- Make sure ffmpeg is installed: `ffmpeg -version`

**LLM calls time out**

The Groq → Kira → OmniRoute chain handles outages. If all three fail, the request returns a 502 with model diagnostics in the response body.

**Topic search returns 0 results**

yt-dlp is used directly — no YouTube API key needed. If searches return nothing, check your network connection and firewall. The separator token used is `<<<SEP>>>`.
