import { Suspense } from 'react'
import SeriesSettingsClient from './series-settings-client'
import { Loader2 } from 'lucide-react'
import { cookies } from 'next/headers'

function SettingsLoading() {
  return (
    <div className="flex items-center justify-center py-20">
      <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
    </div>
  )
}

export default function SeriesSettingsPage() {
  return (
    <Suspense fallback={<SettingsLoading />}>
      <SeriesSettingsClient />
    </Suspense>
  )
}
