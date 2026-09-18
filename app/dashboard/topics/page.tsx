import { Suspense } from 'react'
import TopicsClient from './topics-client'
import { Card, CardContent } from '@/components/ui/card'
import { Loader2 } from 'lucide-react'
import { PageHeader } from '@/components/page-header'

function TopicsLoading() {
  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground mt-4">Loading topics...</p>
      </CardContent>
    </Card>
  )
}

export const dynamic = 'force-dynamic'

export default async function TopicsPage({
  searchParams,
}: {
  searchParams: Promise<{ seriesId?: string }>
}) {
  const params = await searchParams
  const seriesId = params.seriesId || ''

  return (
    <div className="flex-1 min-w-0 flex flex-col">
      <PageHeader
        title="Topic Planning"
        description="Discover trending YouTube videos or generate AI stories for your channel."
      />
      <div className="flex-1 px-6 py-6 max-w-7xl w-full mx-auto">
        <Suspense fallback={<TopicsLoading />}>
          <TopicsClient seriesId={seriesId} />
        </Suspense>
      </div>
    </div>
  )
}
