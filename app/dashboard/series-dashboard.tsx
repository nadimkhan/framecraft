"use client"

import { useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { PageHeader } from "@/components/page-header"
import { Plus, Settings, BookOpen, Upload, Trash2, MoreVertical } from "lucide-react"
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

type Niche = { id: number; category: string; slug: string; description?: string | null }
type Series = {
  id: string; seriesName: string; slug: string; description?: string | null
  niche: Niche
  artStyle?: { id: number; name: string } | null
  voiceStyle?: { id: number; name: string } | null
  backgroundMusicIds: number[]
  _count: { sceneStyles: number }
  onboardingCompleted: boolean
}

function CreateDialog({ niches, open, onOpenChange }: { niches: Niche[]; open: boolean; onOpenChange: (o: boolean) => void }) {
  const [name, setName] = useState("")
  const [nicheId, setNicheId] = useState(niches[0]?.id || 0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setLoading(true)
    setError("")
    const slug = name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "")
    try {
      const res = await fetch("/api/settings/series", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seriesName: name, slug, nicheId }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || "Failed"); return }
      window.location.reload()
    } catch { setError("Network error") } finally { setLoading(false) }
  }

  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-card rounded-lg p-6 w-full max-w-md border shadow-xl">
        <h2 className="text-xl font-bold mb-4">New Channel / Series</h2>
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label className="text-sm font-medium mb-1 block">Channel / Series Name</label>
            <input
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              placeholder="e.g. Horror Short Stories"
              value={name}
              onChange={e => setName(e.target.value)}
              autoFocus
              required
            />
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">Niche Category</label>
            <select
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              value={nicheId}
              onChange={e => setNicheId(Number(e.target.value))}
            >
              {niches.map(n => (
                <option key={n.id} value={n.id}>{n.category}</option>
              ))}
            </select>
          </div>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <div className="flex gap-2 justify-end">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={loading}>{loading ? "Creating..." : "Create"}</Button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function SeriesDashboard({ initialSeries, niches }: { initialSeries: Series[]; niches: Niche[] }) {
  // Only show channels the user actually created (onboardingCompleted = true)
  const [series, setSeries] = useState(initialSeries.filter(s => s.onboardingCompleted))
  const [createOpen, setCreateOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Series | null>(null)

  async function handleDelete() {
    if (!deleteTarget) return
    await fetch(`/api/settings/series/${deleteTarget.id}`, { method: "DELETE" })
    setSeries(prev => prev.filter(s => s.id !== deleteTarget.id))
    setDeleteTarget(null)
  }

  return (
    <div className="flex-1 min-w-0 flex flex-col">
      <PageHeader
        title="My Channels"
        description={`${series.length} channel${series.length !== 1 ? "s" : ""}`}
        actions={
          <Button className="gap-2" onClick={() => setCreateOpen(true)}>
            <Plus className="w-4 h-4" />
            New Channel
          </Button>
        }
      />
      <div className="flex-1 px-6 py-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {series.map(s => (
          <Card key={s.id} className="relative group">
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <CardTitle className="text-lg truncate">{s.seriesName}</CardTitle>
                  <CardDescription className="text-xs mt-0.5">
                    {s.niche.category}
                  </CardDescription>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                      <MoreVertical className="w-4 h-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      className="text-red-500 cursor-pointer"
                      onSelect={() => setDeleteTarget(s)}
                    >
                      <Trash2 className="w-4 h-4 mr-2" /> Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-1.5 text-xs">
                {s.artStyle && (
                  <span className="px-2 py-0.5 rounded-full bg-muted">Art: {s.artStyle.name}</span>
                )}
                {s.voiceStyle && (
                  <span className="px-2 py-0.5 rounded-full bg-muted">Voice: {s.voiceStyle.name}</span>
                )}
                {s.backgroundMusicIds?.length > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-muted">
                    Music: {s.backgroundMusicIds.length} track{s.backgroundMusicIds.length > 1 ? "s" : ""}
                  </span>
                )}
              </div>
              <div className="flex gap-2">
                <Link href={`/dashboard/series-settings?id=${s.id}`} className="flex-1">
                  <Button variant="outline" size="sm" className="w-full gap-1.5">
                    <Settings className="w-3.5 h-3.5" /> Settings
                  </Button>
                </Link>
                <Link href={`/dashboard/topics?seriesId=${s.id}`} className="flex-1">
                  <Button variant="outline" size="sm" className="w-full gap-1.5">
                    <BookOpen className="w-3.5 h-3.5" /> Topics
                  </Button>
                </Link>
                <Link href={`/dashboard/uploads?seriesId=${s.id}`} className="flex-1">
                  <Button variant="outline" size="sm" className="w-full gap-1.5">
                    <Upload className="w-3.5 h-3.5" /> Uploads
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <CreateDialog niches={niches} open={createOpen} onOpenChange={setCreateOpen} />

      <Dialog open={!!deleteTarget} onOpenChange={o => !o && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this channel?</DialogTitle>
            <DialogDescription>
              This will delete "{deleteTarget?.seriesName}" and all its topics and videos. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button className="bg-red-500 hover:bg-red-600" onClick={handleDelete}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    </div>
  )
}
