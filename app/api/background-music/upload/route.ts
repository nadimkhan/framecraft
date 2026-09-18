import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { writeFile, mkdir } from 'fs/promises'
import path from 'path'

const UPLOAD_DIR = path.join(process.cwd(), 'public', 'audio', 'music', 'uploads')

// POST /api/background-music/upload — multipart upload of a single audio file.
// Body: { file: File, category: string, name?: string }
// Returns the created BackgroundMusic row.
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const category = (formData.get('category') as string) || 'custom'
    const name = (formData.get('name') as string) || ''
    if (!file) {
      return NextResponse.json({ error: 'file is required' }, { status: 400 })
    }
    if (!file.name.match(/\.(mp3|wav|webm|m4a|ogg)$/i)) {
      return NextResponse.json({ error: 'unsupported audio format' }, { status: 400 })
    }

    await mkdir(UPLOAD_DIR, { recursive: true })
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const filename = `${Date.now()}-${safeName}`
    const fullPath = path.join(UPLOAD_DIR, filename)
    const buffer = Buffer.from(await file.arrayBuffer())
    await writeFile(fullPath, buffer)

    const publicUrl = `audio/music/uploads/${filename}`
    const displayName = name.trim() || safeName.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ')
    const slug = `custom-${filename.replace(/\.[^.]+$/, '')}`.slice(0, 80)

    const row = await prisma.backgroundMusic.create({
      data: {
        name: displayName,
        slug,
        category,
        localPath: publicUrl,
        isUploaded: true,
      },
    })
    return NextResponse.json({ music: row }, { status: 201 })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
