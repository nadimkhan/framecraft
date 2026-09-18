// POST /api/topics/transcript — fetch + translate transcript for a YouTube video
// Returns 200 with whatever the script produced (transcript, audio path, or error in JSON)
// Only returns 500 if the script itself crashes (no output written)
import { NextRequest, NextResponse } from 'next/server'
import { spawn } from 'child_process'
import { unlink, readFile } from 'fs/promises'

const PYTHON_BIN = 'python3'
const PYTHON_SCRIPT = '/home/nadim/projects/ytautomation/scripts/fetch_transcript.py'

export async function POST(request: NextRequest) {
  let videoId: string | undefined
  try {
    const body = await request.json()
    videoId = body.videoId
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (!videoId || typeof videoId !== 'string') {
    return NextResponse.json({ error: 'videoId required' }, { status: 400 })
  }

  const outputFile = `/tmp/transcript_${videoId}.json`

  try {
    // Spawn the Python script
    const py = spawn(PYTHON_BIN, [PYTHON_SCRIPT, videoId, outputFile], {
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    let stderr = ''
    py.stderr.on('data', (d) => { stderr += d.toString() })

    const exitCode = await new Promise<number>((resolve) => {
      const killTimer = setTimeout(() => {
        try { py.kill('SIGKILL') } catch {}
        resolve(124) // timeout exit code
      }, 5 * 60 * 1000)

      py.on('close', (code) => {
        clearTimeout(killTimer)
        resolve(code ?? 0)
      })
      py.on('error', (err) => {
        clearTimeout(killTimer)
        stderr += `\nSpawn error: ${err.message}`
        resolve(1)
      })
    })

    // Try to read the output file regardless of exit code — the script
    // may have written a valid result before erroring, or may have written
    // an "audio_download" result with exit 0.
    let result: any = null
    try {
      const content = await readFile(outputFile, 'utf-8')
      result = JSON.parse(content)
    } catch {
      // No output file written — script crashed before producing anything
      if (exitCode === 124) {
        return NextResponse.json(
          { error: `Transcript timed out after 5 minutes. ${stderr.slice(-200)}` },
          { status: 504 }
        )
      }
      return NextResponse.json(
        { error: `Script exited ${exitCode} with no output. ${stderr.slice(-300)}` },
        { status: 500 }
      )
    }

    // Cleanup
    await unlink(outputFile).catch(() => {})

    // If the script wrote an error result, return 200 with the error so the
    // client can show it instead of a generic 500.
    if (result && result.error) {
      return NextResponse.json({
        ok: false,
        error: result.error,
        method: result.method || 'failed',
        videoId,
      }, { status: 200 })
    }

    // Success
    return NextResponse.json({
      ok: true,
      transcript: result?.transcript || '',
      detectedLanguage: result?.detectedLanguage || 'unknown',
      method: result?.method || 'unknown',
      videoId: result?.videoId || videoId,
      originalTranscript: result?.originalTranscript,
    }, { status: 200 })
  } catch (error: any) {
    console.error('[transcript] route error:', error)
    return NextResponse.json(
      { error: error.message || 'Unknown route error' },
      { status: 500 }
    )
  }
}
