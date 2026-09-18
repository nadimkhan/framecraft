import { Suspense } from 'react'
import NicheSettingsClient from './niche-settings-client'
import { Card } from '@/components/ui/card'
import { Loader2 } from 'lucide-react'

function SettingsLoading() {
  return (
    <div className="flex items-center justify-center py-20">
      <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
    </div>
  )
}

export default function NicheSettingsPage() {
  return (
    <Suspense fallback={<SettingsLoading />}>
      <NicheSettingsClient />
    </Suspense>
  )
}
