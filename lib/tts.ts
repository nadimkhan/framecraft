import path from 'path'
import fs from 'fs'
import { spawn } from 'child_process'

const AZURE_SPEECH_KEY = process.env.AZURE_SPEECH_SUBSCRIPTION_KEY || process.env.AZURE_SPEECH_KEY
const AZURE_SPEECH_REGION = process.env.AZURE_SPEECH_REGION || 'centralindia'

const DEFAULT_VOICE = 'en-US-JennyNeural'
const OUTPUT_FORMAT = 'audio-16khz-128kbitrate-mono-mp3'
const DEFAULT_RATE = '1.0'

export class TTSError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TTSError'
  }
}

function buildSsml(text: string, voice: string = DEFAULT_VOICE, rate: string = DEFAULT_RATE): string {
  const cleanedText = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')

  return `<speak version="1.0" xml:lang="en-US">
  <voice name="${voice}">
    <prosody rate="${rate}" pitch="+0%">
      ${cleanedText}
    </prosody>
  </voice>
</speak>`
}

export async function generateNarrationAudio(
  text: string,
  outputPath: string,
  voice: string = DEFAULT_VOICE
): Promise<string> {
  if (!text || text.trim().length === 0) {
    throw new TTSError('Text cannot be empty')
  }

  if (!AZURE_SPEECH_KEY) {
    throw new TTSError('AZURE_SPEECH_KEY not configured in environment')
  }

  const outputDir = path.dirname(outputPath)
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true })
  }

  const ssml = buildSsml(text, voice)
  const url = `https://${AZURE_SPEECH_REGION}.tts.speech.microsoft.com/cognitiveservices/v1`

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': AZURE_SPEECH_KEY,
      'Content-Type': 'application/ssml+xml',
      'X-Microsoft-OutputFormat': OUTPUT_FORMAT,
    },
    body: ssml,
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new TTSError(`Azure TTS failed: ${response.status} - ${errorText}`)
  }

  const arrayBuffer = await response.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)

  const ext = '.mp3'
  let finalPath = outputPath
  if (outputPath.endsWith('.wav')) {
    finalPath = outputPath.replace(/\.wav$/, '.mp3')
  } else if (!outputPath.endsWith(ext)) {
    finalPath = outputPath + ext
  }

  fs.writeFileSync(finalPath, buffer)

  return finalPath
}

/**
 * Measure actual audio duration using ffprobe.
 * Returns duration in milliseconds.
 */
export async function measureAudioDuration(audioPath: string): Promise<number> {
  return new Promise((resolve) => {
    let fullPath: string
    if (audioPath.startsWith('/')) {
      fullPath = path.join(process.cwd(), 'public', audioPath.replace(/^\//, ''))
    } else {
      fullPath = audioPath
    }

    if (!fs.existsSync(fullPath)) {
      resolve(0)
      return
    }

    const ffprobe = spawn('ffprobe', [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      fullPath,
    ])

    let output = ''
    ffprobe.stdout.on('data', (data) => { output += data.toString() })
    ffprobe.on('close', () => {
      const durationSeconds = parseFloat(output.trim()) || 0
      resolve(Math.round(durationSeconds * 1000)) // return ms
    })
    ffprobe.on('error', () => {
      resolve(0)
    })
  })
}

export function calculateTotalDuration(audioPaths: string[]): Promise<number> {
  return new Promise((resolve) => {
    if (audioPaths.length === 0) {
      resolve(0)
      return
    }

    let totalDuration = 0
    let processed = 0

    for (const audioPath of audioPaths) {
      let fullPath: string
      if (audioPath.startsWith('/')) {
        fullPath = path.join(process.cwd(), 'public', audioPath.replace(/^\//, ''))
      } else {
        fullPath = audioPath
      }

      if (!fs.existsSync(fullPath)) {
        processed++
        if (processed === audioPaths.length) resolve(totalDuration)
        continue
      }

      const ffprobe = spawn('ffprobe', [
        '-v', 'error',
        '-show_entries', 'format=duration',
        '-of', 'default=noprint_wrappers=1:nokey=1',
        fullPath,
      ])

      let output = ''
      ffprobe.stdout.on('data', (data) => { output += data.toString() })
      ffprobe.on('close', () => {
        const duration = parseFloat(output.trim()) || 0
        totalDuration += duration
        processed++
        if (processed === audioPaths.length) resolve(totalDuration)
      })
      ffprobe.on('error', () => {
        processed++
        if (processed === audioPaths.length) resolve(totalDuration)
      })
    }
  })
}

export function sanitizeFolderName(name: string): string {
  return name.replace(/[^a-zA-Z0-9]/g, '_')
}
