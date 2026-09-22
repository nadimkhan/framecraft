/**
 * Lightning AI LTX-Video generation via Gradio API.
 *
 * Auth: none
 *
 * Flow:
 *  1. POST /gradio_api/call/generate → { event_id }
 *  2. Poll GET /gradio_api/call/generate/{event_id} every 2s via SSE
 *  3. When done, parse the final SSE data block for { data: [...] }
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

export interface LightningResult {
  videoUrl: string
  videoPath: string
  subtitlePath: string | null
}

/**
 * Parse a Gradio SSE response line. Returns the data content if the line
 * represents a final (non-progress) data block.
 *
 * Gradio SSE format:
 *   event: progress
 *   data: {...json with progress info...}
 *
 *   event: complete
 *   data: [...]   ← this is the final result array
 *
 *   data: [...]   ← final result without event name
 *
 * Returns the parsed JSON from the last significant data block.
 */
function parseSseData(sseText: string): any | null {
  const lines = sseText.split("\n")
  let lastData: string | null = null
  let lastEvent: string | null = null

  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed.startsWith("event:")) {
      lastEvent = trimmed.slice("event:".length).trim()
    } else if (trimmed.startsWith("data:")) {
      lastData = trimmed.slice("data:".length).trim()
    }
  }

  if (!lastData) return null

  // Progress events have object data. The final result has array data.
  try {
    return JSON.parse(lastData)
  } catch {
    return null
  }
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

  const base = (endpoint || DEFAULT_GRADIO_BASE).replace(/\/$/, "")
  const submitUrl = `${base}/gradio_api/call/generate`

  console.log(`[lightning] base=${base} prompt="${prompt.slice(0, 60)}..."`)

  // ─── Step 1: Submit job ─────────────────────────────────────────────────
  const submitRes = await fetch(submitUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      data: [
        prompt,
        null,
        null,
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

  // ─── Step 2: Poll via SSE until complete ─────────────────────────────
  const pollUrl = `${base}/gradio_api/call/generate/${event_id}`
  const deadline = Date.now() + MAX_WAIT_MS

  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS)

    const pollRes = await fetch(pollUrl)
    if (!pollRes.ok) {
      console.warn(`[lightning] poll ${event_id} HTTP ${pollRes.status}, retrying...`)
      continue
    }

    const contentType = pollRes.headers.get("content-type") || ""
    const sseText = await pollRes.text()

    // If it's not SSE, try parsing as plain JSON (fallback for older Gradio)
    if (!contentType.includes("text/event-stream")) {
      try {
        const json = JSON.parse(sseText)
        if (Array.isArray(json)) {
          // Already complete with data
          console.log(`[lightning] job ${event_id} complete (direct JSON)`)
          return downloadResult(json, base, outputDir)
        }
        if (json.status === "complete") {
          console.log(`[lightning] job ${event_id} complete`)
          return downloadResult(json.data, base, outputDir)
        }
        console.log(`[lightning] job ${event_id} status=${json.status}, waiting...`)
        continue
      } catch {
        console.warn(`[lightning] poll ${event_id} non-SSE response not JSON, retrying...`)
        continue
      }
    }

    // Parse SSE
    const data = parseSseData(sseText)
    if (data === null) {
      console.warn(`[lightning] poll ${event_id} could not parse SSE data, retrying...`)
      continue
    }

    // If data is an array, it's the final result
    if (Array.isArray(data)) {
      console.log(`[lightning] job ${event_id} complete (SSE)`)
      return downloadResult(data, base, outputDir)
    }

    // If data is an object with status
    if (typeof data === "object" && data !== null) {
      const status = (data as any).status
      if (status === "complete") {
        console.log(`[lightning] job ${event_id} complete`)
        return downloadResult((data as any).data, base, outputDir)
      }
      console.log(`[lightning] job ${event_id} status=${status}, waiting...`)
    }
  }

  throw new Error(`Lightning generation timed out after ${MAX_WAIT_MS / 1000}s`)
}

async function downloadResult(data: any, base: string, outputDir: string): Promise<LightningResult> {
  if (!Array.isArray(data) || !data[0]) {
    throw new Error(`Unexpected Gradio result: ${JSON.stringify(data)}`)
  }

  const { video: videoFilename, subtitles: subtitleFilename } = data[0] as {
    video: string
    subtitles: string | null
  }

  if (!videoFilename) {
    throw new Error(`No video filename in response: ${JSON.stringify(data[0])}`)
  }

  // Download video
  const videoFileUrl = `${base}/file=${videoFilename}`
  const videoFilenameOnly = videoFilename.split("/").pop()!
  const videoLocalPath = `${outputDir}/${videoFilenameOnly}`

  await downloadFile(videoFileUrl, videoLocalPath)
  console.log(`[lightning] video saved: ${videoLocalPath}`)

  // Download subtitle if present
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
