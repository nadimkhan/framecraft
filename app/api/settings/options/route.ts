import { NextResponse } from 'next/server'
import prisma from '@/lib/db'

// GET /api/settings/options — list all selectable options for series settings
export async function GET() {
  try {
    const [voiceStyles, artStyles, backgroundMusic, effects, niches] = await Promise.all([
      prisma.voiceStyle.findMany({ orderBy: { name: 'asc' } }),
      prisma.artStyle.findMany({ orderBy: { name: 'asc' } }),
      prisma.backgroundMusic.findMany({ orderBy: [{ category: 'asc' }, { name: 'asc' }] }),
      prisma.effect.findMany({ orderBy: { name: 'asc' } }),
      prisma.niche.findMany({ orderBy: { category: 'asc' } }),
    ])
    // Map Niche.category -> niche.name for UI compatibility
    const mappedNiches = niches.map(n => ({ id: n.id, name: n.category, slug: n.slug, description: n.description }))
    return NextResponse.json({ niches: mappedNiches, voiceStyles, artStyles, backgroundMusic, effects })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
