'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import {
  CheckCircle, ChevronRight, ChevronLeft, Sparkles, Mic, Music, Palette,
  Zap, Share2, Layout, Play, Upload
} from 'lucide-react'

const STEPS = [
  { id: 'niche', label: 'Niche', icon: Sparkles },
  { id: 'voice', label: 'Voice', icon: Mic },
  { id: 'music', label: 'Music', icon: Music },
  { id: 'art-style', label: 'Art Style', icon: Palette },
  { id: 'effects', label: 'Effects', icon: Zap },
  { id: 'socials', label: 'Socials', icon: Share2 },
  { id: 'series', label: 'Series', icon: Layout },
]

interface OnboardingData {
  niches: any[]
  artStyles: any[]
  voiceStyles: any[]
  backgroundMusic: any[]
  effects: any[]
}

interface SavedState {
  completed: boolean
  step: string
  nicheId: number | null
  artStyleId: number | null
  voiceStyleId: number | null
  backgroundMusicId: number | null
  customMusicPath: string | null
  effectIds: number[]
  socials: any[]
  series: {
    contentMode: string
    videoDuration: string
    videosPerDay: number
    publishTimes: string[]
  }
}

const SOCIAL_PLATFORMS = [
  { platform: 'youtube', label: 'YouTube', color: 'bg-red-500' },
  { platform: 'twitter', label: 'X (Twitter)', color: 'bg-black' },
  { platform: 'instagram', label: 'Instagram', color: 'bg-pink-500' },
  { platform: 'tiktok', label: 'TikTok', color: 'bg-cyan-500' },
]

const DURATION_OPTIONS = [
  { value: 'short_30_40', label: 'Shorts (30–40 sec)' },
  { value: 'short_50_60', label: 'Shorts (50–60 sec)' },
  { value: 'long_60_120', label: 'Long Form (60s–2min)' },
  { value: 'long_120_300', label: 'Long Form (2–5min)' },
]

const CONTENT_MODE_OPTIONS = [
  { value: 'single', label: 'Single Videos' },
  { value: 'series', label: 'Series (Same Format)' },
  { value: 'long_form', label: 'Long Form Only' },
]

export default function OnboardingPage() {
  const router = useRouter()
  const [data, setData] = useState<OnboardingData | null>(null)
  const [currentStep, setCurrentStep] = useState(0)
  const [saving, setSaving] = useState(false)
  const [savingStep, setSavingStep] = useState(false)

  // Saved selections
  const [selectedNiche, setSelectedNiche] = useState<number | null>(null)
  const [selectedVoice, setSelectedVoice] = useState<number | null>(null)
  const [selectedMusic, setSelectedMusic] = useState<number | null>(null)
  const [customMusicPath, setCustomMusicPath] = useState<string | null>(null)
  const [selectedArtStyle, setSelectedArtStyle] = useState<number | null>(null)
  const [selectedEffects, setSelectedEffects] = useState<number[]>([])
  const [connectedSocials, setConnectedSocials] = useState<string[]>(['youtube'])
  const [contentMode, setContentMode] = useState('single')
  const [videoDuration, setVideoDuration] = useState('short_30_40')
  const [videosPerDay, setVideosPerDay] = useState(1)
  const [publishTimes, setPublishTimes] = useState<string[]>(['09:00'])

  // Load options + saved state in parallel
  useEffect(() => {
    Promise.all([
      fetch('/api/onboarding/options').then(r => r.json()),
      fetch('/api/onboarding/status').then(r => r.json()),
    ]).then(([options, status]) => {
      setData(options)

      // Restore saved selections
      if (status.niche?.id) setSelectedNiche(status.niche.id)
      if (status.voiceStyle?.id) setSelectedVoice(status.voiceStyle.id)
      if (status.backgroundMusic?.id) setSelectedMusic(status.backgroundMusic.id)
      if (status.backgroundMusic?.customPath) setCustomMusicPath(status.backgroundMusic.customPath)
      if (status.artStyle?.id) setSelectedArtStyle(status.artStyle.id)
      if (status.effects?.length) setSelectedEffects(status.effects.map((e: any) => e.id))
      if (status.socials) {
        const connected = status.socials.filter((s: any) => s.status === 'connected').map((s: any) => s.platform)
        setConnectedSocials(connected.length ? connected : ['youtube'])
      }
      if (status.series) {
        setContentMode(status.series.contentMode || 'single')
        setVideoDuration(status.series.videoDuration || 'short_30_40')
        setVideosPerDay(status.series.videosPerDay || 1)
        setPublishTimes(status.series.publishTimes?.length ? status.series.publishTimes : ['09:00'])
      }

      // Jump to current step
      const stepIndex = STEPS.findIndex(s => s.id === status.step)
      setCurrentStep(stepIndex >= 0 ? stepIndex : 0)
    })
  }, [])

  const save = useCallback(async (stepData: any) => {
    setSavingStep(true)
    try {
      const res = await fetch('/api/onboarding/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(stepData),
      })
      return res.ok
    } finally {
      setSavingStep(false)
    }
  }, [])

  const next = useCallback(async () => {
    setSaving(true)
    try {
      if (currentStep === 0) {
        await save({ nicheId: selectedNiche })
      } else if (currentStep === 1) {
        await save({ voiceStyleId: selectedVoice })
      } else if (currentStep === 2) {
        await save({
          backgroundMusicId: selectedMusic,
          customMusicPath: customMusicPath || null,
        })
      } else if (currentStep === 3) {
        await save({ artStyleId: selectedArtStyle })
      } else if (currentStep === 4) {
        await save({ effectIds: selectedEffects })
      } else if (currentStep === 5) {
        // Socials — just mark as saved for now (actual OAuth is per-platform)
        const socialPayload = connectedSocials.map(platform => ({
          platform,
          status: platform === 'youtube' ? 'connected' : 'pending',
          accountId: platform === 'youtube' ? 'UCfU10lrpxkfYX9EbVlqcnEg' : null,
          accountName: platform === 'youtube' ? 'Your Channel' : null,
        }))
        await save({ socials: socialPayload })
      } else if (currentStep === 6) {
        await save({
          series: {
            contentMode,
            videoDuration,
            videosPerDay,
            publishTimes,
          },
        })
        // Complete onboarding
        await save({ complete: true })
        router.push('/dashboard')
        return
      }

      if (currentStep < STEPS.length - 1) {
        setCurrentStep(prev => prev + 1)
      }
    } finally {
      setSaving(false)
    }
  }, [currentStep, selectedNiche, selectedVoice, selectedMusic, customMusicPath, selectedArtStyle, selectedEffects, connectedSocials, contentMode, videoDuration, videosPerDay, publishTimes, save, router])

  const back = useCallback(() => {
    if (currentStep > 0) setCurrentStep(prev => prev - 1)
  }, [currentStep])

  if (!data) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    )
  }

  const step = STEPS[currentStep]

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold">Welcome to ytautomation</h1>
          <p className="text-muted-foreground mt-1">Set up your channel in 7 quick steps</p>
        </div>

        {/* Progress Steps */}
        <div className="flex items-center gap-2 mb-8 overflow-x-auto pb-2">
          {STEPS.map((s, i) => {
            const Icon = s.icon
            const isActive = i === currentStep
            const isDone = i < currentStep
            return (
              <div key={s.id} className="flex items-center gap-2">
                <button
                  onClick={() => i < currentStep && setCurrentStep(i)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-colors whitespace-nowrap ${
                    isActive ? 'bg-primary text-primary-foreground' :
                    isDone ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300 cursor-pointer' :
                    'bg-muted text-muted-foreground'
                  }`}
                >
                  {isDone ? <CheckCircle className="w-4 h-4" /> : <Icon className="w-4 h-4" />}
                  {s.label}
                </button>
                {i < STEPS.length - 1 && (
                  <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                )}
              </div>
            )
          })}
        </div>

        {/* Step Content */}
        <Card className="min-h-[400px]">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {(() => { const Icon = step.icon; return <Icon className="w-5 h-5" /> })()}
              {step.label}
            </CardTitle>
            <CardDescription>
              {currentStep === 0 && 'Choose the content category for your channel'}
              {currentStep === 1 && 'Select the voice style for narration'}
              {currentStep === 2 && 'Pick background music or upload your own'}
              {currentStep === 3 && 'Choose the visual art style for your scenes'}
              {currentStep === 4 && 'Select camera/motion effects for your videos'}
              {currentStep === 5 && 'Connect your social media accounts'}
              {currentStep === 6 && 'Configure your content schedule'}
            </CardDescription>
          </CardHeader>
          <CardContent>

            {/* STEP 0: NICHE */}
            {currentStep === 0 && (
              <div className="grid gap-3">
                {data.niches.map(niche => (
                  <button
                    key={niche.id}
                    onClick={() => setSelectedNiche(niche.id)}
                    className={`text-left p-4 rounded-lg border-2 transition-colors ${
                      selectedNiche === niche.id
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-primary/50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-semibold">{niche.name}</div>
                        <div className="text-sm text-muted-foreground">{niche.description}</div>
                        <div className="text-xs text-muted-foreground mt-1">
                          Art style: {niche.category} · {niche.series?.length ?? 0} channels
                        </div>
                      </div>
                      {selectedNiche === niche.id && (
                        <CheckCircle className="w-5 h-5 text-primary shrink-0" />
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}

            {/* STEP 1: VOICE */}
            {currentStep === 1 && (
              <div className="space-y-3">
                {data.voiceStyles.map(voice => (
                  <button
                    key={voice.id}
                    onClick={() => setSelectedVoice(voice.id)}
                    className={`text-left w-full p-4 rounded-lg border-2 transition-colors ${
                      selectedVoice === voice.id
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-primary/50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-semibold">{voice.name}</div>
                        <div className="text-sm text-muted-foreground">{voice.description}</div>
                        <div className="flex gap-1 mt-1">
                          {voice.tags?.map((tag: string) => (
                            <Badge key={tag} variant="outline" className="text-xs">{tag}</Badge>
                          ))}
                        </div>
                      </div>
                      {selectedVoice === voice.id && (
                        <CheckCircle className="w-5 h-5 text-primary shrink-0" />
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}

            {/* STEP 2: MUSIC */}
            {currentStep === 2 && (
              <div className="space-y-6">
                {/* Curated music */}
                <div>
                  <Label className="text-sm font-medium mb-2 block">Curated Music</Label>
                  <div className="grid gap-2">
                    {['horror', 'calm', 'epic', 'action', 'comedy', 'motivational'].map(cat => {
                      const music = data.backgroundMusic.find((m: any) => m.category === cat)
                      if (!music) return null
                      return (
                        <button
                          key={music.id}
                          onClick={() => { setSelectedMusic(music.id); setCustomMusicPath(null) }}
                          className={`text-left p-3 rounded-lg border-2 transition-colors ${
                            selectedMusic === music.id
                              ? 'border-primary bg-primary/5'
                              : 'border-border hover:border-primary/50'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <div className="font-medium capitalize">{music.category}</div>
                              <div className="text-xs text-muted-foreground">
                                {music.isUploaded ? '✓ file ready' : '⚠ no file yet — upload to activate'}
                              </div>
                            </div>
                            {selectedMusic === music.id && <CheckCircle className="w-4 h-4 text-primary" />}
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </div>

                <Separator />

                {/* Custom upload */}
                <div>
                  <Label className="text-sm font-medium mb-2 block">Upload Your Own Music</Label>
                  <div
                    onClick={() => { setCustomMusicPath('/uploads/custom-music.mp3'); setSelectedMusic(null) }}
                    className={`p-6 rounded-lg border-2 border-dashed cursor-pointer transition-colors ${
                      customMusicPath
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-primary/50'
                    }`}
                  >
                    <div className="flex flex-col items-center gap-2 text-center">
                      <Upload className="w-8 h-8 text-muted-foreground" />
                      <div className="font-medium">Drop audio file or click to upload</div>
                      <div className="text-xs text-muted-foreground">MP3, WAV, OGG — max 10MB</div>
                      {customMusicPath && <Badge className="bg-primary">{customMusicPath}</Badge>}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* STEP 3: ART STYLE */}
            {currentStep === 3 && (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {data.artStyles.map(style => (
                  <button
                    key={style.id}
                    onClick={() => setSelectedArtStyle(style.id)}
                    className={`text-left p-3 rounded-lg border-2 transition-colors ${
                      selectedArtStyle === style.id
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-primary/50'
                    }`}
                  >
                    <div className="font-semibold text-sm">{style.name}</div>
                    <div className="text-xs text-muted-foreground mt-1 line-clamp-2">
                      {style.description}
                    </div>
                    {selectedArtStyle === style.id && (
                      <CheckCircle className="w-4 h-4 text-primary mt-2" />
                    )}
                  </button>
                ))}
              </div>
            )}

            {/* STEP 4: EFFECTS */}
            {currentStep === 4 && (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground mb-3">
                  Select all effects you want. These will be randomly applied to scenes.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {data.effects.map(effect => (
                    <label
                      key={effect.id}
                      className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                        selectedEffects.includes(effect.id)
                          ? 'border-primary bg-primary/5'
                          : 'border-border hover:border-primary/50'
                      }`}
                    >
                      <Checkbox
                        checked={selectedEffects.includes(effect.id)}
                        onCheckedChange={(checked) => {
                          if (checked) setSelectedEffects(prev => [...prev, effect.id])
                          else setSelectedEffects(prev => prev.filter(id => id !== effect.id))
                        }}
                        className="mt-0.5"
                      />
                      <div>
                        <div className="font-medium text-sm">{effect.name}</div>
                        <div className="text-xs text-muted-foreground">{effect.description}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* STEP 5: SOCIALS */}
            {currentStep === 5 && (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Connect your accounts to enable automatic publishing. Only YouTube is fully configured.
                </p>
                <div className="space-y-3">
                  {SOCIAL_PLATFORMS.map(({ platform, label, color }) => {
                    const isConnected = connectedSocials.includes(platform)
                    return (
                      <div
                        key={platform}
                        className={`flex items-center justify-between p-4 rounded-lg border-2 ${
                          isConnected ? 'border-green-500 bg-green-50 dark:bg-green-950' : 'border-border'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-lg ${color} flex items-center justify-center text-white font-bold text-sm`}>
                            {platform === 'youtube' ? 'YT' : platform === 'twitter' ? 'X' : platform === 'instagram' ? 'IG' : 'TT'}
                          </div>
                          <div>
                            <div className="font-semibold">{label}</div>
                            <div className="text-xs text-muted-foreground">
                              {platform === 'youtube' ? 'Already connected ✓' : 'Click to connect OAuth'}
                            </div>
                          </div>
                        </div>
                        {platform === 'youtube' ? (
                          <Badge className="bg-green-500">Connected</Badge>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setConnectedSocials(prev => [...prev, platform])}
                          >
                            Connect
                          </Button>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* STEP 6: SERIES / CONTENT SETTINGS */}
            {currentStep === 6 && (
              <div className="space-y-6">
                {/* Content Mode */}
                <div className="space-y-2">
                  <Label>Content Type</Label>
                  <div className="grid grid-cols-3 gap-2">
                    {CONTENT_MODE_OPTIONS.map(opt => (
                      <button
                        key={opt.value}
                        onClick={() => setContentMode(opt.value)}
                        className={`p-3 rounded-lg border-2 text-sm font-medium transition-colors ${
                          contentMode === opt.value ? 'border-primary bg-primary/5' : 'border-border'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Video Duration */}
                <div className="space-y-2">
                  <Label>Video Duration</Label>
                  <Select value={videoDuration} onValueChange={setVideoDuration}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DURATION_OPTIONS.map(opt => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Videos Per Day */}
                <div className="space-y-2">
                  <Label>Videos Per Day</Label>
                  <div className="flex gap-2">
                    {[1, 2, 4].map(n => (
                      <button
                        key={n}
                        onClick={() => setVideosPerDay(n)}
                        className={`flex-1 p-3 rounded-lg border-2 font-medium transition-colors ${
                          videosPerDay === n ? 'border-primary bg-primary/5' : 'border-border'
                        }`}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Publish Times */}
                <div className="space-y-2">
                  <Label>Publish Times</Label>
                  <p className="text-xs text-muted-foreground">
                    Based on {videosPerDay} video{videosPerDay > 1 ? 's' : ''} per day
                  </p>
                  <div className="flex gap-2 flex-wrap">
                    {videosPerDay >= 1 && (
                      <div className="flex items-center gap-1">
                        <Label className="text-sm w-12">Slot 1</Label>
                        <input
                          type="time"
                          value={publishTimes[0] || '09:00'}
                          onChange={e => {
                            const next = [...publishTimes]
                            next[0] = e.target.value
                            setPublishTimes(next)
                          }}
                          className="border rounded px-2 py-1 text-sm"
                        />
                      </div>
                    )}
                    {videosPerDay >= 2 && (
                      <div className="flex items-center gap-1">
                        <Label className="text-sm w-12">Slot 2</Label>
                        <input
                          type="time"
                          value={publishTimes[1] || '14:00'}
                          onChange={e => {
                            const next = [...publishTimes]
                            next[1] = e.target.value
                            setPublishTimes(next)
                          }}
                          className="border rounded px-2 py-1 text-sm"
                        />
                      </div>
                    )}
                    {videosPerDay >= 4 && (
                      <div className="flex items-center gap-1">
                        <Label className="text-sm w-12">Slot 3</Label>
                        <input
                          type="time"
                          value={publishTimes[2] || '18:00'}
                          onChange={e => {
                            const next = [...publishTimes]
                            next[2] = e.target.value
                            setPublishTimes(next)
                          }}
                          className="border rounded px-2 py-1 text-sm"
                        />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Navigation */}
            <div className="flex items-center justify-between mt-8 pt-6 border-t">
              <Button
                variant="ghost"
                onClick={back}
                disabled={currentStep === 0}
                className="gap-2"
              >
                <ChevronLeft className="w-4 h-4" />
                Back
              </Button>

              <div className="text-sm text-muted-foreground">
                {currentStep + 1} / {STEPS.length}
              </div>

              <Button
                onClick={next}
                disabled={saving}
                className="gap-2"
              >
                {saving ? 'Saving...' : currentStep === STEPS.length - 1 ? (
                  <>Complete Setup <Play className="w-4 h-4" /></>
                ) : (
                  <>Next <ChevronRight className="w-4 h-4" /></>
                )}
              </Button>
            </div>

          </CardContent>
        </Card>
      </div>
    </div>
  )
}
