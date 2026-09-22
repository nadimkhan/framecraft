"use client"

import { useEffect, useRef, useState } from "react"
import { useSearchParams } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog"
import {
  Plus, Pencil, Trash2, Sparkles, Loader2, AlertTriangle, Play, Pause,
  CheckCircle2, Youtube, Instagram, Music2, Mic, Palette, Wand2,
  Video, Clock, Upload, X, Shuffle, BookOpen, FlaskConical, ExternalLink,
} from "lucide-react"

// ─── Types ────────────────────────────────────────────────────────────────
interface Series {
  id: number
  name: string
  slug: string
  description: string | null
  imageStyle: string
  _count?: { series: number; sceneStyles: number }
  config: ChannelConfig | null
}

interface ChannelConfig {
  id: string
  seriesId: number | null
  artStyleId: number | null
  voiceStyleId: number | null
  /** Multiple selected music tracks. When >1 is set, the video pipeline picks one at random per video. */
  backgroundMusicIds: number[]
  customMusicPaths: string[]
  effectIds: number[]
  youtubeChannelId: string | null
  youtubeChannelName: string | null
  youtubeAccessToken: string | null
  youtubeRefreshToken: string | null
  instagramAccountId: string | null
  instagramAccountName: string | null
  instagramAccessToken: string | null
  lightningEndpoint: string | null
  contentMode: string
  videoDuration: string
  videosPerDay: number
  publishTimes: string[]
  onboardingCompleted: boolean
}

interface SeriesType {
  id: string
  seriesName: string
  slug: string
  description: string | null
  nicheId: number
  artStyleId: number | null
  voiceStyleId: number | null
  backgroundMusicIds: number[]
  effectIds: number[]
  contentMode: string
  videoDuration: string
  videosPerDay: number
  publishTimes: string[]
  onboardingCompleted: boolean
  lightningEndpoint: string | null
  niche: { id: number; category: string; slug: string }
  artStyle: { id: number; name: string; slug: string } | null
  voiceStyle: { id: number; name: string; slug: string } | null
  _count?: { sceneStyles: number }
}


interface VoiceStyle {
  id: number; name: string; slug: string; azureVoiceName: string
  description: string | null; tags: string[]
  sampleAudioUrl: string | null; sampleText: string | null
}

interface ArtStyle {
  id: number; name: string; slug: string; description: string | null
  promptSuffix: string; examplePrompt: string | null
  thumbnailUrl: string | null; previewPrompt: string | null
}

interface BackgroundMusic {
  id: number; name: string; category: string; slug: string
  localPath: string | null; duration: number | null
}

interface Effect {
  id: number; name: string; slug: string; description: string | null
  promptHint: string | null; remotionType: string | null
}

const SHORT_DURATIONS = [
  { value: "short_30_40", label: "30–40s (Short)" },
  { value: "short_50_60", label: "50–60s (Short)" },
  { value: "short_90_120", label: "90–120s (Short)" },
  { value: "short_120_180", label: "2–3 min (Short)" },
]
const LONG_DURATIONS = [
  { value: "long_120_300", label: "2–5 min (Long)" },
  { value: "long_300_600", label: "5–10 min (Long)" },
]
const PUBLISH_HOURS = Array.from({ length: 16 }, (_, i) => {
  const h = i + 6
  return `${h.toString().padStart(2, "0")}:00`
})

// ─── Audio player (lazy-loads voice preview via API) ────────────────────
function useAudioPlayer(setError: (msg: string | null) => void) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [playingId, setPlayingId] = useState<number | null>(null)
  const [progress, setProgress] = useState<Record<number, number>>({})
  const [loadingVoiceId, setLoadingVoiceId] = useState<number | null>(null)
  const [voiceUrls, setVoiceUrls] = useState<Record<number, string>>({})

  const ensureVoiceUrl = async (voiceId: number): Promise<string | null> => {
    if (voiceUrls[voiceId]) return voiceUrls[voiceId]
    setLoadingVoiceId(voiceId)
    try {
      const res = await fetch(`/api/voice-styles/${voiceId}/preview`, { method: "POST" })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "preview failed")
      setVoiceUrls(prev => ({ ...prev, [voiceId]: data.audioUrl }))
      return data.audioUrl as string
    } catch (err: any) {
      setError(`Voice preview failed: ${err.message}`)
      return null
    } finally {
      setLoadingVoiceId(null)
    }
  }

  /**
   * Play a voice preview or a music track.
   * - voice: lazy-fetches the Azure TTS sample from /api/voice-styles/[id]/preview
   * - music: plays the given URL directly (already cached on disk in public/audio/music/)
   */
  const toggle = async (id: number, source: "voice" | "music", url?: string) => {
    if (playingId === id) {
      audioRef.current?.pause()
      setPlayingId(null)
      return
    }
    audioRef.current?.pause()
    let playUrl: string | null | undefined
    if (source === "voice") {
      playUrl = voiceUrls[id] || await ensureVoiceUrl(id)
    } else {
      // music
      playUrl = url
    }
    if (!playUrl) return
    const audio = new Audio(playUrl)
    audio.volume = source === "music" ? 0.4 : 0.6
    audio.onended = () => setPlayingId(null)
    audio.onerror = () => {
      setError(`Could not play audio: ${audio.error?.message || 'unknown error'}`)
      setPlayingId(null)
    }
    audio.ontimeupdate = () => {
      if (audio.duration > 0) {
        setProgress(prev => ({ ...prev, [id]: audio.currentTime / audio.duration }))
      }
    }
    audio.play().catch((err) => {
      setError(`Audio play failed: ${err.message}`)
      setPlayingId(null)
    })
    audioRef.current = audio
    setPlayingId(id)
  }

  return { toggle, playingId, progress, loadingVoiceId, voiceUrls, setVoiceUrls }
}

// ─── Page ────────────────────────────────────────────────────────────────
export default function NicheSettingsPage() {
  const searchParams = useSearchParams()
  const preSelectedId = searchParams.get("id") || searchParams.get("seriesId")
  const [seriesList, setSeriesList] = useState<SeriesType[]>([])
  const [options, setOptions] = useState<{
    voiceStyles: VoiceStyle[]
    artStyles: ArtStyle[]
    backgroundMusic: BackgroundMusic[]
    effects: Effect[]
  }>({ voiceStyles: [], artStyles: [], backgroundMusic: [], effects: [] })
  const [selectedSeriesId, setSelectedSeriesId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [creatingSeries, setCreatingSeries] = useState(false)

  const [newName, setNewName] = useState("")
  const [newSlug, setNewSlug] = useState("")
  const [newDescription, setNewDescription] = useState("")

  const [draft, setDraft] = useState<any>(null)
  const setDraftFromSeries = (s: SeriesType) => {
    setDraft({
      artStyleId: s.artStyleId,
      voiceStyleId: s.voiceStyleId,
      backgroundMusicIds: s.backgroundMusicIds,
      effectIds: s.effectIds,
      contentMode: s.contentMode,
      videoDuration: s.videoDuration,
      videosPerDay: s.videosPerDay,
      publishTimes: s.publishTimes,
      youtubeChannelId: null,
      youtubeChannelName: null,
      youtubeAccessToken: null,
      youtubeRefreshToken: null,
      instagramAccountId: null,
      instagramAccountName: null,
      instagramAccessToken: null,
      lightningEndpoint: s.lightningEndpoint ?? null,
      onboardingCompleted: s.onboardingCompleted,
    })
  }
  const [previewingArt, setPreviewingArt] = useState<number | null>(null)
  const [modalArtUrl, setModalArtUrl] = useState<string | null>(null)
  const [uploadingMusic, setUploadingMusic] = useState(false)
  const musicFileInputRef = useRef<HTMLInputElement>(null)

  const audio = useAudioPlayer(setError)

  // ─── Data loading ────────────────────────────────────────────────────
  const loadAll = async () => {
    try {
      const [nichesRes, optsRes] = await Promise.all([
        fetch("/api/settings/series"),
        fetch("/api/settings/options"),
      ])
      const nichesData = await nichesRes.json()
      const optsData = await optsRes.json()
      if (nichesRes.ok) setSeriesList(nichesData.series || [])
      else setError(nichesData.error || "Failed to load channels")
      if (optsRes.ok) setOptions(optsData)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadAll() }, [])

  useEffect(() => {
    if (seriesList.length > 0 && selectedSeriesId === null) {
      const target = preSelectedId
        ? seriesList.find(s => s.id === preSelectedId) || seriesList[0]
        : seriesList[0]
      if (target) {
        setSelectedSeriesId(target.id)
        setDraftFromSeries(target)
      }
    }
  }, [seriesList, selectedSeriesId, preSelectedId])

  // Handle OAuth flash messages (passed back via URL hash after callback)
  useEffect(() => {
    const hash = window.location.hash
    if (!hash.includes('social_flash=')) return
    const params = new URLSearchParams(hash.slice(1))
    const flashType = params.get('social_flash') as 'success' | 'error'
    const message = params.get('social_message')
    if (flashType === 'success') {
      setSuccess(message || 'Connected successfully!')
      setError(null)
    } else if (flashType === 'error') {
      setError(message || 'Connection failed. Please try again.')
      setSuccess(null)
    }
    // Clean the hash so the message doesn't persist on refresh
    history.replaceState(null, '', window.location.pathname + window.location.search)
    // Refresh the series list so newly connected tokens appear
    setTimeout(() => loadAll(), 500)
  }, [])

  const selectNiche = (id: string) => {
    const s = seriesList.find(x => x.id === id)
    if (!s) return
    setSelectedSeriesId(id)
    setDraftFromSeries(s)
    setError(null)
    setSuccess(null)
  }

  const createSeries = async () => {
    if (!newName.trim()) { setError("Channel name is required"); return }
    setSaving(true)
    setError(null)
    try {
      const res = await fetch("/api/settings/series", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          seriesName: newName.trim(),
          slug: newSlug.trim() || newName.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
          description: newDescription.trim() || null,
          nicheId: 1, // default to Horror
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "create failed")
      setCreatingSeries(false)
      setNewName(""); setNewSlug(""); setNewDescription("")
      await loadAll()
      selectNiche(data.series.id)
      setSuccess(`Created "${data.series.seriesName}"`)
      setTimeout(() => setSuccess(null), 3000)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const deleteSeries = async (s: SeriesType) => {
    if (!confirm(`Delete channel "${s.seriesName}"?`)) return
    try {
      const res = await fetch(`/api/settings/series/${s.id}`, { method: "DELETE" })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "delete failed")
      setSuccess(`Deleted "${s.seriesName}"`)
      setSelectedSeriesId(null)
      setDraft(null)
      await loadAll()
      setTimeout(() => setSuccess(null), 3000)
    } catch (err: any) {
      setError(err.message)
    }
  }

  const setField = (key: string, value: any) => {
    setDraft((prev: any) => prev ? { ...prev, [key]: value } : null)
  }
  const toggleEffect = (effectId: number) => {
    if (!draft) return
    const effectIds = draft.effectIds ?? []
    const has = effectIds.includes(effectId)
    setField("effectIds", has ? effectIds.filter((x: number) => x !== effectId) : [...effectIds, effectId])
  }
  const togglePublishTime = (t: string) => {
    if (!draft) return
    const publishTimes = draft.publishTimes ?? []
    const has = publishTimes.includes(t)
    setField("publishTimes", has ? publishTimes.filter((x: string) => x !== t) : [...publishTimes, t].sort())
  }

  const save = async () => {
    if (!draft || !selectedSeriesId) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/settings/series/${selectedSeriesId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "save failed")
      setSuccess("Settings saved")
      await loadAll()
      setTimeout(() => setSuccess(null), 3000)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const generatePreview = async (artStyleId: number) => {
    setPreviewingArt(artStyleId)
    try {
      const res = await fetch(`/api/art-styles/${artStyleId}/preview`, { method: "POST" })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "preview failed")
      await loadAll()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setPreviewingArt(null)
    }
  }

  const uploadMusicFile = async (file: File) => {
    setUploadingMusic(true)
    setError(null)
    try {
      const fd = new FormData()
      fd.append("file", file)
      fd.append("category", "custom")
      fd.append("name", file.name.replace(/\.[^.]+$/, "").replace(/[-_]/g, " "))
      const res = await fetch("/api/background-music/upload", { method: "POST", body: fd })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "upload failed")
      setSuccess(`Uploaded "${data.music.name}"`)
      await loadAll()
      setField("backgroundMusicIds", [data.music.id])
      setTimeout(() => setSuccess(null), 3000)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setUploadingMusic(false)
      if (musicFileInputRef.current) musicFileInputRef.current.value = ""
    }
  }

  const selectedSeries = seriesList.find(s => s.id === selectedSeriesId) || null
  const isShort = draft?.contentMode !== "long_form"

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="w-5 h-5 mr-2 animate-spin" /> Loading…
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Channel Settings</h1>
          <p className="text-muted-foreground mt-1">
            Configure each channel separately: voice, music, art style, effects, and social accounts.
          </p>
        </div>
        <Dialog open={creatingSeries} onOpenChange={setCreatingSeries}>
          <DialogTrigger asChild>
            <Button className="bg-gradient-to-r from-purple-600 to-pink-600 text-white">
              <Plus className="w-4 h-4 mr-2" /> New Niche
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Channel</DialogTitle>
              <DialogDescription>Add a new YouTube channel to manage.</DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="nn">Name</Label>
                <Input id="nn" value={newName} onChange={(e) => {
                  setNewName(e.target.value)
                  if (!newSlug) setNewSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "-"))
                }} placeholder="Horror Short Stories" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="ns">Slug (URL-safe)</Label>
                <Input id="ns" value={newSlug} onChange={(e) => setNewSlug(e.target.value)} placeholder="horror-short-stories" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="nd">Description</Label>
                <Textarea id="nd" value={newDescription} onChange={(e) => setNewDescription(e.target.value)} placeholder="Dark horror stories, creepy narratives..." rows={2} />
              </div>
              {error && <div className="text-sm text-red-600">{error}</div>}
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setCreatingSeries(false)}>Cancel</Button>
              <Button onClick={createSeries} disabled={saving}>
                {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
                Create
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {success && <div className="px-3 py-2 rounded bg-green-500/10 border border-green-500/30 text-sm text-green-600">{success}</div>}
      {error && <div className="px-3 py-2 rounded bg-red-500/10 border border-red-500/30 text-sm text-red-600">{error}</div>}

      {seriesList.length === 0 ? (
        <Card>
          <CardContent className="text-center py-12">
            <Sparkles className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground mb-4">No channels yet</p>
            <Button onClick={() => setCreatingSeries(true)}><Plus className="w-4 h-4 mr-2" /> Create your first channel</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-6">
          <aside className="space-y-2">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-2">Channels</h2>
            {seriesList.map(s => (
              <div
                key={s.id}
                className={`rounded-lg border transition-colors ${
                  selectedSeriesId === s.id
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/40 hover:bg-accent/50"
                }`}
              >
                <button
                  onClick={() => selectNiche(s.id)}
                  className="w-full text-left p-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-sm">{s.seriesName}</span>
                    {s._count?.sceneStyles !== undefined && <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {s._count?.sceneStyles ?? 0} scene styles
                  </div>
                </button>
                <div className="flex items-center gap-1 px-3 pb-2">
                  <a
                    href={`/dashboard/topics?seriesId=${s.id}`}
                    className="text-[10px] inline-flex items-center gap-1 px-2 py-1 rounded bg-muted hover:bg-muted/70 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <BookOpen className="w-3 h-3" />
                    Topics
                  </a>
                  <a
                    href={`/dashboard/studio?seriesId=${s.id}`}
                    className="text-[10px] inline-flex items-center gap-1 px-2 py-1 rounded bg-muted hover:bg-muted/70 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <FlaskConical className="w-3 h-3" />
                    Studio
                  </a>
                </div>
              </div>
            ))}
          </aside>

          {selectedSeries && draft ? (
            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-xl">{selectedSeries?.seriesName}</CardTitle>
                      <CardDescription>{selectedSeries?.description ?? `Configure voice, art style, music, effects, and social accounts for ${selectedSeries?.seriesName}.`}</CardDescription>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => deleteSeries(selectedSeries)} title="Delete channel">
                      <Trash2 className="h-4 w-4 text-red-600" />
                    </Button>
                  </div>
                </CardHeader>
              </Card>

              {/* 1. Niche */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <span className="bg-primary text-primary-foreground rounded-full w-6 h-6 flex items-center justify-center text-xs">1</span>
                    Niche
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div><span className="text-muted-foreground">Slug:</span> <code className="font-mono">{selectedSeries?.slug}</code></div>
                  <div><span className="text-muted-foreground">Description:</span> {selectedSeries?.description ?? <em>(none)</em>}</div>
                  <div><span className="text-muted-foreground">Default Art Style:</span> <Badge variant="outline">{selectedSeries?.niche?.category}</Badge></div>
                </CardContent>
              </Card>

              {/* 2. Voice */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <span className="bg-primary text-primary-foreground rounded-full w-6 h-6 flex items-center justify-center text-xs">2</span>
                    <Mic className="w-4 h-4" /> Voice (Azure Neural)
                  </CardTitle>
                  <CardDescription>Click ▶ to hear the voice (Azure generates a sample MP3 on first play, then caches).</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {options.voiceStyles.map(v => {
                      const active = draft.voiceStyleId === v.id
                      const isPlaying = audio.playingId === v.id
                      const isLoading = audio.loadingVoiceId === v.id
                      return (
                        <div key={v.id} className={`p-3 rounded-lg border ${active ? "border-primary bg-primary/5" : "border-border"}`}>
                          <div className="flex items-start gap-3">
                            <button
                              type="button"
                              onClick={() => audio.toggle(v.id, "voice")}
                              disabled={isLoading}
                              className={`shrink-0 w-9 h-9 rounded-full flex items-center justify-center transition-colors ${
                                isPlaying ? "bg-primary text-primary-foreground" : "bg-primary/10 hover:bg-primary/20 text-primary"
                              }`}
                              title="Play preview (generates via Azure TTS on first click)"
                            >
                              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                            </button>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-sm">{v.name}</span>
                                {v.tags.includes("male") && <Badge className="bg-blue-500/10 text-blue-600 text-xs">male</Badge>}
                                {v.tags.includes("female") && <Badge className="bg-pink-500/10 text-pink-600 text-xs">female</Badge>}
                                {active && <Badge className="bg-green-500/10 text-green-600 text-xs">Selected</Badge>}
                              </div>
                              <div className="text-xs text-muted-foreground mt-0.5">{v.description}</div>
                              {v.sampleText && <div className="text-xs italic text-muted-foreground mt-1">"{v.sampleText}"</div>}
                              {isPlaying && audio.progress[v.id] !== undefined && (
                                <div className="mt-2 h-1 bg-primary/20 rounded">
                                  <div className="h-1 bg-primary rounded transition-all" style={{ width: `${audio.progress[v.id]! * 100}%` }} />
                                </div>
                              )}
                            </div>
                            <Button size="sm" variant={active ? "default" : "outline"} onClick={() => setField("voiceStyleId", v.id)}>
                              {active ? "Selected" : "Select"}
                            </Button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </CardContent>
              </Card>

              {/* 3. Background Music */}
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base flex items-center gap-2">
                      <span className="bg-primary text-primary-foreground rounded-full w-6 h-6 flex items-center justify-center text-xs">3</span>
                      <Music2 className="w-4 h-4" /> Background Music
                    </CardTitle>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={uploadingMusic}
                      onClick={() => musicFileInputRef.current?.click()}
                    >
                      {uploadingMusic ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Upload className="w-4 h-4 mr-1" />}
                      Upload
                    </Button>
                    <input
                      ref={musicFileInputRef}
                      type="file"
                      accept=".mp3,.wav,.webm,.m4a,.ogg"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0]
                        if (f) uploadMusicFile(f)
                      }}
                    />
                  </div>
                  <CardDescription>Select one or more tracks. With 2+ selected, the video pipeline picks one at random per video. Click ▶ to preview.</CardDescription>
                </CardHeader>
                <CardContent>
                  {draft.backgroundMusicIds.length > 1 && (
                    <div className="mb-2 flex items-center gap-2 text-xs text-primary">
                      <Shuffle className="w-3.5 h-3.5" />
                      <span>{draft.backgroundMusicIds.length} tracks selected — one will be picked at random per video</span>
                    </div>
                  )}
                  <div className="space-y-1 max-h-96 overflow-y-auto">
                    {options.backgroundMusic.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No music available.</p>
                    ) : options.backgroundMusic.map(m => {
                      const active = draft.backgroundMusicIds.includes(m.id)
                      const playUrl = m.localPath ? `/${m.localPath}` : null
                      return (
                        <div key={m.id} className={`flex items-center gap-3 p-2 rounded ${active ? "bg-primary/10" : "hover:bg-accent/30"}`}>
                          <button
                            type="button"
                            onClick={() => {
                              if (playUrl) audio.toggle(m.id, "music", playUrl)
                            }}
                            disabled={!playUrl}
                            className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center bg-primary/10 text-primary"
                          >
                            {audio.playingId === m.id
                              ? <Pause className="w-3 h-3" />
                              : <Play className="w-3 h-3" />}
                          </button>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium truncate">{m.name}</div>
                            <div className="text-xs text-muted-foreground">{m.category}{m.duration ? ` • ${m.duration}s` : ""}</div>
                            {audio.playingId === m.id && (
                              <div className="mt-1 h-1 w-full bg-muted rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-primary transition-all"
                                  style={{ width: `${Math.round((audio.progress[m.id] ?? 0) * 100)}%` }}
                                />
                              </div>
                            )}
                          </div>
                          <Button
                            size="sm"
                            variant={active ? "default" : "outline"}
                            onClick={() => {
                              const next = active
                                ? draft.backgroundMusicIds.filter((x: number) => x !== m.id)
                                : [...draft.backgroundMusicIds, m.id]
                              setField("backgroundMusicIds", next)
                            }}
                          >
                            {active ? "✓" : "Select"}
                          </Button>
                        </div>
                      )
                    })}
                  </div>
                </CardContent>
              </Card>

              {/* 4. Art Style (9:16 portraits) */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <span className="bg-primary text-primary-foreground rounded-full w-6 h-6 flex items-center justify-center text-xs">4</span>
                    <Palette className="w-4 h-4" /> Art Style (9:16)
                  </CardTitle>
                  <CardDescription>Click an empty card to generate a 9:16 preview image. Click an existing image to view full-size.</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                    {options.artStyles.map(s => {
                      const active = draft.artStyleId === s.id
                      const previewing = previewingArt === s.id
                      return (
                        <div key={s.id} className={`rounded-lg border overflow-hidden ${active ? "border-primary ring-2 ring-primary/30" : "border-border"}`}>
                          <button
                            type="button"
                            onClick={() => s.thumbnailUrl ? setModalArtUrl(s.thumbnailUrl) : generatePreview(s.id)}
                            disabled={previewing}
                            className="block w-full aspect-[9/16] bg-muted relative group"
                          >
                            {s.thumbnailUrl ? (
                              <img src={s.thumbnailUrl} alt={s.name} className="w-full h-full object-cover cursor-zoom-in" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-muted-foreground text-xs px-2 text-center">
                                {previewing ? <Loader2 className="w-5 h-5 animate-spin" /> : <span>Click to generate</span>}
                              </div>
                            )}
                            {previewing && (
                              <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                                <Loader2 className="w-6 h-6 animate-spin text-white" />
                              </div>
                            )}
                          </button>
                          <div className="p-2 space-y-1">
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-medium truncate">{s.name}</span>
                              {active && <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />}
                            </div>
                            <Button size="sm" variant={active ? "default" : "outline"} className="w-full" onClick={() => setField("artStyleId", s.id)}>
                              {active ? "Selected" : "Select"}
                            </Button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </CardContent>
              </Card>

              {/* 5. Effects */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <span className="bg-primary text-primary-foreground rounded-full w-6 h-6 flex items-center justify-center text-xs">5</span>
                    <Wand2 className="w-4 h-4" /> Effects (Remotion)
                  </CardTitle>
                  <CardDescription>Multi-select motion effects applied during render.</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {options.effects.map(e => {
                      const active = draft.effectIds.includes(e.id)
                      return (
                        <button
                          key={e.id}
                          type="button"
                          onClick={() => toggleEffect(e.id)}
                          className={`text-left p-3 rounded-lg border transition-colors ${
                            active ? "border-primary bg-primary/5 ring-1 ring-primary/30" : "border-border hover:bg-accent/30"
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-medium text-sm">{e.name}</span>
                            {active && <CheckCircle2 className="w-4 h-4 text-primary" />}
                          </div>
                          <div className="text-xs text-muted-foreground mt-0.5">{e.description}</div>
                        </button>
                      )
                    })}
                  </div>
                </CardContent>
              </Card>

              {/* 6. Social Media */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <span className="bg-primary text-primary-foreground rounded-full w-6 h-6 flex items-center justify-center text-xs">6</span>
                    Social Media
                  </CardTitle>
                  <CardDescription>Per-niche YouTube + Instagram accounts.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="flex items-center gap-2">
                        <Youtube className="w-4 h-4 text-red-600" /> YouTube Channel
                      </Label>
                      {draft.youtubeChannelId ? (
                        <span className="text-xs text-green-600 flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" /> {draft.youtubeChannelName || draft.youtubeChannelId}
                        </span>
                      ) : (
                        <button
                          onClick={() => window.location.href = `/api/oauth/youtube/start?seriesId=${selectedSeriesId}`}
                          className="text-xs px-2 py-1 rounded bg-red-50 text-red-600 hover:bg-red-100 border border-red-200"
                        >
                          Connect YouTube
                        </button>
                      )}
                    </div>
                    {draft.youtubeChannelId ? (
                      <div className="rounded-md bg-green-50 border border-green-200 p-2 space-y-1">
                        <div className="text-xs">
                          <span className="text-muted-foreground">Channel ID: </span>
                          <span className="font-mono">{draft.youtubeChannelId}</span>
                        </div>
                        {draft.youtubeAccessToken && (
                          <div className="text-xs text-green-700 flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" /> Token configured — ready to upload
                          </div>
                        )}
                        {!draft.youtubeAccessToken && (
                          <div className="text-xs text-amber-600">
                            No access token — click Connect above to authorize
                          </div>
                        )}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        Connect via OAuth to enable one-click YouTube publishing. No token pasting needed.
                      </p>
                    )}
                  </div>
                  <div className="space-y-2 pt-2 border-t">
                    <div className="flex items-center justify-between">
                      <Label className="flex items-center gap-2">
                        <Instagram className="w-4 h-4 text-pink-500" /> Instagram Account
                      </Label>
                      {draft.instagramAccountId ? (
                        <span className="text-xs text-green-600 flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" /> @{draft.instagramAccountName || draft.instagramAccountId}
                        </span>
                      ) : (
                        <button
                          onClick={() => window.location.href = `/api/oauth/instagram/start?seriesId=${selectedSeriesId}`}
                          className="text-xs px-2 py-1 rounded bg-pink-50 text-pink-600 hover:bg-pink-100 border border-pink-200"
                        >
                          Connect Instagram
                        </button>
                      )}
                    </div>
                    {draft.instagramAccountId ? (
                      <div className="rounded-md bg-green-50 border border-green-200 p-2 space-y-1">
                        <div className="text-xs">
                          <span className="text-muted-foreground">Account ID: </span>
                          <span className="font-mono">{draft.instagramAccountId}</span>
                        </div>
                        {draft.instagramAccessToken && (
                          <div className="text-xs text-green-700 flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" /> Token configured — ready to upload
                          </div>
                        )}
                        {!draft.instagramAccessToken && (
                          <div className="text-xs text-amber-600">
                            No access token — click Connect above to authorize
                          </div>
                        )}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        Connect via OAuth to enable one-click Instagram Reel publishing.
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* 6.5 Lightning AI Video */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <span className="bg-primary text-primary-foreground rounded-full w-6 h-6 flex items-center justify-center text-xs font-normal">6.5</span>
                    <Wand2 className="w-4 h-4" /> Lightning AI Video
                  </CardTitle>
                  <CardDescription>LTX-Video Gradio endpoint. Changes each time Lightning restarts.</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <Label>Gradio Endpoint URL</Label>
                    <div className="flex gap-2">
                      <Input
                        placeholder="https://xxxx.gradio.live"
                        value={draft.lightningEndpoint || ''}
                        onChange={e => setField('lightningEndpoint', e.target.value || null)}
                        className="font-mono text-sm"
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setField('lightningEndpoint', null)}
                        title="Use default endpoint"
                      >
                        Reset
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Leave blank to use the default. Update when Lightning restarts.
                    </p>
                  </div>
                </CardContent>
              </Card>

              {/* 7. Video Type */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <span className="bg-primary text-primary-foreground rounded-full w-6 h-6 flex items-center justify-center text-xs">7</span>
                    <Video className="w-4 h-4" /> Video Type & Schedule
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Content Type</Label>
                    <div className="grid grid-cols-2 gap-2 max-w-md">
                      <button
                        type="button"
                        onClick={() => setField("contentMode", "single")}
                        className={`p-3 rounded-lg border text-left ${
                          isShort ? "border-primary bg-primary/5 ring-1 ring-primary/30" : "border-border hover:bg-accent/30"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-sm">📱 Shorts</span>
                          {isShort && <CheckCircle2 className="w-4 h-4 text-primary" />}
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">9:16 vertical</div>
                      </button>
                      <button
                        type="button"
                        onClick={() => setField("contentMode", "long_form")}
                        className={`p-3 rounded-lg border text-left ${
                          !isShort ? "border-primary bg-primary/5 ring-1 ring-primary/30" : "border-border hover:bg-accent/30"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-sm">🎬 Long-form</span>
                          {!isShort && <CheckCircle2 className="w-4 h-4 text-primary" />}
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">16:9 horizontal</div>
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Target Duration</Label>
                      <Select value={draft.videoDuration} onValueChange={(v) => setField("videoDuration", v)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <div className="px-2 py-1 text-xs font-semibold text-muted-foreground">Shorts</div>
                          {SHORT_DURATIONS.map(d => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}
                          <div className="px-2 py-1 text-xs font-semibold text-muted-foreground border-t mt-1 pt-1">Long-form</div>
                          {LONG_DURATIONS.map(d => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Videos Per Day</Label>
                      <Input type="number" min={1} max={5} value={draft.videosPerDay}
                        onChange={(e) => setField("videosPerDay", parseInt(e.target.value) || 1)} />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2"><Clock className="w-3 h-3" /> Publish Times</Label>
                    <div className="flex flex-wrap gap-1">
                      {PUBLISH_HOURS.map(t => {
                        const active = draft.publishTimes.includes(t)
                        return (
                          <button key={t} type="button" onClick={() => togglePublishTime(t)}
                            className={`px-2 py-1 text-xs rounded border ${
                              active ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-accent/30"
                            }`}>
                            {t}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                </CardContent>
              </Card>

              <div className="sticky bottom-0 bg-background/80 backdrop-blur py-3 border-t flex items-center justify-between">
                <div className="text-sm text-muted-foreground">
                  {draft.onboardingCompleted ? (
                    <span className="flex items-center gap-1"><CheckCircle2 className="w-4 h-4 text-green-500" /> Onboarding complete</span>
                  ) : (
                    <span>Click "Save & finish" to mark this niche ready for content generation</span>
                  )}
                </div>
                <Button onClick={save} disabled={saving} className="bg-primary text-primary-foreground">
                  {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                  Save & finish
                </Button>
              </div>
            </div>
          ) : (
            <Card>
              <CardContent className="text-center py-12 text-muted-foreground">
                Select a niche from the left to configure it
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Art-style image modal (full size, 9:16) */}
      {modalArtUrl && (
        <div
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setModalArtUrl(null)}
        >
          <button
            onClick={() => setModalArtUrl(null)}
            className="absolute top-4 right-4 text-white bg-black/50 rounded-full p-2 hover:bg-black/80 z-10"
          >
            <X className="w-6 h-6" />
          </button>
          <img
            src={modalArtUrl}
            alt="Art style preview (full size)"
            className="max-h-[90vh] max-w-[90vw] object-contain rounded shadow-2xl"
            style={{ aspectRatio: "9 / 16" }}
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  )
}
