import { redirect } from "next/navigation"
import prisma from "@/lib/db"
import SeriesDashboard from "./series-dashboard"
import CreateSeriesButton from "./create-series-button"

export const dynamic = "force-dynamic"

export default async function DashboardPage() {
  const allSeries = await prisma.series.findMany({
    where: { onboardingCompleted: true },
    orderBy: { createdAt: "asc" },
    include: {
      niche: true,
      artStyle: { select: { id: true, name: true, slug: true } },
      voiceStyle: { select: { id: true, name: true, slug: true } },
      _count: { select: { sceneStyles: true } },
    },
  })

  const niches = await prisma.niche.findMany({
    orderBy: { category: "asc" },
  })

  if (allSeries.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center max-w-md">
          <div className="text-6xl mb-4">🎬</div>
          <h2 className="text-2xl font-bold mb-2">No channels yet</h2>
          <p className="text-muted-foreground mb-6">
            Create your first YouTube channel/series to start generating content.
          </p>
          <CreateSeriesButton />
        </div>
      </div>
    )
  }

  return <SeriesDashboard initialSeries={allSeries} niches={niches} />
}
