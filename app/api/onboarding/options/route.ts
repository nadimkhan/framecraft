import { NextResponse } from 'next/server'
import prisma from '@/lib/db'

// GET /api/onboarding/options — return niche categories + all selectable options
export async function GET() {
  const [niches, artStyles, voiceStyles, backgroundMusic, effects] = await Promise.all([
    // Niche = the category template; sceneStyles moved to Series
    prisma.niche.findMany({
      orderBy: { category: 'asc' },
      select: { id: true, category: true, slug: true, description: true },
    }),
    prisma.artStyle.findMany({ orderBy: { name: 'asc' } }),
    prisma.voiceStyle.findMany({ orderBy: { name: 'asc' } }),
    prisma.backgroundMusic.findMany({ orderBy: { category: 'asc' } }),
    prisma.effect.findMany({ orderBy: { name: 'asc' } }),
  ])

  // Map category -> name for UI compatibility
  const mappedNiches = niches.map(n => ({ ...n, name: n.category }))

  return NextResponse.json({
    niches: mappedNiches,
    artStyles, voiceStyles, backgroundMusic, effects,
  })
}
