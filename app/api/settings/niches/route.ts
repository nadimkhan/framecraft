import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'

// GET /api/settings/niches — list all niches with their per-niche config
export async function GET() {
  try {
    const niches = await prisma.niche.findMany({
      include: {},
      orderBy: { category: 'asc' },
    })
    const fullConfigs = await prisma.channelConfig.findMany({
      where: { nicheId: { in: niches.map(n => n.id) } },
    })
    const cfgByNiche: Record<number, any> = {}
    for (const cfg of fullConfigs) {
      if (cfg.nicheId) cfgByNiche[cfg.nicheId] = cfg
    }
    return NextResponse.json({
      niches: niches.map(n => ({
        ...n,
        config: cfgByNiche[n.id] ?? null,
      })),
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// POST /api/settings/niches — create niche + auto-create its ChannelConfig
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { name, slug, description } = body
    if (!name || !slug) {
      return NextResponse.json({ error: 'name and slug are required' }, { status: 400 })
    }
    const slugNormalized = String(slug).toLowerCase().trim().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-')
    const niche = await prisma.niche.create({
      data: {
        category: name,
        slug: slugNormalized,
        description: description || null,
      },
    })
    await prisma.channelConfig.create({
      data: { nicheId: niche.id, onboardingCompleted: false },
    })
    return NextResponse.json({ niche }, { status: 201 })
  } catch (error: any) {
    if (error.code === 'P2002') {
      return NextResponse.json({ error: 'A niche with that name or slug already exists' }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
