import { Suspense } from 'react'
import { Loader2 } from 'lucide-react'
import ScenesClient from './scenes-client'

function Loading() {
  return (
    <div className="flex items-center justify-center py-20">
      <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
    </div>
  )
}

export default function ScenesPage() {
  return (
    <Suspense fallback={<Loading />}>
      <ScenesClient />
    </Suspense>
  )
}
