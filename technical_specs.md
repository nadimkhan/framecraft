# YouTube Shorts Automation System
## Local-Only Technical Specification (with UI/UX)

---

## 1. Purpose

Build a **local-only YouTube Shorts automation system** that runs entirely on a developer machine using **Next.js as the sole backend**, **PostgreSQL for persistence**, **local FFmpeg for video rendering**, and **free or low-cost AI APIs**.

The system includes a **clean dashboard-style UI** built with **Tailwind CSS and shadcn/ui**, supports **human review at critical steps**, and uploads approved videos to YouTube with scheduling.

No cloud hosting. No serverless. No separate backend service.

---

## 2. Core Features

### 2.1 Topic Planning
- User inputs:
  - Base topic (e.g. "Self Motivation")
  - Videos per day (e.g. 2)
- System generates **60 short-video topics**
- User manually selects topics for production

---

### 2.2 Script & Scene Generation
For each selected topic:
- Generate a **30–45 second narration**
- Break narration into **4–6 scenes**
- For each scene generate:
  - Scene narration
  - Image generation prompt

---

### 2.3 Asset Generation
- Generate images using **free image generation APIs**
- Generate voiceovers using **free TTS**
- Save all assets locally

---

### 2.4 Video Rendering
- Use **FFmpeg locally** to:
  - Animate static images (zoom, pan, fade)
  - Sync audio per scene
  - Concatenate scenes into final MP4
- Output videos prepared for review

---

### 2.5 Review & Approval
- Preview rendered videos
- Edit metadata (title, description, hashtags)
- Approve or reject videos

---

### 2.6 YouTube Upload & Scheduling
- Upload approved videos via **YouTube Data API v3**
- Schedule publish date and time
- Track upload status

---

## 3. Technology Stack

### Runtime
- Next.js (App Router)
- Node.js (local runtime)

### Database
- PostgreSQL (local or Docker)
- Prisma ORM

### UI / Styling
- Tailwind CSS
- shadcn/ui components
- Lucide icons

### Media Processing
- FFmpeg (local installation)

### AI / APIs
- Text: OpenAI / Gemini / local LLM
- Images: Pollinations / HuggingFace / Stable Diffusion (local)
- Voice: Piper TTS / Coqui TTS / Edge TTS
- Upload: YouTube Data API v3

---

## 4. Architecture Overview

Next.js functions as both frontend and backend using:
- Server Actions
- API Route Handlers

All heavy processing runs **server-side only**.

---

## 5. Folder Structure

```
youtube-automation/
├── app/
│   ├── api/
│   │   ├── topics/
│   │   ├── scripts/
│   │   ├── assets/
│   │   ├── render/
│   │   └── youtube/
│   ├── dashboard/
│   │   ├── page.tsx        # Overview / stats
│   │   ├── topics/
│   │   ├── videos/
│   │   └── review/
│   └── layout.tsx
│
├── components/
│   ├── ui/                # shadcn components
│   ├── sidebar.tsx
│   ├── header.tsx
│   ├── video-card.tsx
│   └── scene-preview.tsx
│
├── lib/
│   ├── db.ts
│   ├── ai.ts
│   ├── tts.ts
│   ├── image.ts
│   ├── ffmpeg.ts
│   └── youtube.ts
│
├── prisma/
│   └── schema.prisma
│
├── uploads/
│   ├── images/
│   ├── audio/
│   └── videos/
│
├── scripts/
│   └── cron.ts
│
└── package.json
```

---

## 6. Database Schema (Prisma)

```prisma
model TopicBatch {
  id          Int      @id @default(autoincrement())
  baseTopic   String
  createdAt  DateTime @default(now())
  topics      Topic[]
}

model Topic {
  id          Int      @id @default(autoincrement())
  batchId    Int
  title       String
  selected    Boolean  @default(false)
  video       Video?
}

model Video {
  id          Int      @id @default(autoincrement())
  topicId    Int
  title       String
  narration   String
  status      String   // draft | assets | rendered | approved | uploaded
  videoPath   String?
  publishAt   DateTime?
  scenes      Scene[]
}

model Scene {
  id          Int      @id @default(autoincrement())
  videoId    Int
  index       Int
  narration   String
  prompt      String
  imagePath   String?
  audioPath   String?
}
```

---

## 7. UI / UX DESIGN GUIDELINES (CRITICAL)

### 7.1 Design System
- Use **Tailwind CSS** for layout and spacing
- Use **shadcn/ui** for:
  - Buttons
  - Inputs
  - Modals
  - Tables
  - Tabs
  - Cards
- Use **Lucide icons**
- Dark mode preferred (dashboard-style)

---

### 7.2 Layout Structure
- Left sidebar navigation:
  - Dashboard
  - Topics
  - Videos
  - Review
  - Uploads
- Top header:
  - Current batch
  - System status

---

### 7.3 Topic Selection UI
- Table or card list
- Checkbox-based selection
- Bulk select / deselect
- Clear visual state for selected topics

---

### 7.4 Video Pipeline UI
Each video card must display:
- Topic title
- Current status badge
- Action buttons:
  - Generate Assets
  - Render Video
  - Preview
  - Approve
  - Upload

---

### 7.5 Scene Preview UI
- Per-video scene list
- Display:
  - Scene narration
  - Image preview
  - Audio playback
- Allow regeneration of individual scenes

---

### 7.6 Review Screen
- Embedded video player
- Editable fields:
  - Title
  - Description
  - Hashtags
- Approve / Reject buttons

---

### 7.7 UX Principles
- Human-in-the-loop first
- No hidden automation
- Clear status indicators
- No background auto-upload without approval

---

## 8. Processing Pipelines

### 8.1 Topic Generation
1. User inputs base topic and videos/day
2. LLM generates 60 topics
3. Topics displayed for manual selection

---

### 8.2 Script & Scene Generation
1. Generate narration (30–45 sec)
2. Split into 4–6 scenes
3. Generate image prompts per scene
4. Persist results

---

### 8.3 Asset Generation
For each scene:
1. Generate image → save locally
2. Generate voice → save locally
3. Update database paths

---

### 8.4 Video Rendering
1. Render animated video per scene
2. Concatenate scenes using FFmpeg
3. Save final MP4
4. Update status to `rendered`

---

### 8.5 Review & Approval
- Manual preview and editing
- Approval required before upload

---

### 8.6 Upload & Scheduling
1. Authenticate with YouTube OAuth
2. Upload MP4
3. Schedule publishing
4. Update status to `uploaded`

---

## 9. Automation Strategy

- Local cron using `node-cron`
- Optional CLI scripts for batch execution
- No external schedulers

---

## 10. Constraints & Guidelines

- Human-in-the-loop required before upload
- Avoid repeated scripts and imagery
- Optimize for YouTube Shorts (9:16, ≤60s)

---

## 11. Non-Goals

- No SaaS or multi-user support
- No cloud hosting
- No serverless compatibility
- No automatic upload without approval

---

## 12. Development Phases

### Phase 1
- Database + Topic generation
- Topic selection UI

### Phase 2
- Script & scene generation
- Asset generation UI

### Phase 3
- FFmpeg video rendering
- Video preview UI

### Phase 4
- YouTube upload & scheduling

---

## 13. Instructions for Autonomous Agent

- Follow this document strictly
- Use Tailwind + shadcn/ui for all UI
- Do not introduce additional services
- Do not skip manual review steps
- Implement phases sequentially
- Prefer clarity over abstraction