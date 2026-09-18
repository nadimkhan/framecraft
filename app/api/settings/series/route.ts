import { NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/db"

export async function GET() {
  const series = await prisma.series.findMany({
    where: { onboardingCompleted: true },
    orderBy: { createdAt: "asc" },
    include: {
      niche: true,
      artStyle: { select: { id: true, name: true, slug: true } },
      voiceStyle: { select: { id: true, name: true, slug: true } },
      _count: { select: { sceneStyles: true } },
    },
  })
  return NextResponse.json({ series })
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { seriesName, slug, description, nicheId } = body
  if (!seriesName || !nicheId) {
    return NextResponse.json({ error: "seriesName and nicheId are required" }, { status: 400 })
  }
  const autoSlug = slug || seriesName.toLowerCase().replace(/\s+/g, "-")
  const existing = await prisma.series.findUnique({ where: { slug: autoSlug } })
  if (existing) {
    return NextResponse.json({ error: "Slug already in use" }, { status: 409 })
  }
  const s = await prisma.series.create({
    data: { seriesName, slug: autoSlug, description, nicheId },
    include: { niche: true },
  })
  return NextResponse.json({ series: s }, { status: 201 })
}
