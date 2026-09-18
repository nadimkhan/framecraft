import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

/**
 * POST /api/uploads/metadata
 *
 * Persist user-edited upload metadata for a Video.
 *
 * Body:
 *   {
 *     videoId: number,
 *     title: string,
 *     description: string,         // YouTube description
 *     caption: string,             // Instagram caption
 *     tags: string[],
 *     privacyStatus: 'public' | 'unlisted' | 'private',
 *   }
 *
 * We store title + description + tags on the Video row (visible to both
 * platforms). The IG caption lives on Video.metadataJson since there's no
 * dedicated IG-caption column yet. Privacy status too.
 *
 * The actual upload (POST /api/social/publish) reads these values when the
 * user clicks Upload to YouTube / Instagram, so editing + saving here is
 * what makes the upload use the right metadata.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      videoId,
      title,
      description,
      caption,
      tags,
      privacyStatus,
    } = body as {
      videoId: number
      title?: string
      description?: string
      caption?: string
      tags?: string[]
      privacyStatus?: 'public' | 'unlisted' | 'private'
    }

    if (!videoId) {
      return NextResponse.json({ error: 'videoId is required' }, { status: 400 })
    }

    // Validate fields with the same limits the UI enforces
    if (title !== undefined && (title.length > 100 || title.trim() === '')) {
      return NextResponse.json(
        { error: 'Title must be 1-100 characters' },
        { status: 400 },
      )
    }
    if (description !== undefined && description.length > 5000) {
      return NextResponse.json(
        { error: 'YouTube description must be ≤5000 characters' },
        { status: 400 },
      )
    }
    if (caption !== undefined && caption.length > 2200) {
      return NextResponse.json(
        { error: 'Instagram caption must be ≤2200 characters' },
        { status: 400 },
      )
    }
    if (tags !== undefined && tags.length > 15) {
      return NextResponse.json(
        { error: 'YouTube allows up to 15 tags per video' },
        { status: 400 },
      )
    }

    const video = await prisma.video.findUnique({
      where: { id: Number(videoId) },
      select: { id: true, metadataJson: true, description: true, tags: true },
    })
    if (!video) {
      return NextResponse.json({ error: `Video ${videoId} not found` }, { status: 404 })
    }

    // Merge new caption + privacy into metadataJson without losing other fields
    const existingMeta = (video.metadataJson as any) || {}
    const newMeta = { ...existingMeta }
    if (caption !== undefined) newMeta.instagramCaption = caption
    if (privacyStatus !== undefined) newMeta.youtubePrivacy = privacyStatus

    const data: any = {}
    if (title !== undefined) data.title = title.trim()
    if (description !== undefined) data.description = description
    if (tags !== undefined) data.tags = tags.join(',')
    if (caption !== undefined || privacyStatus !== undefined) {
      data.metadataJson = newMeta
    }

    const updated = await prisma.video.update({
      where: { id: video.id },
      data,
    })

    return NextResponse.json({
      ok: true,
      videoId: updated.id,
      title: updated.title,
      description: updated.description,
      tags: updated.tags?.split(',').filter(Boolean) ?? [],
      caption: caption ?? (video.metadataJson as any)?.instagramCaption,
      privacyStatus: privacyStatus ?? (video.metadataJson as any)?.youtubePrivacy ?? 'public',
    })
  } catch (e: any) {
    console.error('[uploads/metadata] error:', e)
    return NextResponse.json(
      { error: e?.message || 'Save failed' },
      { status: 500 },
    )
  }
}
