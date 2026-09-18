import { Suspense } from 'react'
import PipelineClient from './pipeline-client'
import { Loader2 } from 'lucide-react'

function PipelineLoading() {
  return (
    <div className="flex items-center justify-center py-20">
      <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
    </div>
  )
}

export default function PipelinePage() {
  return (
    <Suspense fallback={<PipelineLoading />}>
      <PipelineClient />
    </Suspense>
  )
}
