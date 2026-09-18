import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { writeFile, mkdir } from 'fs/promises'
import path from 'path'

const PREVIEW_DIR = path.join(process.cwd(), 'public', 'images', 'art-styles')

// POST /api/art-styles/[id]/preview — generate a preview image using Pollinations
// If ArtStyle already has a thumbnailUrl cached on disk, returns it directly.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const artStyleId = parseInt(id)
    if (isNaN(artStyleId)) return NextResponse.json({ error: 'invalid id' }, { status: 400 })

    const art = await prisma.artStyle.findUnique({ where: { id: artStyleId } })
    if (!art) return NextResponse.json({ error: 'art style not found' }, { status: 404 })

    // 1. If we already have a cached thumbnailUrl that points to a real file on disk, return it.
    if (art.thumbnailUrl && art.thumbnailUrl.startsWith('/images/art-styles/')) {
      const filePath = path.join(process.cwd(), 'public', art.thumbnailUrl.replace(/^\//, ''))
      try {
        await import('fs/promises').then(m => m.access(filePath))
        return NextResponse.json({ thumbnailUrl: art.thumbnailUrl, cached: true })
      } catch {
        // File missing — regenerate
      }
    }

    // 2. Generate a preview via Pollinations gen endpoint (authenticated).
    //    Uses the user-supplied POLLINATIONS_API_KEY from env. Model = flux.1-schnell.
    const POLLINATIONS_KEY = process.env.POLLINATIONS_API_KEY || process.env.POLLINATIONS_KEY
    const prompt = art.previewPrompt || art.examplePrompt || `a hero standing on a cliff, ${art.promptSuffix}`
    const seed = art.id * 1000  // deterministic per art style
    const encodedPrompt = encodeURIComponent(prompt)
    const endpoint = POLLINATIONS_KEY
      ? 'https://gen.pollinations.ai/image/'
      : 'https://image.pollinations.ai/prompt/'
    const queryParams = new URLSearchParams({
      width: '576',
      height: '1024',
      seed: String(seed),
      nologo: 'true',
      model: 'black-forest-labs/flux.1-schnell',
    })
    const pollUrl = `${endpoint}${encodedPrompt}?${queryParams.toString()}`
    const headers: Record<string, string> = POLLINATIONS_KEY
      ? { 'Authorization': `Bearer ${POLLINATIONS_KEY}` }
      : {}

    const response = await fetch(pollUrl, { headers, signal: AbortSignal.timeout(60_000) })
    if (!response.ok) {
      return NextResponse.json({ error: `Pollinations returned ${response.status}` }, { status: 502 })
    }
    const buffer = Buffer.from(await response.arrayBuffer())

    await mkdir(PREVIEW_DIR, { recursive: true })
    const filename = `${art.slug}.jpg`
    const fullPath = path.join(PREVIEW_DIR, filename)
    await writeFile(fullPath, buffer)

    const thumbnailUrl = `/images/art-styles/${filename}`
    await prisma.artStyle.update({
      where: { id: artStyleId },
      data: { thumbnailUrl },
    })
    return NextResponse.json({ thumbnailUrl, cached: false })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
