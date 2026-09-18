"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import {
  Loader2, Sparkles, ArrowLeft, Play, CheckCircle2, AlertCircle,
  Youtube, Bot, ExternalLink, BarChart2, Clock, FileText, Eye,
  ChevronDown, ChevronUp, Image as ImageIcon, Volume2, RotateCcw,
  X, Maximize2, ShieldCheck, Video as VideoIcon, Film, Wand2,
} from "lucide-react"

interface BatchSummary {
  id: number
  name: string
  topicCount: number
  createdAt: string
}

interface SceneInfo {
  id: number
  index: number
  narration: string
  prompt: string
  imagePath: string | null
  audioPath: string | null
  sceneVideoPath: string | null
}

interface TopicInfo {
  id: number
  title: string
  fullStory: string | null
  sourceType: string
  sourceUrl: string | null
  sourceViews: number | null
  sourceDuration: number | null
  sourceTranscript: string | null
  seriesId: string | null
  seriesName: string | null
  seriesDurationBucket: string | null
  seriesContentMode: string | null
  nicheCategory: string | null
  artStyleName: string | null
  videoId: number | null
  sceneCount: number
  imagesReady: number
  audiosReady: number
  hasStory: boolean
  scenes: SceneInfo[]
}

const DURATION_LABELS: Record<string, string> = {
  short_30_40: '30-40s',
  short_50_60: '50-60s',
  long_60_120: '1-2min',
  long_120_300: '2-5min',
}

const SCENE_TARGETS: Record<string, number> = {
  short_30_40: 6,
  short_50_60: 9,
  long_60_120: 14,
  long_120_300: 20,
}

interface BatchDetail {
  id: number
  name: string
  createdAt: string
  topics: TopicInfo[]
}

export default function ScenesClient() {
  const [batches, setBatches] = useState<BatchSummary[]>([])
  const [loadingBatches, setLoadingBatches] = useState(true)
  const [selectedBatchId, setSelectedBatchId] = useState<string>("")
  const [batch, setBatch] = useState<BatchDetail | null>(null)
  const [loadingBatch, setLoadingBatch] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Per-topic generation state
  const [generating, setGenerating] = useState<Set<number>>(new Set())
  const [batchGenerating, setBatchGenerating] = useState(false)
  const [batchProgress, setBatchProgress] = useState({ done: 0, total: 0, failed: 0 })

  // Per-topic expansion state — which topic's scenes are expanded inline
  const [expandedTopics, setExpandedTopics] = useState<Set<number>>(new Set())

  // Asset generation state
  const [generatingAssets, setGeneratingAssets] = useState<Set<number>>(new Set())
  const [batchAssetsGenerating, setBatchAssetsGenerating] = useState(false)
  const [batchAssetProgress, setBatchAssetProgress] = useState({ done: 0, total: 0, failed: 0 })

  // Bulk validate state — runs the deterministic template + sanitizer against
  // every scene in the batch and writes the corrected prompts back to the DB.
  const [validatingAll, setValidatingAll] = useState(false)
  const [validateAllProgress, setValidateAllProgress] = useState({ processed: 0, total: 0, changed: 0, failed: 0 })

  // Video render state — polls the render-video endpoint after kicking it off.
  const [renderingVideo, setRenderingVideo] = useState(false)
  const [renderJobId, setRenderJobId] = useState<string | null>(null)
  // Per-topic video URL — each topic renders its own MP4 into its own folder.
  // The currently-previewed video in the modal is selected from this map.
  const [topicVideoUrls, setTopicVideoUrls] = useState<Record<string, string>>({})
  const [previewVideoUrl, setPreviewVideoUrl] = useState<string | null>(null)
  const [renderError, setRenderError] = useState<string | null>(null)

  // Per-scene asset generation tracking
  const [generatingSceneImage, setGeneratingSceneImage] = useState<Set<number>>(new Set())
  const [generatingSceneAudio, setGeneratingSceneAudio] = useState<Set<number>>(new Set())
  const [reprompting, setReprompting] = useState<Set<number>>(new Set())
  const [validating, setValidating] = useState<Set<number>>(new Set())
  // Scenes whose Image Prompt was just validated successfully. The check icon
  // is shown while the sceneId is in this map; cleared automatically after 3s.
  // Map<sceneId, timestampOfValidation> — used by both per-scene Validate and
  // bulk Validate All so we can flash the green check on every repaired scene.
  const [validatedFlash, setValidatedFlash] = useState<Map<number, number>>(new Map())

  // Image preview modal: { src, alt, aspectRatio } | null
  const [previewImage, setPreviewImage] = useState<{ src: string; alt: string; aspectRatio: string } | null>(null)

  // Fetch all topic batches on mount
  useEffect(() => {
    setLoadingBatches(true)
    fetch("/api/topics/batches")
      .then(r => r.json())
      .then(d => setBatches(d.batches || []))
      .catch(e => setError("Failed to load batches"))
      .finally(() => setLoadingBatches(false))
  }, [])

  // Fetch batch detail when selected
  useEffect(() => {
    if (!selectedBatchId) {
      setBatch(null)
      return
    }
    setLoadingBatch(true)
    setError(null)
    fetch(`/api/scenes/batch/${selectedBatchId}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) {
          setError(d.error)
          return
        }
        setBatch(d.batch)
        // The API now server-checks for renderedVideoUrl on disk so the View
        // Video button shows up immediately on load (no client-side probing).
        const discovered: Record<string, string> = {}
        for (const topic of d.batch.topics || []) {
          if (topic.renderedVideoUrl) {
            discovered[String(topic.id)] = topic.renderedVideoUrl
          }
        }
        if (Object.keys(discovered).length > 0) {
          setTopicVideoUrls(prev => ({ ...prev, ...discovered }))
        }
      })
      .catch(e => setError(e.message))
      .finally(() => setLoadingBatch(false))
  }, [selectedBatchId])

  async function generateForTopic(topic: TopicInfo) {
    setGenerating(prev => new Set(prev).add(topic.id))
    setError(null)
    try {
      // Regenerate always sends force=true so the LLM splits the story fresh.
      // The button label says "Regenerate" so it should always re-do the work.
      const res = await fetch("/api/scenes/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topicId: topic.id, force: true }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Generation failed")
      // Refresh batch
      const refreshed = await fetch(`/api/scenes/batch/${selectedBatchId}`).then(r => r.json())
      setBatch(refreshed.batch)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setGenerating(prev => {
        const s = new Set(prev)
        s.delete(topic.id)
        return s
      })
    }
  }

  // ─── Generate assets (images + audio) for a topic's scenes ───────────────
  async function generateAssetsFor(topic: TopicInfo) {
    setGeneratingAssets(prev => new Set(prev).add(topic.id))
    setError(null)
    try {
      const res = await fetch("/api/assets/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topicId: topic.id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Asset generation failed")
      // Refresh batch to show updated imagePath/audioPath
      const refreshed = await fetch(`/api/scenes/batch/${selectedBatchId}`).then(r => r.json())
      setBatch(refreshed.batch)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setGeneratingAssets(prev => {
        const s = new Set(prev)
        s.delete(topic.id)
        return s
      })
    }
  }

  // ─── Bulk validate — audit + repair every scene's image prompt in the batch
  // Calls /api/scenes/validate-all/[batchId] which walks topics → scenes and
  // runs the deterministic template + sanitizer pipeline against each. Writes
  // the corrected prompts back to the DB. ~50ms per scene so a 50-scene batch
  // finishes in ~3s.
  async function validateAllForBatch() {
    if (!batch) return
    if (totalSceneCount === 0) {
      setError('No scenes to validate. Generate scenes first.')
      return
    }
    setValidatingAll(true)
    setValidateAllProgress({ processed: 0, total: totalSceneCount, changed: 0, failed: 0 })
    setError(null)
    try {
      const res = await fetch(`/api/scenes/validate-all/${selectedBatchId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || data.error) {
        throw new Error(data.error || `Validate-all failed (${res.status})`)
      }
      console.info('[validate-all] ok', {
        processed: data.processed,
        changed: data.changedCount,
        failed: data.failed,
      })
      setValidateAllProgress({
        processed: data.processed,
        total: data.processed + data.failed,
        changed: data.changedCount,
        failed: data.failed,
      })
      await refreshBatch()
      // Flash the green check on every scene that was repaired
      const now = Date.now()
      const changedIds = (data.updates || [])
        .filter((u: any) => u.changed)
        .map((u: any) => u.sceneId)
      if (changedIds.length > 0) {
        setValidatedFlash(prev => {
          const next = new Map(prev)
          for (const id of changedIds) next.set(id, now)
          return next
        })
        setTimeout(() => {
          setValidatedFlash(prev => {
            const next = new Map(prev)
            for (const id of changedIds) next.delete(id)
            return next
          })
        }, 3000)
      }
    } catch (e: any) {
      setError(e.message || 'Network error')
    } finally {
      setValidatingAll(false)
    }
  }

  // ─── Render Video — uses /api/render-batch which handles each topic
  // independently. Per-topic results surface below.
  // Uses the RX 560 GPU for hardware-accelerated h264_vaapi encoding.
  const [batchRenderResults, setBatchRenderResults] = useState<Record<string, { status: string; videoUrl?: string; error?: string }>>({})
  const [renderingBatchId, setRenderingBatchId] = useState<string | null>(null)

  async function renderBatchVideo() {
    if (!batch) return
    const eligible = batch.topics.filter(t =>
      t.sceneCount > 0 && t.imagesReady === t.sceneCount && t.audiosReady === t.sceneCount
    )
    if (eligible.length === 0) {
      setError('Generate images and audio for all scenes first before rendering.')
      return
    }
    setRenderingVideo(true)
    setRenderError(null)
    setPreviewVideoUrl(null)
    setRenderJobId(null)
    setBatchRenderResults({})
    try {
      const res = await fetch('/api/render-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topics: eligible.map(t => ({ topicId: String(t.id), title: t.title, scenes: [] })),
          title: batch.name,
        }),
      })
      const data = await res.json()
      if (!res.ok || !data.batchId) {
        throw new Error(data.error || `Render request failed (${res.status})`)
      }
      setRenderingBatchId(data.batchId)
      console.info('[render] batchId:', data.batchId)

      // Poll the batch endpoint until all topics done
      const MAX_POLLS = 120
      const POLL_INTERVAL_MS = 5000
      const nextUrls: Record<string, string> = {}
      for (let i = 0; i < MAX_POLLS; i++) {
        await new Promise(r => setTimeout(r, POLL_INTERVAL_MS))
        const poll = await fetch(`/api/render-batch?batchId=${data.batchId}`)
        const status = await poll.json()
        const results: Record<string, any> = {}
        for (const t of status.topics || []) {
          results[t.topicId] = { status: t.status, videoUrl: t.videoUrl, error: t.error }
          if (t.videoUrl) nextUrls[t.topicId] = t.videoUrl
        }
        setBatchRenderResults(results)
        if (status.status === 'completed' || status.status === 'failed' || status.status === 'partial') {
          // Persist per-topic video URLs so each topic card shows its own video inline.
          setTopicVideoUrls(prev => ({ ...prev, ...nextUrls }))
          return
        }
      }
      throw new Error('Render timed out after 10 minutes')
    } catch (e: any) {
      setRenderError(e.message || 'Render failed')
    } finally {
      setRenderingVideo(false)
      setRenderingBatchId(null)
    }
  }

  // ─── Per-topic render — kicks off a single topic's render job and polls it.
  async function renderSingleTopic(topicId: string) {
    setRenderError(null)
    setRenderingVideo(true)
    setRenderJobId(null)
    // Mark this topic as rendering immediately so the button shows the spinner
    // even before the first poll returns.
    setBatchRenderResults(prev => ({
      ...prev,
      [topicId]: { status: 'rendering' },
    }))
    try {
      const res = await fetch('/api/render-topic', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topicId: String(topicId) }),
      })
      const data = await res.json()
      if (!res.ok || !data.jobId) {
        throw new Error(data.error || `Render request failed (${res.status})`)
      }
      setRenderJobId(data.jobId)
      // Poll
      const MAX_POLLS = 120
      for (let i = 0; i < MAX_POLLS; i++) {
        await new Promise(r => setTimeout(r, 5000))
        const poll = await fetch(`/api/render-topic?jobId=${data.jobId}`)
        const status = await poll.json()
        if (status.status === 'completed' && status.videoUrl) {
          setTopicVideoUrls(prev => ({ ...prev, [topicId]: status.videoUrl }))
          setBatchRenderResults(prev => ({
            ...prev,
            [topicId]: { status: 'completed', videoUrl: status.videoUrl },
          }))
          return
        }
        if (status.status === 'failed') {
          throw new Error(status.error || 'Render failed')
        }
      }
      throw new Error('Render timed out after 10 minutes')
    } catch (e: any) {
      setRenderError(e.message || 'Render failed')
    } finally {
      setRenderingVideo(false)
      setRenderJobId(null)
    }
  }

  async function generateAssetsForBatch() {
    if (!batch) return
    const eligible = batch.topics.filter(t => t.sceneCount > 0)
    if (eligible.length === 0) {
      setError("No topics with scenes to generate assets for. Generate scenes first.")
      return
    }

    setBatchAssetsGenerating(true)
    setBatchAssetProgress({ done: 0, total: eligible.length, failed: 0 })
    setError(null)

    const RATE_LIMIT_MS = 1500
    let done = 0
    let failed = 0

    for (const topic of eligible) {
      setGeneratingAssets(prev => new Set(prev).add(topic.id))
      try {
        const res = await fetch("/api/assets/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ topicId: topic.id }),
        })
        const data = await res.json()
        if (!res.ok || data.error) {
          failed++
          console.warn(`[assets] topic ${topic.id} failed:`, data.error)
        }
      } catch (e: any) {
        failed++
        console.warn(`[assets] topic ${topic.id} error:`, e.message)
      } finally {
        setGeneratingAssets(prev => {
          const s = new Set(prev)
          s.delete(topic.id)
          return s
        })
      }
      done++
      setBatchAssetProgress({ done, total: eligible.length, failed })
      if (done < eligible.length) {
        await new Promise(r => setTimeout(r, RATE_LIMIT_MS))
      }
    }

    try {
      const refreshed = await fetch(`/api/scenes/batch/${selectedBatchId}`).then(r => r.json())
      setBatch(refreshed.batch)
    } catch { /* ignore */ }

    setBatchAssetsGenerating(false)
    if (failed > 0) {
      setError(`${done - failed}/${eligible.length} assets generated. ${failed} failed.`)
    }
  }

  // ─── Per-scene asset generation ──────────────────────────────────────────
  async function refreshBatch() {
    if (!selectedBatchId) return
    try {
      const refreshed = await fetch(`/api/scenes/batch/${selectedBatchId}`).then(r => r.json())
      setBatch(refreshed.batch)
    } catch { /* ignore */ }
  }

  async function generateImageForOneScene(topic: TopicInfo, scene: SceneInfo) {
    setGeneratingSceneImage(prev => new Set(prev).add(scene.id))
    setError(null)
    try {
      const res = await fetch(`/api/scenes/${scene.id}/generate-image`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok || data.error) throw new Error(data.error || 'Image generation failed')
      await refreshBatch()
    } catch (e: any) {
      setError(e.message || 'Network error')
    } finally {
      setGeneratingSceneImage(prev => {
        const s = new Set(prev)
        s.delete(scene.id)
        return s
      })
    }
  }

  async function generateAudioForOneScene(topic: TopicInfo, scene: SceneInfo) {
    setGeneratingSceneAudio(prev => new Set(prev).add(scene.id))
    setError(null)
    try {
      const res = await fetch(`/api/scenes/${scene.id}/generate-audio`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok || data.error) throw new Error(data.error || 'Audio generation failed')
      await refreshBatch()
    } catch (e: any) {
      setError(e.message || 'Network error')
    } finally {
      setGeneratingSceneAudio(prev => {
        const s = new Set(prev)
        s.delete(scene.id)
        return s
      })
    }
  }

  // ─── Validate — audit + repair this scene's image prompt anchored to narration ──
  // On success: silently updates the scene + shows a green check next to the
  // Image Prompt title for ~3s. No text banner.
  async function validateScene(topic: TopicInfo, scene: SceneInfo) {
    setValidating(prev => new Set(prev).add(scene.id))
    setError(null)
    try {
      const res = await fetch(`/api/scenes/${scene.id}/validate-prompt`, { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || data.error) {
        throw new Error(data.error || `Validate failed (${res.status})`)
      }
      console.info('[validate] ok', { changed: data.changed, drift: data.drift, provider: data.provider })
      await refreshBatch()
      // Flash a green check next to the Image Prompt title for 3 seconds.
      const sceneId = scene.id
      setValidatedFlash(prev => {
        const next = new Map(prev)
        next.set(sceneId, Date.now())
        return next
      })
      setTimeout(() => {
        setValidatedFlash(prev => {
          const next = new Map(prev)
          next.delete(sceneId)
          return next
        })
      }, 3000)
    } catch (e: any) {
      setError(e.message || 'Network error')
    } finally {
      setValidating(prev => {
        const s = new Set(prev)
        s.delete(scene.id)
        return s
      })
    }
  }

  // ─── Reprompt — regenerate this scene's image prompt via Kira ─────────────
  async function repromptScene(topic: TopicInfo, scene: SceneInfo) {
    setReprompting(prev => new Set(prev).add(scene.id))
    setError(null)
    try {
      const res = await fetch(`/api/scenes/${scene.id}/regenerate-prompt`, { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || data.error) {
        const detail = data.details
          ? ` (style=${data.details.artStyle}, niche=${data.details.niche}, sys=${data.details.promptSizes?.system}b, user=${data.details.promptSizes?.user}b)`
          : ''
        throw new Error((data.error || `Reprompt failed (${res.status})`) + detail)
      }
      await refreshBatch()
    } catch (e: any) {
      setError(e.message || 'Network error')
    } finally {
      setReprompting(prev => {
        const s = new Set(prev)
        s.delete(scene.id)
        return s
      })
    }
  }

  async function generateAllForBatch() {
    if (!batch) return
    const pending = batch.topics.filter(t => t.sceneCount === 0 && t.hasStory)
    if (pending.length === 0) {
      setError("No topics with stories to generate scenes for")
      return
    }

    setBatchGenerating(true)
    setBatchProgress({ done: 0, total: pending.length, failed: 0 })
    setError(null)

    const RATE_LIMIT_MS = 2000 // 2s between requests to be polite to Kira
    let done = 0
    let failed = 0

    for (const topic of pending) {
      setGenerating(prev => new Set(prev).add(topic.id))
      try {
        const res = await fetch("/api/scenes/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ topicId: topic.id }),
        })
        const data = await res.json()
        if (!res.ok || data.error) {
          failed++
          console.warn(`[scenes] topic ${topic.id} failed:`, data.error || data)
        }
      } catch (e: any) {
        failed++
        console.warn(`[scenes] topic ${topic.id} error:`, e.message)
      } finally {
        setGenerating(prev => {
          const s = new Set(prev)
          s.delete(topic.id)
          return s
        })
      }
      done++
      setBatchProgress({ done, total: pending.length, failed })
      if (done < pending.length) {
        await new Promise(r => setTimeout(r, RATE_LIMIT_MS))
      }
    }

    // Final refresh
    try {
      const refreshed = await fetch(`/api/scenes/batch/${selectedBatchId}`).then(r => r.json())
      setBatch(refreshed.batch)
    } catch { /* ignore */ }

    setBatchGenerating(false)
    if (failed > 0) {
      setError(`${done - failed}/${pending.length} scenes generated successfully. ${failed} failed.`)
    }
  }

  // ─── Initial screen: pick a batch ──────────────────────────────────────────
  if (!selectedBatchId) {
    return (
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Sparkles className="w-6 h-6" /> Scene Generation
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Pick a topic batch to generate visual scenes from each story.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Select a Topic Batch</CardTitle>
          </CardHeader>
          <CardContent>
            {loadingBatches ? (
              <div className="flex items-center gap-2 py-4">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-sm text-muted-foreground">Loading batches...</span>
              </div>
            ) : batches.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4">
                No topic batches yet. Go to the <strong>Topics</strong> page, generate or search stories, and save them into a batch first.
              </p>
            ) : (
              <div className="border rounded-md max-h-96 overflow-y-auto">
                {batches.map(b => (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => setSelectedBatchId(String(b.id))}
                    className="w-full text-left px-4 py-3 border-b last:border-0 hover:bg-accent transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium">{b.name}</div>
                        <div className="text-xs text-muted-foreground">
                          Batch #{b.id} · {b.topicCount} topic{b.topicCount !== 1 ? "s" : ""} · {new Date(b.createdAt).toLocaleDateString()}
                        </div>
                      </div>
                      <ArrowLeft className="w-4 h-4 rotate-180 text-muted-foreground" />
                    </div>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {error && (
          <div className="text-sm text-red-600 bg-red-50 p-3 rounded-md border border-red-200">
            {error}
          </div>
        )}
      </div>
    )
  }

  // ─── Detail screen: show topics + generate buttons ────────────────────────
  const pendingCount = batch?.topics.filter(t => t.sceneCount === 0 && t.hasStory).length ?? 0
  const generatedCount = batch?.topics.filter(t => t.sceneCount > 0).length ?? 0
  const noStoryCount = batch?.topics.filter(t => !t.hasStory).length ?? 0
  const totalSceneCount = batch?.topics.reduce((sum, t) => sum + (t.sceneCount || 0), 0) ?? 0

  return (
    <div className="flex-1 min-w-0 flex flex-col">
      <header className="flex items-center justify-between gap-3 px-6 py-5 border-b bg-card flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <Button
            variant="outline"
            size="sm"
            onClick={() => { setSelectedBatchId(""); setBatch(null); setError(null) }}
          >
            <ArrowLeft className="w-4 h-4" /> Back
          </Button>
          <div className="min-w-0">
            <h1 className="text-xl font-bold flex items-center gap-2 leading-tight">
              <Sparkles className="w-5 h-5" /> {batch?.name ?? `Batch #${selectedBatchId}`}
            </h1>
            <p className="text-sm text-muted-foreground leading-tight mt-1">
              {generatedCount} generated · {pendingCount} pending · {noStoryCount} without story
            </p>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          {batchGenerating && (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Loader2 className="w-3 h-3 animate-spin" />
              {batchProgress.done}/{batchProgress.total}
            </span>
          )}
          <Button
            onClick={generateAllForBatch}
            disabled={batchGenerating || pendingCount === 0}
          >
            {batchGenerating ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Generating…
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                Generate All ({pendingCount})
              </>
            )}
          </Button>
          <Button
            variant="outline"
            onClick={validateAllForBatch}
            disabled={validatingAll || totalSceneCount === 0 || batchGenerating || batchAssetsGenerating}
            title="Audit + repair every scene's image prompt in this batch (anchored to narration + canonical art style)"
          >
            {validatingAll ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Validating…
              </>
            ) : (
              <>
                <ShieldCheck className="w-4 h-4" />
                Validate All ({totalSceneCount})
              </>
            )}
          </Button>
          {batchAssetsGenerating && (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Loader2 className="w-3 h-3 animate-spin" />
              Assets {batchAssetProgress.done}/{batchAssetProgress.total}
            </span>
          )}
          <Button
            variant="outline"
            onClick={generateAssetsForBatch}
            disabled={batchAssetsGenerating || generatedCount === 0 || batchGenerating}
          >
            {batchAssetsGenerating ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Generating…
              </>
            ) : (
              <>
                <Wand2 className="w-4 h-4" />
                Generate Assets ({generatedCount})
              </>
            )}
          </Button>
          <Button
            variant="default"
            onClick={renderBatchVideo}
            disabled={renderingVideo || batchAssetsGenerating || generatedCount === 0 || batchGenerating}
            title="Render final video using Remotion + RX 560 GPU (hardware h264 encoding)"
          >
            {renderingVideo ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Rendering…
              </>
            ) : (
              <>
                <Film className="w-4 h-4" />
                Render Video
              </>
            )}
          </Button>
        </div>
      </header>

      <div className="flex-1 px-6 py-6 space-y-4">

      {error && (
        <div className="text-sm text-red-600 bg-red-50 p-3 rounded-md border border-red-200">
          {error}
        </div>
      )}

      {renderError && (
        <div className="text-sm text-red-600 bg-red-50 p-3 rounded-md border border-red-200">
          {renderError}
        </div>
      )}

      {/* ─── Video preview modal (full-screen) ─────────────────────────── */}
      {previewVideoUrl && (
        <div
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setPreviewVideoUrl(null)}
        >
          <div
            className="relative max-w-4xl w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setPreviewVideoUrl(null)}
              className="absolute -top-2 -right-2 z-10 rounded-full bg-black/60 text-white p-1 hover:bg-black/80"
              aria-label="Close preview"
            >
              <X className="w-5 h-5" />
            </button>
            <video
              src={previewVideoUrl}
              controls
              autoPlay
              className="w-full rounded-lg shadow-2xl"
              style={{ maxHeight: '85vh' }}
            />
          </div>
        </div>
      )}

      {loadingBatch ? (
        <div className="flex items-center gap-2 py-8 justify-center">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-sm text-muted-foreground">Loading topics...</span>
        </div>
      ) : !batch || batch.topics.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            No topics in this batch.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {batch.topics.map(topic => {
            const isGenerating = generating.has(topic.id)
            const hasScenes = topic.sceneCount > 0
            const targetScenes = topic.seriesDurationBucket
              ? SCENE_TARGETS[topic.seriesDurationBucket] ?? null
              : null
            const durationLabel = topic.seriesDurationBucket
              ? DURATION_LABELS[topic.seriesDurationBucket] ?? topic.seriesDurationBucket
              : null
            return (
              <Card key={topic.id} className={hasScenes ? "border-green-200" : ""}>
                <CardContent className="py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0 space-y-2">
                      <h3 className="font-medium">{topic.title}</h3>
                      <div className="flex items-center gap-2 flex-wrap">
                        {topic.sourceType === "youtube" ? (
                          <Badge variant="outline" className="text-xs gap-1">
                            <Youtube className="w-3 h-3" /> YouTube
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs gap-1">
                            <Bot className="w-3 h-3" /> AI
                          </Badge>
                        )}
                        {hasScenes ? (
                          <button
                            type="button"
                            onClick={() => {
                              setExpandedTopics(prev => {
                                const s = new Set(prev)
                                if (s.has(topic.id)) s.delete(topic.id)
                                else s.add(topic.id)
                                return s
                              })
                            }}
                            className="inline-flex items-center gap-1 rounded-full border border-green-300 bg-green-100 text-green-700 px-2.5 py-0.5 text-xs hover:bg-green-200 transition-colors"
                          >
                            <CheckCircle2 className="w-3 h-3" />
                            {topic.sceneCount} scene{topic.sceneCount !== 1 ? "s" : ""}
                            {expandedTopics.has(topic.id)
                              ? <ChevronUp className="w-3 h-3 ml-1 opacity-70" />
                              : <ChevronDown className="w-3 h-3 ml-1 opacity-70" />}
                            {targetScenes && topic.sceneCount !== targetScenes && (
                              <span className="text-orange-600 ml-1">(target {targetScenes})</span>
                            )}
                          </button>
                        ) : targetScenes ? (
                          <Badge variant="outline" className="text-xs gap-1">
                            Target {targetScenes} scenes
                          </Badge>
                        ) : null}
                        {!topic.hasStory && (
                          <Badge variant="outline" className="text-xs gap-1 text-orange-600 border-orange-300">
                            <AlertCircle className="w-3 h-3" /> No story
                          </Badge>
                        )}
                        {topic.nicheCategory && (
                          <Badge variant="secondary" className="text-xs">
                            {topic.nicheCategory}
                          </Badge>
                        )}
                        {durationLabel && (
                          <Badge variant="outline" className="text-xs gap-1">
                            <Clock className="w-3 h-3" /> {durationLabel}
                          </Badge>
                        )}
                        {topic.artStyleName && (
                          <Badge variant="outline" className="text-xs">
                            {topic.artStyleName}
                          </Badge>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                        {topic.sourceUrl && (
                          <a href={topic.sourceUrl} target="_blank" rel="noopener noreferrer"
                            className="flex items-center gap-1 text-blue-600 hover:underline">
                            <ExternalLink className="w-3 h-3" /> Watch
                          </a>
                        )}
                        {topic.sourceViews != null && (
                          <span className="flex items-center gap-1">
                            <BarChart2 className="w-3 h-3" />
                            {topic.sourceViews.toLocaleString()} views
                          </span>
                        )}
                        {topic.sourceDuration != null && (
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {Math.floor(topic.sourceDuration / 60)}:{(topic.sourceDuration % 60).toString().padStart(2, '0')}
                          </span>
                        )}
                        {topic.fullStory && (
                          <span className="flex items-center gap-1">
                            <FileText className="w-3 h-3" /> story {topic.fullStory.length} chars
                          </span>
                        )}
                        {topic.sourceTranscript && (
                          <span className="flex items-center gap-1">
                            <FileText className="w-3 h-3" /> transcript {topic.sourceTranscript.length} chars
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-row gap-2 flex-wrap items-start">
                      <Button
                        size="sm"
                        onClick={() => generateForTopic(topic)}
                        disabled={isGenerating || batchGenerating || !topic.hasStory}
                        variant={hasScenes ? "outline" : "default"}
                      >
                        {isGenerating ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : hasScenes ? (
                          <Sparkles className="w-4 h-4" />
                        ) : (
                          <Play className="w-4 h-4" />
                        )}
                        {isGenerating
                          ? 'Regenerating…'
                          : hasScenes
                          ? 'Regenerate Scenes'
                          : 'Generate Scenes'}
                      </Button>
                      {hasScenes && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => generateAssetsFor(topic)}
                          disabled={generatingAssets.has(topic.id) || batchAssetsGenerating}
                        >
                          {generatingAssets.has(topic.id) ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Wand2 className="w-4 h-4" />
                          )}
                          {generatingAssets.has(topic.id) ? 'Generating…' : 'Generate Assets'}
                        </Button>
                      )}
                      {hasScenes && topic.imagesReady === topic.sceneCount && topic.audiosReady === topic.sceneCount && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => renderSingleTopic(String(topic.id))}
                          disabled={renderingVideo || renderingBatchId !== null}
                          title="Render this topic into one MP4 using RX 560 GPU"
                        >
                          {(renderingVideo && renderJobId !== null) ||
                           (renderingBatchId !== null && batchRenderResults[String(topic.id)]?.status === 'rendering') ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <VideoIcon className="w-4 h-4" />
                          )}
                          {renderingVideo || batchRenderResults[String(topic.id)]?.status === 'rendering'
                            ? 'Rendering…'
                            : 'Render Video'}
                        </Button>
                      )}
                      {(topicVideoUrls[String(topic.id)] || (topic as any).renderedVideoUrl) && (
                        <Button
                          size="sm"
                          variant="default"
                          onClick={() => setPreviewVideoUrl(topicVideoUrls[String(topic.id)] || (topic as any).renderedVideoUrl)}
                          title="Open the rendered video in a popup"
                        >
                          <Play className="w-4 h-4" />
                          View Video
                        </Button>
                      )}
                    </div>
                    {batchRenderResults[String(topic.id)]?.status === 'rendering' && (
                      <div className="mt-1 text-xs text-muted-foreground flex items-center gap-1">
                        <Loader2 className="w-3 h-3 animate-spin" /> Rendering…
                      </div>
                    )}
                    {batchRenderResults[String(topic.id)]?.status === 'failed' && (
                      <div className="mt-1 text-xs text-red-600">
                        Render failed: {batchRenderResults[String(topic.id)].error || 'unknown error'}
                      </div>
                    )}
                  </div>

                  {/* ─── Inline scenes accordion ─────────────────────────────────── */}
                  {hasScenes && expandedTopics.has(topic.id) && (
                    <div className="mt-4 space-y-3 border-t pt-3">
                      {topic.scenes.map((scene) => {
                        const isLong = topic.seriesDurationBucket?.startsWith('long_')
                        return (
                        <div key={scene.id} className="border rounded-lg p-3 bg-muted/30">
                          <div className="flex items-center justify-between mb-2">
                            <Badge variant="outline" className="text-xs font-mono">
                              Scene {scene.index + 1}
                            </Badge>
                            <div className="flex items-center gap-1">
                              {scene.imagePath && (
                                <Badge variant="outline" className="text-xs text-green-600 border-green-300">
                                  Image
                                </Badge>
                              )}
                              {scene.audioPath && (
                                <Badge variant="outline" className="text-xs text-blue-600 border-blue-300">
                                  Audio
                                </Badge>
                              )}
                            </div>
                          </div>

                          {/* ─── 30/70 two-column layout ─────────────────────────────────── */}
                          <div className="grid grid-cols-10 gap-3">
                            {/* LEFT (30%): Image + Voice-over stacked vertically */}
                            <div className="col-span-3 space-y-3">
                              {/* Image preview + button */}
                              <div className="space-y-1">
                                <div className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                                  <ImageIcon className="w-3 h-3" /> Image
                                </div>
                                {scene.imagePath ? (
                                  <button
                                    type="button"
                                    onClick={() => setPreviewImage({
                                      src: scene.imagePath!,
                                      alt: `Scene ${scene.index + 1}`,
                                      aspectRatio: isLong ? '16:9' : '9:16',
                                    })}
                                    className="relative block w-full group cursor-zoom-in"
                                    aria-label={`Open Scene ${scene.index + 1} image in full size`}
                                  >
                                    <img
                                      src={scene.imagePath}
                                      alt={`Scene ${scene.index + 1}`}
                                      className={`rounded border w-full object-cover ${isLong ? 'aspect-video' : 'aspect-[9/16]'} max-h-64`}
                                      loading="lazy"
                                    />
                                    <div className="absolute inset-0 rounded bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                                      <Maximize2 className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                                    </div>
                                  </button>
                                ) : (
                                  <div className={`mx-auto w-full bg-background border border-dashed rounded flex items-center justify-center text-xs text-muted-foreground ${isLong ? 'aspect-video max-h-64' : 'aspect-[9/16] max-h-64'}`}>
                                    No image yet
                                  </div>
                                )}
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => generateImageForOneScene(topic, scene)}
                                  disabled={generatingSceneImage.has(scene.id) || batchAssetsGenerating}
                                  className="w-full gap-1"
                                >
                                  {generatingSceneImage.has(scene.id) ? (
                                    <>
                                      <Loader2 className="w-3 h-3 animate-spin" />
                                      Generating…
                                    </>
                                  ) : (
                                    <>
                                      <ImageIcon className="w-3 h-3" />
                                      {scene.imagePath ? 'Regenerate' : 'Generate Image'}
                                    </>
                                  )}
                                </Button>
                              </div>

                              {/* Voice-over */}
                              <div className="space-y-1">
                                <div className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                                  <Volume2 className="w-3 h-3" /> Voice-over
                                </div>
                                {scene.audioPath ? (
                                  <audio
                                    controls
                                    src={scene.audioPath}
                                    className="w-full h-9"
                                  >
                                    Your browser does not support the audio element.
                                  </audio>
                                ) : (
                                  <div className="w-full h-9 bg-background border border-dashed rounded flex items-center justify-center text-xs text-muted-foreground">
                                    No audio yet
                                  </div>
                                )}
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => generateAudioForOneScene(topic, scene)}
                                  disabled={generatingSceneAudio.has(scene.id) || batchAssetsGenerating}
                                  className="w-full gap-1"
                                >
                                  {generatingSceneAudio.has(scene.id) ? (
                                    <>
                                      <Loader2 className="w-3 h-3 animate-spin" />
                                      Generating…
                                    </>
                                  ) : (
                                    <>
                                      <Volume2 className="w-3 h-3" />
                                      {scene.audioPath ? 'Regenerate' : 'Generate Audio'}
                                    </>
                                  )}
                                </Button>
                              </div>

                              {/* Reprompt moved to right column header next to "Image Prompt" title */}
                            </div>

                            {/* RIGHT (70%): Narration + Image Prompt stacked vertically */}
                            <div className="col-span-7 space-y-3">
                              {/* Narration */}
                              <div className="space-y-1">
                                <div className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                                  <FileText className="w-3 h-3" /> Narration
                                </div>
                                <p className="text-sm leading-relaxed bg-background p-3 rounded border min-h-[80px]">
                                  {scene.narration || "(empty)"}
                                </p>
                              </div>

                              {/* Image Prompt */}
                              <div className="space-y-1">
                                <div className="flex items-center justify-between gap-2">
                                  <div className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                                    <Eye className="w-3 h-3" /> Image Prompt
                                    {validatedFlash.has(scene.id) && (
                                      <CheckCircle2
                                        className="w-3.5 h-3.5 text-green-600 animate-in fade-in"
                                        aria-label="Validated"
                                      />
                                    )}
                                  </div>
                                  <div className="flex items-center gap-1">
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => validateScene(topic, scene)}
                                      disabled={validating.has(scene.id) || reprompting.has(scene.id) || batchAssetsGenerating}
                                      className="h-7 gap-1 text-xs"
                                      title="Audit + repair prompt anchored to narration + canonical art style"
                                    >
                                      {validating.has(scene.id) ? (
                                        <>
                                          <Loader2 className="w-3 h-3 animate-spin" />
                                          Validating…
                                        </>
                                      ) : (
                                        <>
                                          <ShieldCheck className="w-3 h-3" />
                                          Validate
                                        </>
                                      )}
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => repromptScene(topic, scene)}
                                      disabled={reprompting.has(scene.id) || validating.has(scene.id) || batchAssetsGenerating}
                                      className="h-7 gap-1 text-xs"
                                    >
                                      {reprompting.has(scene.id) ? (
                                        <>
                                          <Loader2 className="w-3 h-3 animate-spin" />
                                          Reprompting…
                                        </>
                                      ) : (
                                        <>
                                          <RotateCcw className="w-3 h-3" />
                                          Regenerate
                                        </>
                                      )}
                                    </Button>
                                  </div>
                                </div>
                                <p className="text-sm leading-relaxed bg-background p-3 rounded border italic min-h-[80px]">
                                  {scene.prompt || "(empty)"}
                                </p>
                              </div>
                            </div>
                          </div>
                        </div>
                        )
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
      {/* Image preview modal — shows full-size image at actual aspect ratio */}
      {previewImage && (
        <ImagePreviewModal
          src={previewImage.src}
          alt={previewImage.alt}
          aspectRatio={previewImage.aspectRatio}
          onClose={() => setPreviewImage(null)}
        />
      )}
      </div>
    </div>
  )
}

// Full-size image preview modal. Renders the image at its real aspect ratio
// (9:16 for shorts, 16:9 for long-form), centered on a dark backdrop.
// Closes on backdrop click, ESC key, or the X button.
function ImagePreviewModal({
  src,
  alt,
  aspectRatio,
  onClose,
}: {
  src: string
  alt: string
  aspectRatio: string
  onClose: () => void
}) {
  // ESC key closes the modal
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  // Lock body scroll while modal is open
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  const aspectClass = aspectRatio === '16:9' ? 'aspect-video' : 'aspect-[9/16]'

  return (
    <div
      className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={alt}
    >
      {/* Close button — fixed to top right */}
      <button
        type="button"
        onClick={onClose}
        className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 border border-white/20 flex items-center justify-center transition-colors"
        aria-label="Close preview"
      >
        <X className="w-5 h-5 text-white" />
      </button>

      {/* Aspect-ratio badge — top-left */}
      <div className="absolute top-4 left-4 px-3 py-1 rounded-full bg-white/10 border border-white/20 text-xs font-mono text-white">
        {aspectRatio}
      </div>

      {/* Image container — click events stop here so clicking the image doesn't close */}
      <div
        className={`relative ${aspectClass} max-h-[90vh] max-w-[90vw] shadow-2xl`}
        onClick={(e) => e.stopPropagation()}
      >
        <img
          src={src}
          alt={alt}
          className={`w-full h-full object-contain rounded-lg bg-black`}
        />
      </div>
    </div>
  )
}
