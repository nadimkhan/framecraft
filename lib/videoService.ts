/**
 * Lightning AI LTX-Video generation via Gradio API.
 *
 * Auth: none
 *
 * Flow:
 *  1. POST /gradio_api/call/generate → { event_id }
 *  2. Poll GET /gradio_api/call/generate/{event_id} every 2s
 *  3. When status === "complete", response contains { data: [{ video: filepath, subtitles: filepath|null }] }
 *  4. Download video + subtitles from /file={filename}
 */

export interface LightningOptions {
  prompt: string
  duration: "2s (49f)" | "3s (73f)" | "5s (121f)" | "8s (193f)" | "10s (241f)"
  resolution?: "1080p" | "720p" | "540p" | "480p"
  aspectRatio?: "16:9" | "4:3" | "1:1" | "3:4" | "9:16"
  guideScale?: number
  numSteps?: number
  seed?: number
}

const DEFAULT_GRADIO_BASE = "https://64d18b6e91e71c6b63.gradio.live"
const POLL_INTERVAL_MS = 2000
const MAX_WAIT_MS = 10 * 60 * 1000

export function mapDuration(targetSeconds: number): LightningOptions["duration"] {
  if (targetSeconds <= 2) return "2s (49f)"
  if (targetSeconds <= 3) return "3s (73f)"
  if (targetSeconds <= 5) return "5s (121f)"
  if (targetSeconds <= 8) return "8s (193f)"
  return "10s (241f)"
}

interface GradioSubmitResult {
  event_id: string
}

interface GradioStatusResult {
  status: "pending" | "processing" | "complete" | "error"
  data?: unknown
  error?: string
}

export interface LightningResult {
  videoUrl: string
  videoPath: string
  subtitlePath: string | null
}

export async function generateLightningVideo(
  options: LightningOptions,
  outputDir: string,
  endpoint?: string,
): Promise<LightningResult> {
  const {
    prompt,
    duration,
    resolution = "720p",
    aspectRatio = "16:9",
    guideScale = 3,
    numSteps = 8,
    seed = -1,
  } = options

  const base = endpoint || DEFAULT_GRADIO_BASE
  const submitUrl = `${base}/gradio_api/call/generate`

  console.log(`[lightning] base=${base} submit_url=${submitUrl} prompt="${prompt.slice(0, 60)}..."`)

  // ─── Step 1: Submit job ────────────────────────────────────────────────────
  const submitRes = await fetch(submitUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      data: [
        prompt,
        null,       // img_start — text-to-video
        null,       // img_end
        seed,
        duration,
        resolution,
        aspectRatio,
        guideScale,
        numSteps,
      ],
    }),
  })

  if (!submitRes.ok) {
    const body = await submitRes.text()
    throw new Error(`Gradio submit failed: ${submitRes.status} ${body}`)
  }

  const { event_id } = await submitRes.json() as GradioSubmitResult
  console.log(`[lightning] job submitted: event_id=${event_id}`)

  // ─── Step 2: Poll until complete ──────────────────────────────────────────
  const deadline = Date.now() + MAX_WAIT_MS
  let status: GradioStatusResult["status"] = "pending"

  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS)

    const pollUrl = `${base}/gradio_api/call/generate/${event_id}`
    const pollRes = await fetch(pollUrl)
    if (!pollRes.ok) {
      console.warn(`[lightning] poll ${event_id} failed: ${pollRes.status}, retrying...`)
      continue
    }

    const result = await pollRes.json() as GradioStatusResult
    status = result.status

    if (status === "complete") {
      console.log(`[lightning] job ${event_id} complete`)
      break
    }

    if (status === "error") {
      throw new Error(`Lightning generation error: ${(result as any).error}`)
    }

    console.log(`[lightning] job ${event_id} status=${status}, waiting...`)
  }

  if (status !== "complete") {
    throw new Error(`Lightning generation timed out after ${MAX_WAIT_MS / 1000}s`)
  }

  // ─── Step 3: Fetch final result ────────────────────────────────────────────
  const completeResult = await (await fetch(`${base}/gradio_api/call/generate/${event_id}`)).json() as GradioStatusResult
  const data = completeResult.data as any[]

  if (!data || !Array.isArray(data) || !data[0]) {
    throw new Error(`Unexpected Gradio result shape: ${JSON.stringify(data)}`)
  }

  const { video: videoFilename, subtitles: subtitleFilename } = data[0] as {
    video: string
    subtitles: string | null
  }

  if (!videoFilename) {
    throw new Error(`No video filename in Gradio response: ${JSON.stringify(data[0])}`)
  }

  // ─── Step 4: Download files ────────────────────────────────────────────────
  const videoFileUrl = `${base}/file=${videoFilename}`
  const videoFilenameOnly = videoFilename.split("/").pop()!
  const videoLocalPath = `${outputDir}/${videoFilenameOnly}`

  await downloadFile(videoFileUrl, videoLocalPath)
  console.log(`[lightning] video saved: ${videoLocalPath}`)

  let subtitleLocalPath: string | null = null
  if (subtitleFilename) {
    const subtitleFileUrl = `${base}/file=${subtitleFilename}`
    const subtitleFilenameOnly = subtitleFilename.split("/").pop()!
    subtitleLocalPath = `${outputDir}/${subtitleFilenameOnly}`
    await downloadFile(subtitleFileUrl, subtitleLocalPath)
    console.log(`[lightning] subtitle saved: ${subtitleLocalPath}`)
  }

  return {
    videoUrl: videoFileUrl,
    videoPath: videoLocalPath,
    subtitlePath: subtitleLocalPath,
  }
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function downloadFile(url: string, destPath: string): Promise<void> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Download failed ${res.status}: ${url}`)

  const fs = await import("fs")
  const pathMod = await import("path")
  const dir = pathMod.dirname(destPath)
  fs.mkdirSync(dir, { recursive: true })

  const buffer = Buffer.from(await res.arrayBuffer())
  fs.writeFileSync(destPath, buffer)
}
