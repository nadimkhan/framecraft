'use client'

import { useEffect, useState, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import { Loader2, Youtube, Instagram, Search, Upload, Eye, AlertCircle, ExternalLink, RefreshCw, ChevronDown, ChevronUp, CheckCircle2, Clipboard, Save as SaveIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { PageHeader } from '@/components/page-header'

interface SeriesOption {
  id: string
  seriesName: string
  youtubeChannelId: string | null
  youtubeChannelName: string | null
  instagramAccountId: string | null
  instagramAccountName: string | null
}

interface UploadableVideo {
  videoId: number
  topicId: number
  topicTitle: string
  sourceType: string | null      // 'youtube' | 'ai'
  sourceUrl: string | null       // original YouTube URL if sourceType='youtube'
  sourceViews: number | null
  sourceDuration: number | null
  hasTranscript: boolean
  transcript: string | null      // raw transcript (may be long)
  videoPath: string | null
  // Pre-filled metadata — editable before upload
  title: string
  description: string
  tags: string[]
  // For YouTube: privacy default
  privacyStatus: 'public' | 'private' | 'unlisted'
  // For IG: caption
  caption: string
  // Already uploaded?
  youtubeVideoId: string | null
  youtubeUrl: string | null
  instagramMediaId: string | null
  instagramUrl: string | null
}

interface PublishResult {
  ok: boolean
  seriesName?: string
  results?: {
    youtube?: { videoId: string; url: string }
    instagram?: { mediaId: string; url: string }
  }
  errors?: Record<string, { stage: string; message: string }>
}

/**
 * Uploads page — list rendered videos, fetch their source metadata, and
 * upload to YouTube / Instagram using the Series's stored credentials.
 */
export default function UploadsClient() {
  const searchParams = useSearchParams()
  const preselectedSeriesId = searchParams.get('seriesId')
  const [seriesList, setSeriesList] = useState<SeriesOption[]>([])
  const [selectedSeriesId, setSelectedSeriesId] = useState<string>('')
  const [videos, setVideos] = useState<UploadableVideo[]>([])
  const [loadingSeries, setLoadingSeries] = useState(true)
  const [loadingVideos, setLoadingVideos] = useState(false)
  const [expandedVideo, setExpandedVideo] = useState<number | null>(null)
  const [researchingId, setResearchingId] = useState<number | null>(null)
  // Track which videos have unsaved changes (dirty). Maps videoId → the snapshot
  // of the last saved metadata, so we can show a "modified" badge and detect
  // when the user reverts.
  const [savedSnapshots, setSavedSnapshots] = useState<Record<number, string>>({})
  const [saving, setSaving] = useState<Set<number>>(new Set())
  const [uploading, setUploading] = useState<Record<string, 'youtube' | 'instagram' | null>>({})
  const [results, setResults] = useState<Record<number, PublishResult>>({})
  const [error, setError] = useState<string | null>(null)

  // Load all series on mount
  useEffect(() => {
    setLoadingSeries(true)
    fetch('/api/settings/series')
      .then(r => r.json())
      .then(d => {
        const opts: SeriesOption[] = (d.series || []).map((s: any) => ({
          id: s.id,
          seriesName: s.seriesName,
          youtubeChannelId: s.youtubeChannelId,
          youtubeChannelName: s.youtubeChannelName,
          instagramAccountId: s.instagramAccountId,
          instagramAccountName: s.instagramAccountName,
        }))
        setSeriesList(opts)
        // Auto-select from query param if provided
        if (preselectedSeriesId) {
          if (opts.find(s => s.id === preselectedSeriesId)) {
            setSelectedSeriesId(preselectedSeriesId)
          }
        } else if (opts.length > 0) {
          setSelectedSeriesId(opts[0].id)
        }
      })
      .catch(e => setError(e.message))
      .finally(() => setLoadingSeries(false))
  }, [preselectedSeriesId])

  // Load videos for selected series
  const loadVideos = useCallback(async () => {
    if (!selectedSeriesId) return
    setLoadingVideos(true)
    setError(null)
    try {
      const res = await fetch(`/api/uploads/list?seriesId=${selectedSeriesId}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to load videos')
      const fresh: UploadableVideo[] = data.videos || []
      setVideos(fresh)
      // Snapshot the loaded metadata so dirty-checking has a baseline
      const snaps: Record<number, string> = {}
      for (const v of fresh) snaps[v.videoId] = snapshotOf(v)
      setSavedSnapshots(snaps)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoadingVideos(false)
    }
  }, [selectedSeriesId])

  // Compact string key for dirty detection — only fields the user can edit.
  function snapshotOf(v: UploadableVideo): string {
    return JSON.stringify({
      title: v.title,
      description: v.description,
      caption: v.caption,
      tags: v.tags,
      privacyStatus: v.privacyStatus,
    })
  }

  // True if the video has unsaved metadata edits.
  function isDirty(v: UploadableVideo): boolean {
    const saved = savedSnapshots[v.videoId]
    if (!saved) return false
    return saved !== snapshotOf(v)
  }

  useEffect(() => { loadVideos() }, [loadVideos])

  // Pull metadata from the original source (YouTube transcript, view count, etc.)
  async function researchMetadata(video: UploadableVideo) {
    setResearchingId(video.videoId)
    setError(null)
    try {
      const res = await fetch('/api/uploads/research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoId: video.videoId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Research failed')
      // Update the video in-place
      setVideos(prev => {
        const next = prev.map(v =>
          v.videoId === video.videoId
            ? {
                ...v,
                title: data.title || v.title,
                description: data.description || v.description,
                tags: data.tags || v.tags,
                caption: data.caption || v.caption,
                hasTranscript: data.hasTranscript ?? v.hasTranscript,
              }
            : v,
        )
        // Update snapshot baseline so research results aren't treated as dirty
        // until the user edits them.
        const updated = next.find(v => v.videoId === video.videoId)
        if (updated) {
          setSavedSnapshots(prevSnap => ({ ...prevSnap, [video.videoId]: snapshotOf(updated) }))
        }
        return next
      })
    } catch (e: any) {
      setError(e.message)
    } finally {
      setResearchingId(null)
    }
  }

  // Persist the user-edited metadata to the DB. After save the snapshot
  // baseline updates so isDirty() returns false until the next edit.
  async function saveMetadata(video: UploadableVideo) {
    setSaving(prev => new Set(prev).add(video.videoId))
    setError(null)
    try {
      const res = await fetch('/api/uploads/metadata', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          videoId: video.videoId,
          title: video.title,
          description: video.description,
          caption: video.caption,
          tags: video.tags,
          privacyStatus: video.privacyStatus,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Save failed')
      // Snapshot the just-saved state so dirty bit clears
      setSavedSnapshots(prev => ({ ...prev, [video.videoId]: snapshotOf(video) }))
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(prev => {
        const s = new Set(prev)
        s.delete(video.videoId)
        return s
      })
    }
  }

  // Update a single field of a video's metadata
  function updateVideoField(videoId: number, field: keyof UploadableVideo, value: any) {
    setVideos(prev => prev.map(v =>
      v.videoId === videoId ? { ...v, [field]: value } : v,
    ))
  }

  // Upload to YouTube / Instagram
  async function publish(video: UploadableVideo, platform: 'youtube' | 'instagram') {
    const key = `${video.videoId}-${platform}`
    setUploading(prev => ({ ...prev, [key]: platform }))
    setError(null)
    try {
      // Only pass explicit metadata fields if the user has unsaved edits —
      // otherwise rely on the values persisted via /api/uploads/metadata so
      // there's a single source of truth (the DB).
      const useExplicit = isDirty(video)
      const body: any = {
        videoId: video.videoId,
        platforms: [platform],
      }
      if (useExplicit) {
        if (platform === 'youtube') {
          body.youtubeTitle = video.title
          body.youtubeDescription = video.description
          body.youtubeTags = video.tags
          body.youtubePrivacy = video.privacyStatus
        }
        if (platform === 'instagram') {
          body.instagramCaption = video.caption
        }
      }
      const res = await fetch('/api/social/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || data.details || 'Publish failed')
      setResults(prev => ({ ...prev, [video.videoId]: data }))
      // Update local state with the uploaded IDs
      setVideos(prev => prev.map(v =>
        v.videoId === video.videoId
          ? {
              ...v,
              youtubeVideoId: data.results?.youtube?.videoId ?? v.youtubeVideoId,
              youtubeUrl: data.results?.youtube?.url ?? v.youtubeUrl,
              instagramMediaId: data.results?.instagram?.mediaId ?? v.instagramMediaId,
              instagramUrl: data.results?.instagram?.url ?? v.instagramUrl,
            }
          : v,
      ))
    } catch (e: any) {
      setError(e.message)
    } finally {
      setUploading(prev => ({ ...prev, [key]: null }))
    }
  }

  const selectedSeries = seriesList.find(s => s.id === selectedSeriesId)
  const ready = videos.filter(v => v.videoPath)

  return (
    <div className="flex-1 min-w-0 flex flex-col">
      <PageHeader
        title="Uploads"
        description="Publish rendered videos to YouTube and Instagram using per-channel credentials"
      />

      <div className="flex-1 px-6 py-6 space-y-4">
        {error && (
          <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Channel / Niche selector */}
        <Card>
          <CardContent className="py-4">
            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex-1 min-w-[260px]">
                <label className="text-xs text-muted-foreground block mb-1">Channel / Series</label>
                <Select value={selectedSeriesId} onValueChange={setSelectedSeriesId} disabled={loadingSeries}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={loadingSeries ? 'Loading channels...' : 'Pick a channel'} />
                  </SelectTrigger>
                  <SelectContent>
                    {seriesList.length === 0 ? (
                      <SelectItem value="__none" disabled>No channels yet</SelectItem>
                    ) : (
                      seriesList.map(s => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.seriesName}
                          {s.youtubeChannelId && ' • YT ✓'}
                          {s.instagramAccountId && ' • IG ✓'}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
              {selectedSeries && (
                <div className="flex gap-2 text-xs text-muted-foreground">
                  {selectedSeries.youtubeChannelId && (
                    <Badge variant="outline" className="gap-1 text-red-600 border-red-300">
                      <Youtube className="w-3 h-3" />
                      {selectedSeries.youtubeChannelName || selectedSeries.youtubeChannelId}
                    </Badge>
                  )}
                  {selectedSeries.instagramAccountId && (
                    <Badge variant="outline" className="gap-1 text-pink-600 border-pink-300">
                      <Instagram className="w-3 h-3" />
                      {selectedSeries.instagramAccountName || `@${selectedSeries.instagramAccountId}`}
                    </Badge>
                  )}
                </div>
              )}
              <Button
                size="sm"
                variant="outline"
                onClick={loadVideos}
                disabled={!selectedSeriesId || loadingVideos}
              >
                {loadingVideos ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                Refresh
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Video list */}
        {loadingVideos ? (
          <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin" />
            Loading videos...
          </div>
        ) : ready.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-sm text-muted-foreground">
              No rendered videos yet for this channel. Render scenes first from the
              <span className="font-medium mx-1">Scenes</span> page.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {ready.map(video => {
              const isExpanded = expandedVideo === video.videoId
              const ytResult = results[video.videoId]?.results?.youtube
              const igResult = results[video.videoId]?.results?.instagram
              const ytError = results[video.videoId]?.errors?.youtube
              const igError = results[video.videoId]?.errors?.instagram
              const ytBusy = uploading[`${video.videoId}-youtube`]
              const igBusy = uploading[`${video.videoId}-instagram`]
              const researching = researchingId === video.videoId

              return (
                <Card key={video.videoId}>
                  <CardContent className="py-4">
                    {/* Header row */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-medium truncate max-w-[600px]">{video.title}</h3>
                          {isDirty(video) && (
                            <Badge variant="outline" className="gap-1 text-amber-600 border-amber-300 bg-amber-50">
                              <AlertCircle className="w-3 h-3" /> Modified
                            </Badge>
                          )}
                          {video.youtubeVideoId && (
                            <Badge variant="outline" className="gap-1 text-green-600 border-green-300">
                              <CheckCircle2 className="w-3 h-3" /> YT
                            </Badge>
                          )}
                          {video.instagramMediaId && (
                            <Badge variant="outline" className="gap-1 text-green-600 border-green-300">
                              <CheckCircle2 className="w-3 h-3" /> IG
                            </Badge>
                          )}
                          {video.sourceType === 'youtube' && (
                            <Badge variant="outline" className="gap-1 text-xs">
                              <Youtube className="w-3 h-3" /> From source
                            </Badge>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground flex items-center gap-3 flex-wrap">
                          <span>Video #{video.videoId}</span>
                          {video.sourceViews != null && (
                            <span>{video.sourceViews.toLocaleString()} views</span>
                          )}
                          {video.sourceDuration != null && (
                            <span>{Math.floor(video.sourceDuration / 60)}:{(video.sourceDuration % 60).toString().padStart(2, '0')}</span>
                          )}
                          {video.sourceUrl && (
                            <a href={video.sourceUrl} target="_blank" rel="noopener noreferrer"
                               className="flex items-center gap-1 text-blue-600 hover:underline">
                              <ExternalLink className="w-3 h-3" /> Source
                            </a>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => researchMetadata(video)}
                          disabled={researching}
                          title="Pull metadata from the original source"
                        >
                          {researching ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Search className="w-4 h-4" />
                          )}
                          Research
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setExpandedVideo(isExpanded ? null : video.videoId)}
                        >
                          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                          {isExpanded ? 'Collapse' : 'Edit metadata'}
                        </Button>
                      </div>
                    </div>

                    {/* Uploaded links */}
                    {(ytResult || igResult || video.youtubeUrl || video.instagramUrl) && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {(ytResult || video.youtubeUrl) && (
                          <a
                            href={(ytResult?.url || video.youtubeUrl)!}
                            target="_blank" rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded bg-red-50 text-red-700 hover:bg-red-100"
                          >
                            <Youtube className="w-3 h-3" />
                            View on YouTube
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                        {(igResult || video.instagramUrl) && (
                          <a
                            href={(igResult?.url || video.instagramUrl)!}
                            target="_blank" rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded bg-pink-50 text-pink-700 hover:bg-pink-100"
                          >
                            <Instagram className="w-3 h-3" />
                            View on Instagram
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                      </div>
                    )}

                    {/* Expanded metadata editor */}
                    {isExpanded && (
                      <div className="mt-4 pt-4 border-t space-y-3">
                        <div>
                          <label className="text-xs text-muted-foreground block mb-1">Title (YouTube + IG)</label>
                          <Input
                            value={video.title}
                            onChange={(e) => updateVideoField(video.videoId, 'title', e.target.value)}
                            maxLength={100}
                          />
                          <div className="text-xs text-muted-foreground mt-1">{video.title.length}/100</div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="text-xs text-muted-foreground block mb-1">YouTube description</label>
                            <Textarea
                              value={video.description}
                              onChange={(e) => updateVideoField(video.videoId, 'description', e.target.value)}
                              maxLength={5000}
                              rows={4}
                            />
                            <div className="text-xs text-muted-foreground mt-1">{video.description.length}/5000</div>
                          </div>
                          <div>
                            <label className="text-xs text-muted-foreground block mb-1">Instagram caption</label>
                            <Textarea
                              value={video.caption}
                              onChange={(e) => updateVideoField(video.videoId, 'caption', e.target.value)}
                              maxLength={2200}
                              rows={4}
                            />
                            <div className="text-xs text-muted-foreground mt-1">{video.caption.length}/2200</div>
                          </div>
                        </div>

                        <div>
                          <label className="text-xs text-muted-foreground block mb-1">
                            Tags (comma-separated)
                          </label>
                          <Input
                            value={video.tags.join(', ')}
                            onChange={(e) => updateVideoField(video.videoId, 'tags',
                              e.target.value.split(',').map(t => t.trim()).filter(Boolean))}
                            placeholder="horror, story, shorts"
                          />
                        </div>

                        <div>
                          <label className="text-xs text-muted-foreground block mb-1">YouTube privacy</label>
                          <Select
                            value={video.privacyStatus}
                            onValueChange={(v: any) => updateVideoField(video.videoId, 'privacyStatus', v)}
                          >
                            <SelectTrigger className="w-48">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="public">Public</SelectItem>
                              <SelectItem value="unlisted">Unlisted</SelectItem>
                              <SelectItem value="private">Private (schedule for later)</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        {/* Save bar — sticky reminder that unsaved changes exist */}
                        <div className="flex items-center justify-between gap-2 pt-2 border-t border-dashed">
                          <div className="text-xs text-muted-foreground">
                            {isDirty(video)
                              ? <span className="text-amber-600 font-medium">● Unsaved changes</span>
                              : <span className="text-green-600">✓ All changes saved</span>}
                          </div>
                          <Button
                            size="sm"
                            variant={isDirty(video) ? 'default' : 'outline'}
                            onClick={() => saveMetadata(video)}
                            disabled={!isDirty(video) || saving.has(video.videoId)}
                          >
                            {saving.has(video.videoId)
                              ? <Loader2 className="w-4 h-4 animate-spin" />
                              : <SaveIcon className="w-4 h-4" />}
                            Save metadata
                          </Button>
                        </div>

                        {video.transcript && (
                          <details className="text-xs">
                            <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                              View source transcript ({video.transcript.length} chars)
                            </summary>
                            <pre className="mt-2 p-2 bg-muted rounded text-xs whitespace-pre-wrap max-h-48 overflow-y-auto">
                              {video.transcript.slice(0, 2000)}{video.transcript.length > 2000 ? '\n\n... (truncated)' : ''}
                            </pre>
                          </details>
                        )}
                      </div>
                    )}

                    {/* Errors */}
                    {(ytError || igError) && (
                      <div className="mt-3 text-xs text-red-600 bg-red-50 border border-red-200 rounded p-2">
                        {ytError && <div><strong>YouTube:</strong> [{ytError.stage}] {ytError.message}</div>}
                        {igError && <div><strong>Instagram:</strong> [{igError.stage}] {igError.message}</div>}
                      </div>
                    )}

                    {/* Action buttons */}
                    <div className="mt-3 flex gap-2 flex-wrap">
                      <Button
                        size="sm"
                        onClick={() => publish(video, 'youtube')}
                        disabled={ytBusy !== undefined && ytBusy !== null || !selectedSeries?.youtubeChannelId}
                        title={!selectedSeries?.youtubeChannelId ? 'Series has no YouTube channel configured' : 'Upload to YouTube'}
                      >
                        {ytBusy ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Youtube className="w-4 h-4" />
                        )}
                        Upload to YouTube
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => publish(video, 'instagram')}
                        disabled={igBusy !== undefined && igBusy !== null || !selectedSeries?.instagramAccountId}
                        title={!selectedSeries?.instagramAccountId ? 'Series has no IG account configured' : 'Upload to Instagram'}
                      >
                        {igBusy ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Instagram className="w-4 h-4" />
                        )}
                        Upload to Instagram
                      </Button>
                    </div>

                    {/* Result ID display */}
                    {results[video.videoId] && (
                      <div className="mt-3 text-xs bg-muted rounded p-2 space-y-1 font-mono">
                        {ytResult && (
                          <div className="flex items-center gap-2">
                            <span className="text-muted-foreground font-sans">YouTube ID:</span>
                            <span>{ytResult.videoId}</span>
                            <button
                              type="button"
                              className="text-muted-foreground hover:text-foreground"
                              onClick={() => navigator.clipboard.writeText(ytResult.videoId)}
                            >
                              <Clipboard className="w-3 h-3" />
                            </button>
                          </div>
                        )}
                        {igResult && (
                          <div className="flex items-center gap-2">
                            <span className="text-muted-foreground font-sans">IG media ID:</span>
                            <span>{igResult.mediaId}</span>
                            <button
                              type="button"
                              className="text-muted-foreground hover:text-foreground"
                              onClick={() => navigator.clipboard.writeText(igResult.mediaId)}
                            >
                              <Clipboard className="w-3 h-3" />
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
