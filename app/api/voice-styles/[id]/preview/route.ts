import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { writeFile, mkdir, access } from 'fs/promises'
import path from 'path'

const PREVIEW_DIR = path.join(process.cwd(), 'public', 'audio', 'voice-previews')

// POST /api/voice-styles/[id]/preview — generate (or return cached) Azure TTS preview.
// Each preview is the voice's sampleText spoken by the voice — saved to disk as MP3
// so subsequent plays are instant (no Azure call).
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const voiceId = parseInt(id)
    if (isNaN(voiceId)) return NextResponse.json({ error: 'invalid id' }, { status: 400 })

    const voice = await prisma.voiceStyle.findUnique({ where: { id: voiceId } })
    if (!voice) return NextResponse.json({ error: 'voice not found' }, { status: 404 })

    await mkdir(PREVIEW_DIR, { recursive: true })
    const filename = `${voice.slug}.mp3`
    const filePath = path.join(PREVIEW_DIR, filename)
    const publicUrl = `/audio/voice-previews/${filename}`

    // Cache hit?
    try {
      await access(filePath)
      return NextResponse.json({ audioUrl: publicUrl, cached: true })
    } catch { /* file missing — generate */ }

    // Generate via Azure Speech REST API (SSML)
    const AZURE_KEY = process.env.AZURE_SPEECH_SUBSCRIPTION_KEY || process.env.AZURE_SPEECH_KEY
    const AZURE_REGION = process.env.AZURE_SPEECH_REGION || 'centralindia'
    if (!AZURE_KEY) {
      return NextResponse.json(
        { error: 'AZURE_SPEECH_KEY not configured. Set it in .env to generate previews.' },
        { status: 500 }
      )
    }

    const text = voice.sampleText || 'Hello, this is a preview of my voice for your videos.'
    const ssml = [
      '<speak version="1.0" xml:lang="en-US">',
      `  <voice name="${voice.azureVoiceName}">`,
      '    <prosody rate="+0%" pitch="+0%">',
      `      ${text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}`,
      '    </prosody>',
      '  </voice>',
      '</speak>',
    ].join('\n')

    const url = `https://${AZURE_REGION}.tts.speech.microsoft.com/cognitiveservices/v1`
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': AZURE_KEY,
        'Content-Type': 'application/ssml+xml',
        'X-Microsoft-OutputFormat': 'audio-16khz-128kbitrate-mono-mp3',
      },
      body: ssml,
    })

    if (!response.ok) {
      const errText = await response.text()
      return NextResponse.json(
        { error: `Azure TTS ${response.status}: ${errText.slice(0, 200)}` },
        { status: 502 }
      )
    }

    const buffer = Buffer.from(await response.arrayBuffer())
    await writeFile(filePath, buffer)

    // Cache the URL in the DB so the UI doesn't have to re-check
    await prisma.voiceStyle.update({
      where: { id: voiceId },
      data: { sampleAudioUrl: publicUrl },
    })

    return NextResponse.json({ audioUrl: publicUrl, cached: false })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
