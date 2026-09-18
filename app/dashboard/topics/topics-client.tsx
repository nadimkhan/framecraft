"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import {
  Tabs, TabsContent, TabsList, TabsTrigger,
} from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import {
  Loader2, Search, Sparkles, Youtube, Bot, Play, CheckCircle2,
  Trash2, Save, RotateCcw, ExternalLink, Eye, EyeOff, Clock, BarChart2,
} from "lucide-react"

// ─── Types ──────────────────────────────────────────────────────────────────

interface YouTubeResult {
  videoId: string
  title: string
  duration: number
  views: number
  url: string
  viewsFormatted: string
  durationFormatted: string
  transcript?: string
  selected: boolean
}

interface GeneratedTopic {
  title: string
  fullStory: string
  selected: boolean
}

interface SavedTopic {
  id: number
  title: string
  fullStory: string | null
  sourceType: string
  sourceViews: number | null
  sourceDuration: number | null
  sourceUrl: string | null
  sourceTranscript: string | null
  batchId: number
  selected: boolean
  reviewCompleted: boolean
  isExistingVideo: boolean
  createdAt?: string
}

interface Series {
  id: string
  seriesName: string
  nicheId: number
  niche: { id: number; category: string }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatDuration(s: number) {
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${m}:${sec.toString().padStart(2, "0")}`
}

// ─── Component ─────────────────────────────────────────────────────────────

interface TopicsClientProps {
  seriesId?: string
}

export default function TopicsClient({ seriesId: initialSeriesId }: TopicsClientProps) {
  const [seriesList, setSeriesList] = useState<Series[]>([])
  const [selectedSeriesId, setSelectedSeriesId] = useState<string>(initialSeriesId || "")
  const [contentTab, setContentTab] = useState<"shorts" | "longform">("shorts")
  const [sourceMode, setSourceMode] = useState<"youtube" | "ai">("ai")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // YouTube state
  const [searchQuery, setSearchQuery] = useState("")
  const [ytResults, setYtResults] = useState<YouTubeResult[]>([])
  const [selectAllYt, setSelectAllYt] = useState(false)
  const [transcriptLoading, setTranscriptLoading] = useState<string | null>(null)
  const [transcriptModal, setTranscriptModal] = useState<{ videoId: string; title: string; transcript: string } | null>(null)
  const [storyModal, setStoryModal] = useState<{ title: string; story: string } | null>(null)
  const [batchLoading, setBatchLoading] = useState(false)
  const [batchProgress, setBatchProgress] = useState({ current: 0, total: 0 })

  // AI state
  const [days, setDays] = useState(7)
  const [videosPerDay, setVideosPerDay] = useState(2)
  const [aiTopics, setAiTopics] = useState<GeneratedTopic[]>([])
  const [selectAllAi, setSelectAllAi] = useState(false)

  // Save / Batch state
  const [saving, setSaving] = useState(false)
  const [savedTopics, setSavedTopics] = useState<SavedTopic[]>([])
  const [showSaved, setShowSaved] = useState(false)
  const [addToBatchOpen, setAddToBatchOpen] = useState(false)
  const [batchName, setBatchName] = useState("")
  const [batches, setBatches] = useState<{ id: number; name: string }[]>([])

  // Per-topic regeneration state
  const [regenerating, setRegenerating] = useState<Set<number>>(new Set())

  // Save modal: pick batch (existing or new) before saving
  const [saveModalOpen, setSaveModalOpen] = useState(false)
  const [saveBatchChoice, setSaveBatchChoice] = useState<"new" | "existing">("new")
  const [saveExistingBatchId, setSaveExistingBatchId] = useState<string>("")
  const [saveNewBatchName, setSaveNewBatchName] = useState("")
  const [existingBatches, setExistingBatches] = useState<{ id: number; name: string; topicCount: number }[]>([])
  const [loadingTranscriptFor, setLoadingTranscriptFor] = useState<number | null>(null)
  const [selectedBatchId, setSelectedBatchId] = useState<string>("")
  const [addingToBatch, setAddingToBatch] = useState(false)

  // ─── Load Series list ────────────────────────────────────────────────────
  useEffect(() => {
    fetch("/api/settings/series")
      .then(r => r.json())
      .then(d => {
        const series = d.series || []
        setSeriesList(series)
        if (!selectedSeriesId && series.length > 0) {
          setSelectedSeriesId(series[0].id)
        }
      })
      .catch(() => setError("Failed to load channels"))
  }, [])

  // ─── YouTube Search ─────────────────────────────────────────────────────
  const handleYtSearch = async () => {
    if (!searchQuery.trim()) return
    setLoading(true)
    setError(null)
    setAiTopics([])
    try {
      const res = await fetch(
        `/api/topics/youtube-search?q=${encodeURIComponent(searchQuery)}&duration=${contentTab === "shorts" ? "short" : "long"}`
      )
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Search failed")
      setYtResults(
        (data.videos || []).map((v: any) => ({ ...v, selected: false, transcript: "" }))
      )
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // ─── Batch transcript fetch ──────────────────────────────────────────────
  const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))

  const batchLoadTranscripts = async () => {
    const toFetch = ytResults.filter(r => r.selected && !r.transcript)
    if (toFetch.length === 0) return

    setBatchLoading(true)
    setBatchProgress({ current: 0, total: toFetch.length })

    const RATE_LIMIT_MS = 3000 // 3s between requests to avoid hitting YouTube/yt-dlp rate limits
    let done = 0
    let errors = 0

    for (const video of toFetch) {
      setTranscriptLoading(video.videoId)
      try {
        const res = await fetch("/api/topics/transcript", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ videoId: video.videoId }),
        })
        const data = await res.json()
        if (data.ok === false) {
          errors++
          console.warn(`[batch] ${video.videoId} failed:`, data.error)
        } else if (data.transcript) {
          setYtResults(prev =>
            prev.map(v => v.videoId === video.videoId ? { ...v, transcript: data.transcript } : v)
          )
        }
      } catch (err: any) {
        errors++
        console.warn(`[batch] ${video.videoId} error:`, err.message)
      }
      done++
      setBatchProgress({ current: done, total: toFetch.length })
      // Rate-limit pause between requests (skip after the last one)
      if (done < toFetch.length) {
        await sleep(RATE_LIMIT_MS)
      }
    }

    setTranscriptLoading(null)
    setBatchLoading(false)
    setBatchProgress({ current: 0, total: 0 })
    if (errors > 0) {
      setError(`${toFetch.length - errors}/${toFetch.length} transcripts loaded. ${errors} failed.`)
    }
  }

  // ─── Transcript fetch ────────────────────────────────────────────────────
  const fetchTranscript = async (videoId: string) => {
    setTranscriptLoading(videoId)
    try {
      const res = await fetch("/api/topics/transcript", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoId }),
      })
      const data = await res.json()
      // Route always returns 200 now; check ok flag instead
      if (data.ok === false) {
        setError(data.error || "Transcript failed")
        return
      }
      if (data.transcript) {
        setYtResults(prev =>
          prev.map(v => v.videoId === videoId ? { ...v, transcript: data.transcript } : v)
        )
      } else {
        setError("Transcript script returned no transcript")
      }
    } catch (err: any) {
      setError(err.message || "Network error")
    } finally {
      setTranscriptLoading(null)
    }
  }

  const toggleYtSelect = (videoId: string) => {
    setYtResults(prev =>
      prev.map(v => v.videoId === videoId ? { ...v, selected: !v.selected } : v)
    )
  }

  const toggleAllYt = (checked: boolean) => {
    setYtResults(prev => prev.map(v => ({ ...v, selected: checked })))
    setSelectAllYt(checked)
  }

  // ─── AI Generation ───────────────────────────────────────────────────────
  const handleAiGenerate = async () => {
    if (!selectedSeriesId) { setError("Select a channel first"); return }
    const series = seriesList.find(s => s.id === selectedSeriesId)
    if (!series) return
    setLoading(true)
    setError(null)
    setYtResults([])
    try {
      const res = await fetch("/api/topics/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          niche: series.nicheId,
          nicheName: series.niche.category,
          count: days * videosPerDay,
          contentMode: contentTab === "longform" ? "long_form" : "shorts",
          seriesId: selectedSeriesId,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Generation failed")
      setAiTopics(
        (data.topics || []).map((t: any) => ({ ...t, selected: false }))
      )
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const toggleAiSelect = (idx: number) => {
    setAiTopics(prev => prev.map((t, i) => i === idx ? { ...t, selected: !t.selected } : t))
  }

  const toggleAllAi = (checked: boolean) => {
    setAiTopics(prev => prev.map(t => ({ ...t, selected: checked })))
    setSelectAllAi(checked)
  }

  // ─── Save Topics ─────────────────────────────────────────────────────────
  const openSaveModal = async () => {
    const ytSelected = ytResults.filter(r => r.selected)
    const aiSelected = aiTopics.filter(t => t.selected)
    if (ytSelected.length + aiSelected.length === 0) { setError("Select items to save"); return }
    if (!selectedSeriesId) { setError("Select a channel first"); return }

    // Fetch existing batches for this series
    try {
      const res = await fetch(`/api/topics/batches?seriesId=${selectedSeriesId}`)
      const data = await res.json()
      setExistingBatches(data.batches || [])
    } catch {
      setExistingBatches([])
    }

    // Default new batch name from first selected
    const firstTitle = ytSelected[0]?.title || aiSelected[0]?.title || "New Batch"
    setSaveNewBatchName(firstTitle.slice(0, 80))
    setSaveBatchChoice("new")
    setSaveExistingBatchId("")
    setSaveModalOpen(true)
  }

  const confirmSave = async () => {
    const ytSelected = ytResults.filter(r => r.selected)
    const aiSelected = aiTopics.filter(t => t.selected)

    const toSave = [
      ...ytSelected.map(v => ({
        title: v.title,
        fullStory: v.transcript || null,
        sourceType: "youtube" as const,
        sourceUrl: v.url,
        sourceViews: v.views,
        sourceDuration: v.duration,
        sourceTranscript: v.transcript || null,
      })),
      ...aiSelected.map(t => ({
        title: t.title,
        fullStory: t.fullStory,
        sourceType: "ai" as const,
      })),
    ]

    if (saveBatchChoice === "existing" && !saveExistingBatchId) {
      setError("Pick a batch or choose New Batch")
      return
    }

    setSaving(true)
    setError(null)
    try {
      const body: any = { topics: toSave, seriesId: selectedSeriesId }
      if (saveBatchChoice === "existing") {
        body.batchId = parseInt(saveExistingBatchId)
      } else {
        body.batchName = saveNewBatchName.trim() || toSave[0].title.slice(0, 100)
      }

      const res = await fetch("/api/topics/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Save failed")
      setSaveModalOpen(false)
      // Refresh saved topics
      const saved = await fetch(`/api/topics/series/${selectedSeriesId}`).then(r => r.json())
      setSavedTopics(saved.topics || [])
      setShowSaved(true)
      setYtResults([])
      setAiTopics([])
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  // ─── Generate transcript for an already-saved topic ──────────────────────
  const generateTranscriptForSaved = async (topic: SavedTopic) => {
    if (!topic.sourceUrl) {
      setError("No source URL on this topic")
      return
    }
    // Extract video ID from sourceUrl
    const match = topic.sourceUrl.match(/[?&]v=([\w-]{11})/)
    const videoId = match ? match[1] : ""
    if (!videoId) {
      setError("Could not extract video ID from URL")
      return
    }

    setLoadingTranscriptFor(topic.id)
    setError(null)
    try {
      const res = await fetch("/api/topics/transcript", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoId }),
      })
      const data = await res.json()
      if (data.ok === false) {
        setError(data.error || "Transcript generation failed")
        return
      }
      if (!data.transcript) {
        setError("Transcript script returned no transcript")
        return
      }

      // Persist transcript to DB
      const upRes = await fetch(`/api/topics/${topic.id}/transcript`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceTranscript: data.transcript,
          fullStory: data.transcript,
        }),
      })
      if (!upRes.ok) {
        const errData = await upRes.json().catch(() => ({}))
        setError(errData.error || "Failed to save transcript to DB")
        return
      }

      // Update local state
      setSavedTopics(prev =>
        prev.map(t => t.id === topic.id
          ? { ...t, sourceTranscript: data.transcript, fullStory: data.transcript }
          : t
        )
      )
    } catch (err: any) {
      setError(err.message || "Network error")
    } finally {
      setLoadingTranscriptFor(null)
    }
  }

  // ─── Load saved topics ───────────────────────────────────────────────────
  useEffect(() => {
    if (selectedSeriesId) {
      fetch(`/api/topics/series/${selectedSeriesId}`)
        .then(r => r.json())
        .then(d => setSavedTopics(d.topics || []))
        .catch(() => {})
    }
  }, [selectedSeriesId])

  // ─── Add to batch ────────────────────────────────────────────────────────
  const handleAddToBatch = async () => {
    if (!batchName.trim()) { setError("Batch name required"); return }
    setAddingToBatch(true)
    setError(null)
    try {
      // Create batch
      const cr = await fetch("/api/batches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: batchName,
          description: `From topics — ${savedTopics.length} items`,
          contentMode: contentTab === "longform" ? "long_form" : "single",
        }),
      })
      if (!cr.ok) throw new Error("Failed to create batch")
      const batch = await cr.json()
      // Attach topics to batch
      await fetch(`/api/topics/batch/${batch.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topicIds: savedTopics.map((t: SavedTopic) => t.id) }),
      })
      setAddToBatchOpen(false)
      setBatchName("")
      setSavedTopics([])
      alert(`Added ${savedTopics.length} topics to batch "${batchName}"`)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setAddingToBatch(false)
    }
  }

  const selectedCount = ytResults.filter(r => r.selected).length + aiTopics.filter(t => t.selected).length

  return (
    <div className="space-y-6">

      {/* ─── Channel Selector + Tab Bar ─────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Channel</Label>
          <Select value={selectedSeriesId} onValueChange={setSelectedSeriesId}>
            <SelectTrigger className="w-64">
              <SelectValue placeholder="Select channel" />
            </SelectTrigger>
            <SelectContent>
              {seriesList.map(s => (
                <SelectItem key={s.id} value={s.id}>
                  {s.seriesName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Tabs value={contentTab} onValueChange={(v) => setContentTab as any} className="mt-5">
          <TabsList>
            <TabsTrigger value="shorts">Shorts</TabsTrigger>
            <TabsTrigger value="longform">Long Story</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* ─── Source Mode ─────────────────────────────────────────────────── */}
      <div className="flex gap-3">
        <Button
          variant={sourceMode === "youtube" ? "default" : "outline"}
          onClick={() => setSourceMode("youtube")}
          className="gap-2"
        >
          <Youtube className="w-4 h-4" /> YouTube
        </Button>
        <Button
          variant={sourceMode === "ai" ? "default" : "outline"}
          onClick={() => setSourceMode("ai")}
          className="gap-2"
        >
          <Bot className="w-4 h-4" /> AI Generate
        </Button>
      </div>

      {/* ─── Error ──────────────────────────────────────────────────────── */}
      {error && (
        <div className="px-3 py-2 rounded bg-red-500/10 border border-red-500/30 text-sm text-red-600">
          {error}
          <button className="ml-2 underline" onClick={() => setError(null)}>Dismiss</button>
        </div>
      )}

      {/* ─── YOUTUBE MODE ───────────────────────────────────────────────── */}
      {sourceMode === "youtube" && (
        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-center gap-3">
              <div className="flex-1 flex gap-2">
                <Input
                  placeholder={`Search YouTube for ${contentTab === "shorts" ? "shorts" : "long-form videos"}...`}
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleYtSearch()}
                  className="flex-1"
                />
                <Button onClick={handleYtSearch} disabled={loading || !searchQuery.trim()}>
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                  Search
                </Button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Searches trending videos via yt-dlp. Click a row to load its transcript.
            </p>
          </CardHeader>

          {ytResults.length > 0 && (
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">
                  {ytResults.filter(r => r.selected).length} of {ytResults.length} selected
                </span>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => toggleAllYt(!selectAllYt)}
                    disabled={batchLoading}
                  >
                    {selectAllYt ? "Deselect All" : "Select All"}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={batchLoadTranscripts}
                    disabled={batchLoading || ytResults.filter(r => r.selected && !r.transcript).length === 0}
                  >
                    {batchLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Loading {batchProgress.current}/{batchProgress.total}…
                      </>
                    ) : (
                      <>
                        <Play className="w-4 h-4" />
                        Batch Load Story ({ytResults.filter(r => r.selected && !r.transcript).length})
                      </>
                    )}
                  </Button>
                  <Button
                    size="sm"
                    onClick={openSaveModal}
                    disabled={saving || selectedCount === 0}
                  >
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    Save Selected ({selectedCount})
                  </Button>
                </div>
              </div>

              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10"></TableHead>
                      <TableHead>Title</TableHead>
                      <TableHead className="w-20">Duration</TableHead>
                      <TableHead className="w-24">Views</TableHead>
                      <TableHead className="w-32">Transcript</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {ytResults.map(v => (
                      <TableRow key={v.videoId} className={v.selected ? "bg-primary/5" : ""}>
                        <TableCell>
                          <Checkbox
                            checked={v.selected}
                            onCheckedChange={() => toggleYtSelect(v.videoId)}
                          />
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1">
                            <a
                              href={v.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="font-medium hover:underline text-sm flex items-center gap-1"
                            >
                              {v.title}
                              <ExternalLink className="w-3 h-3 inline" />
                            </a>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="font-mono text-xs">
                            <Clock className="w-3 h-3 mr-1" />
                            {v.durationFormatted}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm flex items-center gap-1">
                            <BarChart2 className="w-3 h-3 text-muted-foreground" />
                            {v.viewsFormatted}
                          </span>
                        </TableCell>
                        <TableCell>
                          {transcriptLoading === v.videoId ? (
                            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                          ) : v.transcript ? (
                            v.transcript.startsWith('[AUDIO:') ? (
                              <span className="text-xs text-green-600 flex items-center gap-1">
                                <CheckCircle2 className="w-4 h-4" />
                                Audio Saved
                              </span>
                            ) : (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setTranscriptModal({ videoId: v.videoId, title: v.title, transcript: v.transcript! })}
                            >
                              <Eye className="w-4 h-4" />
                              View Full
                            </Button>
                            )
                          ) : (
                            <Button variant="outline" size="sm" onClick={() => fetchTranscript(v.videoId)}>
                              Load
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          )}

          {!loading && ytResults.length === 0 && (
            <CardContent className="text-center py-10 text-muted-foreground text-sm">
              Search YouTube to discover trending videos in your niche.
              Results show title, duration, views, and transcript.
            </CardContent>
          )}
        </Card>
      )}

      {/* ─── AI MODE ────────────────────────────────────────────────────── */}
      {sourceMode === "ai" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Sparkles className="w-4 h-4" />
              AI Story Generation
            </CardTitle>
            <div className="flex flex-wrap gap-3 mt-3">
              <div className="space-y-1">
                <Label className="text-xs">Days</Label>
                <Input
                  type="number"
                  min={1}
                  max={30}
                  value={days}
                  onChange={e => setDays(parseInt(e.target.value) || 1)}
                  className="w-20"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Videos/day</Label>
                <Input
                  type="number"
                  min={1}
                  max={10}
                  value={videosPerDay}
                  onChange={e => setVideosPerDay(parseInt(e.target.value) || 1)}
                  className="w-20"
                />
              </div>
              <div className="flex items-end">
                <Button onClick={handleAiGenerate} disabled={loading || !selectedSeriesId}>
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  Generate {days * videosPerDay} Topics
                </Button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              AI generates {contentTab === "shorts" ? "50-60s" : "2-5 min"} titles + full stories
              based on your channel&apos;s niche.
            </p>
          </CardHeader>

          {aiTopics.length > 0 && (
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">
                  {aiTopics.filter(t => t.selected).length} of {aiTopics.length} selected
                </span>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => toggleAllAi(!selectAllAi)}>
                    {selectAllAi ? "Deselect All" : "Select All"}
                  </Button>
                  <Button size="sm" onClick={openSaveModal} disabled={saving || selectedCount === 0}>
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    Save Selected ({selectedCount})
                  </Button>
                </div>
              </div>

              <div className="space-y-3">
                {aiTopics.map((topic, idx) => (
                  <div
                    key={idx}
                    className={`border rounded-lg p-4 transition-colors ${topic.selected ? "border-primary bg-primary/5" : ""}`}
                  >
                    <div className="flex items-start gap-3">
                      <Checkbox
                        checked={topic.selected}
                        onCheckedChange={() => toggleAiSelect(idx)}
                        className="mt-1"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <h3 className="font-semibold text-base">{topic.title}</h3>
                          <Badge variant="outline" className="text-xs shrink-0">
                            {contentTab === "shorts" ? "Short" : "Long"}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground leading-relaxed">
                          {topic.fullStory.length > 300
                            ? topic.fullStory.slice(0, 300) + "..."
                            : topic.fullStory}
                        </p>
                        {topic.fullStory.length > 300 && (
                          <button
                            type="button"
                            onClick={() => setStoryModal({ title: topic.title, story: topic.fullStory })}
                            className="text-xs text-primary mt-1 underline"
                          >
                            Read full story
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          )}

          {!loading && aiTopics.length === 0 && (
            <CardContent className="text-center py-10 text-muted-foreground text-sm">
              Set days and videos/day, then click Generate to create AI stories.
            </CardContent>
          )}
        </Card>
      )}

      {/* ─── Saved Topics + Add to Batch ─────────────────────────────────── */}
      {savedTopics.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-green-500" />
                Saved Topics ({savedTopics.length})
              </CardTitle>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setSavedTopics([])}>
                  <Trash2 className="w-4 h-4 mr-1" /> Clear
                </Button>
                <Button size="sm" onClick={() => setAddToBatchOpen(true)}>
                  <Play className="w-4 h-4 mr-1" /> Add to Batch
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {savedTopics.slice(0, 10).map(t => (
                <div key={t.id} className="text-sm py-2 border-b last:border-0 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-medium flex-1 truncate">{t.title}</span>
                    <div className="flex items-center gap-2 ml-3">
                      {t.sourceType === "youtube" && (
                        <Badge variant="outline" className="text-xs gap-1">
                          <Youtube className="w-3 h-3" /> YouTube
                        </Badge>
                      )}
                      {t.sourceType === "ai" && (
                        <Badge variant="outline" className="text-xs gap-1">
                          <Bot className="w-3 h-3" /> AI
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    {t.sourceType === "youtube" && t.sourceUrl && (
                      <a
                        href={t.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-blue-600 hover:underline"
                      >
                        <ExternalLink className="w-3 h-3" /> Watch
                      </a>
                    )}
                    {t.sourceViews != null && (
                      <span className="flex items-center gap-1">
                        <BarChart2 className="w-3 h-3" />
                        {t.sourceViews >= 1_000_000
                          ? `${(t.sourceViews / 1_000_000).toFixed(1)}M`
                          : t.sourceViews >= 1_000
                            ? `${(t.sourceViews / 1_000).toFixed(1)}K`
                            : t.sourceViews} views
                      </span>
                    )}
                    {t.sourceDuration != null && (
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {Math.floor(t.sourceDuration / 60)}:{(t.sourceDuration % 60).toString().padStart(2, '0')}
                      </span>
                    )}
                    {t.fullStory && (
                      <button
                        type="button"
                        onClick={() => setStoryModal({ title: t.title, story: t.fullStory! })}
                        className="flex items-center gap-1 text-xs text-purple-600 hover:underline"
                      >
                        📖 View story ({t.fullStory.length} chars)
                      </button>
                    )}
                    {t.sourceTranscript ? (
                      <button
                        type="button"
                        onClick={() => setTranscriptModal({
                          videoId: `db-${t.id}`,
                          title: t.title,
                          transcript: t.sourceTranscript!,
                        })}
                        className="flex items-center gap-1 text-xs text-blue-600 hover:underline"
                      >
                        🎤 View transcript ({t.sourceTranscript.length} chars)
                      </button>
                    ) : t.sourceType === "youtube" && t.sourceUrl ? (
                      <button
                        type="button"
                        onClick={() => generateTranscriptForSaved(t)}
                        disabled={transcriptLoading === `db-${t.id}` || loadingTranscriptFor === t.id}
                        className="flex items-center gap-1 text-xs text-green-600 hover:underline disabled:opacity-50"
                      >
                        {loadingTranscriptFor === t.id ? (
                          <>
                            <Loader2 className="w-3 h-3 animate-spin" />
                            Generating transcript…
                          </>
                        ) : (
                          <>🎤 Generate transcript</>
                        )}
                      </button>
                    ) : null}
                    <span className="ml-auto">Batch #{t.batchId}</span>
                  </div>
                </div>
              ))}
              {savedTopics.length > 10 && (
                <p className="text-xs text-muted-foreground text-center pt-1">
                  +{savedTopics.length - 10} more topics
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ─── Story Modal (AI generated) ───────────────────────────────────── */}
      <Dialog open={!!storyModal} onOpenChange={(open) => {
        if (!open) setStoryModal(null)
      }}>
        <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-base">{storyModal?.title}</DialogTitle>
            <DialogDescription className="text-xs">Full story</DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto">
            {storyModal && (
              <p className="text-sm whitespace-pre-wrap leading-relaxed">
                {storyModal.story}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setStoryModal(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Transcript Modal ─────────────────────────────────────────────── */}
      <Dialog open={!!transcriptModal} onOpenChange={(open) => {
        if (!open) setTranscriptModal(null)
      }}>
        <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-base">Transcript (editable)</DialogTitle>
            <DialogDescription className="text-xs">{transcriptModal?.title}</DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto">
            {transcriptModal && !transcriptModal.transcript.startsWith('[AUDIO:') && (
              <textarea
                className="w-full min-h-[400px] text-sm leading-relaxed p-3 border rounded-md bg-background resize-y focus:outline-none focus:ring-2 focus:ring-ring"
                value={transcriptModal.transcript}
                onChange={(e) => {
                  const value = e.target.value
                  setTranscriptModal({ ...transcriptModal, transcript: value })
                  // Sync back to ytResults so edits persist
                  setYtResults(prev =>
                    prev.map(v => v.videoId === transcriptModal.videoId ? { ...v, transcript: value } : v)
                  )
                }}
              />
            )}
            {transcriptModal?.transcript.startsWith('[AUDIO:') && (
              <div className="p-4 text-sm bg-muted rounded">
                <p className="font-medium mb-2">Audio file (no captions available)</p>
                <p className="text-xs text-muted-foreground">
                  The audio has been downloaded for this video. The narrator pipeline will process it later.
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setTranscriptModal(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Save to Batch Modal ─────────────────────────────────────────── */}
      <Dialog open={saveModalOpen} onOpenChange={setSaveModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save Topics to Batch</DialogTitle>
            <DialogDescription>
              Choose an existing batch to add to, or create a new one.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="flex gap-2">
              <Button
                variant={saveBatchChoice === "new" ? "default" : "outline"}
                size="sm"
                className="flex-1"
                onClick={() => setSaveBatchChoice("new")}
              >
                New Batch
              </Button>
              <Button
                variant={saveBatchChoice === "existing" ? "default" : "outline"}
                size="sm"
                className="flex-1"
                onClick={() => setSaveBatchChoice("existing")}
              >
                Existing Batch
              </Button>
            </div>

            {saveBatchChoice === "new" && (
              <div className="space-y-1">
                <Label>Batch Name</Label>
                <Input
                  value={saveNewBatchName}
                  onChange={e => setSaveNewBatchName(e.target.value)}
                  placeholder="e.g., Horror Week 1"
                />
              </div>
            )}

            {saveBatchChoice === "existing" && (
              <div className="space-y-1">
                <Label>Select Batch</Label>
                {existingBatches.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-2">
                    No existing batches for this series. Create a new one instead.
                  </p>
                ) : (
                  <div className="border rounded-md max-h-48 overflow-y-auto">
                    {existingBatches.map(b => (
                      <button
                        key={b.id}
                        type="button"
                        onClick={() => setSaveExistingBatchId(String(b.id))}
                        className={`w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors ${
                          saveExistingBatchId === String(b.id) ? "bg-accent" : ""
                        }`}
                      >
                        <div className="font-medium">{b.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {b.topicCount} topic{b.topicCount !== 1 ? "s" : ""} · Batch #{b.id}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveModalOpen(false)}>Cancel</Button>
            <Button
              onClick={confirmSave}
              disabled={saving || (saveBatchChoice === "existing" && !saveExistingBatchId)}
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {saveBatchChoice === "existing" ? "Add to Batch" : "Create & Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Add to Batch Dialog ─────────────────────────────────────────── */}
      <Dialog open={addToBatchOpen} onOpenChange={setAddToBatchOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add to Batch</DialogTitle>
            <DialogDescription>
              Create a new batch to process {savedTopics.length} topics.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label>Batch Name</Label>
              <Input
                value={batchName}
                onChange={e => setBatchName(e.target.value)}
                placeholder="e.g., Horror Week 1"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddToBatchOpen(false)}>Cancel</Button>
            <Button onClick={handleAddToBatch} disabled={addingToBatch}>
              {addingToBatch ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              Create & Add
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
