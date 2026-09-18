'use client'

import { useState, useTransition, useEffect, useMemo, useRef } from 'react'
import { 
  getSelectedTopics, 
  getAllVideos,
  getAllVideosWithWindowsRenderStatus,
  generateScriptAndScenes,
  deleteVideo,
  deleteFullVideo,
  deleteWindowsVideo,
  deleteTopic,
  updateScene,
  generateSingleSceneImage,
  generateAllSceneImages,
  deleteSceneImage,
  generateSceneAudio,
  generateAllSceneAudio,
  deleteSceneAudio,
  renderVideo,
  pollVideoRender,
  startRenderSingleScene,
  pollSingleSceneRender,
  deleteSceneVideo,
  renderAllScenesSequentially,
  generateThumbnail,
  generateVideoDescriptionAction,
  createIntroScene,
  createIntroSceneWithAudio,
  generateFullVideo,
  exportScenesForWindowsRender,
  prepareAndExportForWindowsRender,
  prepareAndExportForLongFormRender,
  getWindowsRenderCommand,
  markTopicReviewCompleted,
  automateVideoAssets,
  automateAllPendingVideos,
  createBatchRenderList,
  getAutomationStatus,
  generateLongFormScenes,
  fixScenePrompts
} from './actions'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { 
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table'
import Image from 'next/image'
import { 
  Loader2, 
  Sparkles, 
  FileText, 
  Play, 
  CheckCircle,
  AlertCircle,
  Trash2,
  ImageIcon,
  RefreshCw,
  X,
  Volume2,
  Film,
  Video,
  Image as ImageIcon2,
  Copy,
  Edit,
  Check,
  Cpu,
  List
} from 'lucide-react'

interface Topic {
  id: number
  title: string
  selected: boolean
  reviewCompleted?: boolean
  batch?: {
    baseTopic: string
  }
}

interface Scene {
  id: number
  index: number
  narration: string
  prompt: string
  imagePath: string | null
  audioPath: string | null
  sceneVideoPath?: string | null
  description?: string | null
}

interface Video {
  id: number
  title: string
  narration: string
  narrationPath?: string | null
  durationSeconds?: number
  generationStatus: 'generating' | 'ready' | 'failed'
  uploadStatus: 'new' | 'uploaded'
  videoPath?: string | null
  thumbnailPath?: string | null
  description?: string | null
  model?: string | null
  topicId: number
  topic: Topic
  scenes: Scene[]
  hasWindowsRender?: boolean
  windowsRenderCommand?: string | null
  windowsRenderPath?: string | null
  windowsVideoExists?: boolean
  windowsVideoPath?: string | null
}

interface VideosClientProps {
  initialSelectedTopics: Topic[]
  initialVideos: Video[]
  scriptModels: { id: string; name: string }[]
}

const IMAGE_STYLES = [
  { value: 'anime', label: 'Anime / Manga' },
  { value: 'realistic', label: 'Realistic' },
  { value: 'mystical', label: 'Mystical / Fantasy' },
  { value: 'cyberpunk', label: 'Cyberpunk' },
  { value: 'watercolor', label: 'Watercolor' },
  { value: 'oil_painting', label: 'Oil Painting' },
  { value: '3d_render', label: '3D Render' },
  { value: 'digital_art', label: 'Digital Art' },
]

export default function VideosClient({ 
  initialSelectedTopics, 
  initialVideos,
  scriptModels
}: VideosClientProps) {
  const [selectedTopics, setSelectedTopics] = useState(initialSelectedTopics)
  const [videos, setVideos] = useState(initialVideos)
  const [selectedModel, setSelectedModel] = useState<string>(scriptModels[0]?.id || '')
  const [isPending, startTransition] = useTransition()
  const [generatingId, setGeneratingId] = useState<number | null>(null)
  const [generatingTimer, setGeneratingTimer] = useState<number>(0)
  const [generatingSceneId, setGeneratingSceneId] = useState<number | null>(null)
  const [generatingAudioId, setGeneratingAudioId] = useState<number | null>(null)
  const [renderingVideoId, setRenderingVideoId] = useState<number | null>(null)
  const [renderingSceneId, setRenderingSceneId] = useState<number | null>(null)
  const [deletingSceneId, setDeletingSceneId] = useState<number | null>(null)
  const [generatingThumbnailId, setGeneratingThumbnailId] = useState<number | null>(null)
  const [generatingDescriptionId, setGeneratingDescriptionId] = useState<number | null>(null)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const [editingScene, setEditingScene] = useState<number | null>(null)
  const [editNarration, setEditNarration] = useState('')
  const [editPrompt, setEditPrompt] = useState('')
  const [savingScene, setSavingScene] = useState<number | null>(null)

  const [videoModalOpen, setVideoModalOpen] = useState(false)
  const [currentVideoUrl, setCurrentVideoUrl] = useState<string | null>(null)
  const [videoLoading, setVideoLoading] = useState(true)

  const [thumbnailModalOpen, setThumbnailModalOpen] = useState(false)
  const [currentThumbnailUrl, setCurrentThumbnailUrl] = useState<string | null>(null)

  const [imageModalOpen, setImageModalOpen] = useState(false)
  const [currentImageUrl, setCurrentImageUrl] = useState<string | null>(null)

  const [pollingEnabled, setPollingEnabled] = useState(false)
  const pollStartTimeRef = useRef<number | null>(null)
  const MAX_POLL_DURATION_MS = 5 * 60 * 1000 // 5 minutes

  const [generatingIntroId, setGeneratingIntroId] = useState<number | null>(null)
  const [creatingIntroWithAudioId, setCreatingIntroWithAudioId] = useState<number | null>(null)

  // Automation state
  const [isAutomating, setIsAutomating] = useState(false)
  const [automationProgress, setAutomationProgress] = useState({ current: 0, total: 0 })
  const [automationStatus, setAutomationStatus] = useState<{
    totalVideos: number
    withScripts: number
    withImages: number
    withAudio: number
    withJson: number
    withFinalVideo: number
    pending: { id: number; title: string; status: string }[]
  } | null>(null)
  const [isRefreshingStatus, setIsRefreshingStatus] = useState(false)
  const [isCreatingBatchList, setIsCreatingBatchList] = useState(false)
  const [batchRenderInfo, setBatchRenderInfo] = useState<{
    batchFilePath: string
    videoCount: number
    videos: { title: string; jsonPath: string; outputPath: string }[]
  } | null>(null)

  // Long Form Story & Fix Prompts state
  const [selectedStyle, setSelectedStyle] = useState('anime')
  const [isGeneratingLongFormScenes, setIsGeneratingLongFormScenes] = useState(false)
  const [isFixingPrompts, setIsFixingPrompts] = useState(false)

  const getAbsoluteUrl = (url: string) => {
    if (url.startsWith('http')) return url
    // Handle paths starting with '/' to avoid double slash
    if (url.startsWith('/')) {
      const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000'
      return `${baseUrl}${url}`
    }
    // Handle relative paths without leading slash
    const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000'
    return `${baseUrl}/${url}`
  }

  const absoluteVideoUrl = useMemo(() => {
    if (!currentVideoUrl) return null
    return getAbsoluteUrl(currentVideoUrl)
  }, [currentVideoUrl])

  useEffect(() => {
    // Only poll when actively rendering a video (not for script generation)
    const isRendering = renderingVideoId !== null
    
    console.log('[Polling Check] isRendering:', isRendering, 'currentEnabled:', pollingEnabled)
    
    if (isRendering && !pollingEnabled) {
      // Starting polling - record start time
      console.log('[Polling] Enabling polling for video rendering')
      pollStartTimeRef.current = Date.now()
      setPollingEnabled(true)
    } else if (!isRendering) {
      // Stopping polling - reset start time
      if (pollingEnabled) {
        console.log('[Polling] Disabling polling')
        pollStartTimeRef.current = null
        setPollingEnabled(false)
      }
    }
  }, [renderingVideoId])

  // Timer effect for full video generation
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null
    if (generatingId !== null) {
      setGeneratingTimer(0)
      interval = setInterval(() => {
        setGeneratingTimer(t => t + 1)
      }, 1000)
    }
    return () => {
      if (interval) clearInterval(interval)
    }
  }, [generatingId])

  useEffect(() => {
    if (!pollingEnabled || !pollStartTimeRef.current) {
      console.log('[Polling] Not starting - enabled:', pollingEnabled, 'startTime:', pollStartTimeRef.current)
      return
    }

    console.log('[Polling] Starting interval - enabled:', pollingEnabled)
    
    const interval = setInterval(() => {
      // Check if max polling duration exceeded
      if (Date.now() - pollStartTimeRef.current! > MAX_POLL_DURATION_MS) {
        console.log('Max polling duration reached, stopping auto-refresh')
        pollStartTimeRef.current = null
        setPollingEnabled(false)
        return
      }
      console.log('[Polling] Refreshing data...')
      refreshData()
    }, 3000)

    return () => {
      console.log('[Polling] Cleaning up interval')
      clearInterval(interval)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pollingEnabled])

  const refreshData = async () => {
    const [newTopics, newVideos] = await Promise.all([
      getSelectedTopics(),
      getAllVideosWithWindowsRenderStatus(),
    ])
    setSelectedTopics(newTopics)
    setVideos(newVideos as any)
  }

  const handleGenerateScript = async (topicId: number) => {
    setError('')
    setSuccess('')
    setGeneratingId(topicId)

    startTransition(async () => {
      try {
        console.log('[GenerateScript] Starting for topic:', topicId)
        
        const models = scriptModels.map(m => m.id)
        let video = null
        let lastError = null
        
        for (const model of models) {
          try {
            console.log(`[GenerateScript] Trying model: ${model}`)
            video = await generateScriptAndScenes(topicId, model)
            console.log('[GenerateScript] Success with model:', model)
            break
          } catch (err) {
            console.error(`[GenerateScript] Model ${model} failed:`, err instanceof Error ? err.message : String(err))
            lastError = err
          }
        }
        
        if (!video) {
          throw lastError || new Error('All models failed')
        }
        
        // Add the new video with required UI fields
        const videoWithStatus = {
          ...video,
          hasWindowsRender: false,
          windowsRenderCommand: null,
          windowsRenderPath: null,
          windowsVideoExists: false,
          windowsVideoPath: null,
        }
        
        setVideos(prev => [videoWithStatus, ...prev])
        setSelectedTopics(prev => prev.filter(t => t.id !== topicId))
        setSuccess(`Script generated for: ${video.topic.title}`)
        console.log('[GenerateScript] Video added to state, new count:', videos.length + 1)
      } catch (err) {
        console.error('[GenerateScript] Error:', err)
        setError(err instanceof Error ? err.message : 'Failed to generate script')
      } finally {
        setGeneratingId(null)
      }
    })
  }

  const handleDeleteTopic = async (topicId: number, topicTitle: string) => {
    if (!confirm(`Are you sure you want to delete "${topicTitle}"?`)) {
      return
    }
    
    setError('')
    setSuccess('')
    
    startTransition(async () => {
      try {
        await deleteTopic(topicId)
        setSelectedTopics(prev => prev.filter(t => t.id !== topicId))
        setSuccess(`Topic deleted: ${topicTitle}`)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to delete topic')
      }
    })
  }

  const handleGenerateAll = async () => {
    setError('')
    setSuccess('')
    setGeneratingId(-1)

    const models = scriptModels.map(m => m.id)
    const delayMs = 10000

    startTransition(async () => {
      let successCount = 0
      let failCount = 0

      for (let i = 0; i < selectedTopics.length; i++) {
        const topic = selectedTopics[i]
        setGeneratingId(topic.id)

        let generated = false
        
        for (const model of models) {
          try {
            const video = await generateScriptAndScenes(topic.id, model)
            setVideos(prev => [video, ...prev])
            setSelectedTopics(prev => prev.filter(t => t.id !== topic.id))
            successCount++
            generated = true
            break
          } catch (err) {
            console.error(`Model ${model} failed for topic ${topic.id}:`, err instanceof Error ? err.message : String(err))
          }
        }

        if (!generated) {
          failCount++
        }

        if (i < selectedTopics.length - 1) {
          setSuccess(`Generated ${successCount}/${i + 1}, waiting 10s for next...`)
          await new Promise(resolve => setTimeout(resolve, delayMs))
        }
      }

      await refreshData()
      
      if (failCount > 0) {
        setError(`Completed: ${successCount} succeeded, ${failCount} failed`)
      } else {
        setSuccess(`All ${successCount} scripts generated!`)
      }
      setGeneratingId(null)
    })
  }

  const handleGenerateSceneImage = async (sceneId: number) => {
    setError('')
    setGeneratingSceneId(sceneId)

    startTransition(async () => {
      try {
        await generateSingleSceneImage(sceneId)
        setSuccess(`Image generation started for scene`)
        setTimeout(refreshData, 1000)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to start image generation')
      } finally {
        setGeneratingSceneId(null)
      }
    })
  }

  const handleGenerateAllImages = async (videoId: number) => {
    setError('')
    setGeneratingId(videoId)

    startTransition(async () => {
      try {
        await generateAllSceneImages(videoId)
        setSuccess(`Image generation started for all scenes`)
        setTimeout(refreshData, 1000)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to start image generation')
      } finally {
        setGeneratingId(null)
      }
    })
  }

  const handleGenerateSceneAudio = async (sceneId: number) => {
    setError('')
    setGeneratingAudioId(sceneId)

    startTransition(async () => {
      try {
        await generateSceneAudio(sceneId)
        setSuccess(`Audio generated for scene`)
        setTimeout(refreshData, 500)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to generate audio')
      } finally {
        setGeneratingAudioId(null)
      }
    })
  }

  const handleGenerateAllAudio = async (videoId: number) => {
    setError('')
    setGeneratingId(videoId)

    startTransition(async () => {
      try {
        await generateAllSceneAudio(videoId)
        setSuccess(`Audio generation completed for all scenes`)
        setTimeout(refreshData, 500)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to generate audio')
      } finally {
        setGeneratingId(null)
      }
    })
  }

  const handleGenerateFullVideo = async (videoId: number) => {
    setError('')
    setGeneratingId(videoId)

    startTransition(async () => {
      try {
        const results = await generateFullVideo(videoId)
        setSuccess(`Full video generated! Images: ${results.imagesGenerated}, Audio: ${results.audioGenerated}, Intro: ${results.introCreated ? 'Yes' : 'No'}, Description: ${results.descriptionGenerated ? 'Yes' : 'No'}`)
        setTimeout(refreshData, 1000)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to generate full video')
      } finally {
        setGeneratingId(null)
      }
    })
  }

  const handleDeleteSceneAudio = async (sceneId: number) => {
    setError('')
    
    startTransition(async () => {
      try {
        await deleteSceneAudio(sceneId)
        await refreshData()
        setSuccess(`Audio deleted`)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to delete audio')
      }
    })
  }

  const [windowsExportData, setWindowsExportData] = useState<{
    jsonData: string;
    fileName: string;
    command: string;
    jsonFilePath?: string;
  } | null>(null)

  const handleExportForWindowsRender = async (videoId: number) => {
    setError('')
    setSuccess('')
    setGeneratingId(videoId)
    
    // Ensure polling is enabled during export
    pollStartTimeRef.current = Date.now()
    setPollingEnabled(true)

    try {
      // First check if JSON already exists
      const existingCommand = await getWindowsRenderCommand(videoId)
      
      if (existingCommand) {
        // JSON exists, just show the command
        setWindowsExportData({
          jsonData: '',
          fileName: '',
          command: existingCommand.command,
          jsonFilePath: existingCommand.jsonFilePath,
        })
        setSuccess('JSON file found! Use the command below.')
      } else {
        // JSON doesn't exist, generate everything
        const data = await prepareAndExportForWindowsRender(videoId)
        
        setWindowsExportData({
          jsonData: JSON.stringify(data),
          fileName: `${data.title.replace(/[^a-zA-Z0-9]/g, '_')}_scenes.json`,
          command: data.command,
          jsonFilePath: data.jsonFilePath,
        })
        
        setSuccess('Assets prepared! Copy the command below and run on Windows.')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to prepare export')
    } finally {
      setGeneratingId(null)
      pollStartTimeRef.current = null
      setPollingEnabled(false)
    }
  }

  const handleExportForLongFormRender = async (videoId: number) => {
    setError('')
    setSuccess('')
    setGeneratingId(videoId)
    
    pollStartTimeRef.current = Date.now()
    setPollingEnabled(true)

    try {
      const data = await prepareAndExportForLongFormRender(videoId)
      
      setWindowsExportData({
        jsonData: JSON.stringify(data),
        fileName: `${data.title.replace(/[^a-zA-Z0-9]/g, '_')}_scenes.json`,
        command: data.command,
        jsonFilePath: data.jsonFilePath,
      })
      
      setSuccess('Long form assets prepared! Copy the command below and run on Windows.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to prepare long form export')
    } finally {
      setGeneratingId(null)
      pollStartTimeRef.current = null
      setPollingEnabled(false)
    }
  }

  const handleCopyCommand = () => {
    if (!windowsExportData) return
    navigator.clipboard.writeText(windowsExportData.command)
    setSuccess('Command copied to clipboard!')
  }

  const getStatusBadge = (status: 'generating' | 'ready' | 'failed') => {
    switch (status) {
      case 'generating':
        return <Badge variant="secondary">Generating</Badge>
      case 'ready':
        return <Badge variant="default">Ready</Badge>
      case 'failed':
        return <Badge variant="destructive">Failed</Badge>
    }
  }

  const getModelBadge = (model?: string | null) => {
    if (!model) return null
    const shortName = model.includes('stepfun') ? 'StepFun' 
      : model.includes('gemma') ? 'Gemma'
      : model.includes('llama') ? 'Llama'
      : model.split('/').pop()?.split(':')[0] || model
    return <Badge variant="outline">{shortName}</Badge>
  }

  const handleEditScene = (sceneId: number, narration: string, prompt: string) => {
    setEditingScene(sceneId)
    setEditNarration(narration)
    setEditPrompt(prompt)
  }

  const handleSaveScene = async (sceneId: number, videoId: number) => {
    setSavingScene(sceneId)
    setError('')
    
    try {
      await updateScene(sceneId, editNarration, editPrompt)
      await refreshData()
      setEditingScene(null)
      setSuccess('Scene updated!')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save scene')
    } finally {
      setSavingScene(null)
    }
  }

  const handleCancelEdit = () => {
    setEditingScene(null)
    setEditNarration('')
    setEditPrompt('')
  }

  const handleDeleteVideo = async (videoId: number, topicTitle: string) => {
    setError('')
    setSuccess('')
    
    startTransition(async () => {
      try {
        await deleteVideo(videoId)
        await refreshData()
        setSuccess(`Script deleted for: ${topicTitle}`)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to delete script')
      }
    })
  }

  const handleDeleteSceneImage = async (sceneId: number) => {
    setError('')
    
    startTransition(async () => {
      try {
        await deleteSceneImage(sceneId)
        await refreshData()
        setSuccess(`Image deleted`)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to delete image')
      }
    })
  }

  const handleRefresh = () => {
    refreshData()
  }

  // Automation handlers
  const handleAutomateAllVideos = async () => {
    setError('')
    setSuccess('')
    setIsAutomating(true)
    setAutomationProgress({ current: 0, total: 0 })

    try {
      const result = await automateAllPendingVideos()
      setAutomationProgress({ current: result.successful, total: result.total })

      if (result.successful > 0) {
        setSuccess(`Successfully processed ${result.successful} videos (${result.failed} failed)`)
        await refreshData()
        await handleRefreshAutomationStatus()
      } else if (result.total === 0) {
        setSuccess('No videos need processing - all assets are generated!')
      } else {
        setError('Failed to process videos. Check console for details.')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Automation failed')
    } finally {
      setIsAutomating(false)
    }
  }

  const handleRefreshAutomationStatus = async () => {
    setIsRefreshingStatus(true)
    try {
      const status = await getAutomationStatus()
      setAutomationStatus(status)
    } catch (err) {
      console.error('Failed to get automation status:', err)
    } finally {
      setIsRefreshingStatus(false)
    }
  }

  const handleCreateBatchRenderList = async () => {
    setIsCreatingBatchList(true)
    try {
      const result = await createBatchRenderList()
      setBatchRenderInfo(result)
      setSuccess(`Created batch list with ${result.videoCount} videos ready for rendering`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create batch list')
    } finally {
      setIsCreatingBatchList(false)
    }
  }

  // Load automation status on mount
  useEffect(() => {
    handleRefreshAutomationStatus()
  }, [])

  const handleRenderVideo = async (videoId: number) => {
    setError('')
    setSuccess('')
    setRenderingVideoId(videoId)

    startTransition(async () => {
      try {
        // Start render and get jobId
        const result = await renderVideo(videoId)
        
        if (result.jobId) {
          setSuccess('Video rendering started...')
          
          // Poll for completion
          let attempts = 0
          const maxAttempts = 120 // 2 minutes max
          
          while (attempts < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, 3000))
            
            try {
              const pollResult = await pollVideoRender(videoId, result.jobId)
              
              if (pollResult.success && pollResult.videoUrl) {
                // Refresh data first to get the latest video path from DB
                await refreshData()
                
                // Find the updated video and use its path
                const updatedVideo = videos.find(v => v.id === videoId)
                const videoPath = updatedVideo?.videoPath || pollResult.videoUrl
                
                // Add small delay to ensure file is fully written
                await new Promise(resolve => setTimeout(resolve, 500))
                
                setCurrentVideoUrl(videoPath + '?t=' + Date.now())
                setVideoModalOpen(true)
                setSuccess('Video rendered successfully!')
                break
              }
              
              if (pollResult.status === 'failed') {
                setError('Render failed')
                break
              }
            } catch (pollErr) {
              // Continue polling on error
            }
            
            attempts++
          }
          
          if (attempts >= maxAttempts) {
            setError('Render timeout - please refresh to check status')
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to render video')
      } finally {
        setRenderingVideoId(null)
      }
    })
  }

  const handleGenerateMissingAndCombine = async (videoId: number) => {
    setError('')
    setSuccess('')
    setGeneratingId(videoId)
    setRenderingVideoId(videoId)

    startTransition(async () => {
      try {
        setSuccess('Generating missing images...')
        await generateAllSceneImages(videoId)
        await refreshData()
        
        setSuccess('Generating missing audio...')
        await generateAllSceneAudio(videoId)
        await refreshData()
        
        setSuccess('Combining video...')
        const result = await renderVideo(videoId)
        
        if (result.jobId) {
          setSuccess('Video rendering started...')
          
          let attempts = 0
          const maxAttempts = 120
          
          while (attempts < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, 3000))
            
            try {
              const pollResult = await pollVideoRender(videoId, result.jobId)
              
              if (pollResult.success && pollResult.videoUrl) {
                await refreshData()
                await new Promise(resolve => setTimeout(resolve, 500))
                setCurrentVideoUrl(pollResult.videoUrl + '?t=' + Date.now())
                setVideoModalOpen(true)
                setSuccess('Video rendered successfully!')
                break
              }
              
              if (pollResult.status === 'failed') {
                setError('Render failed')
                break
              }
            } catch (pollErr) {
              // Continue polling
            }
            
            attempts++
          }
          
          if (attempts >= maxAttempts) {
            setError('Render timeout - please refresh to check status')
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to generate and combine video')
      } finally {
        setGeneratingId(null)
        setRenderingVideoId(null)
      }
    })
  }

  const handleViewVideo = (videoPath: string) => {
    setCurrentVideoUrl(videoPath)
    setVideoModalOpen(true)
  }

  const canRenderVideo = (video: Video) => {
    return video.scenes.every(scene => scene.imagePath && scene.audioPath)
  }

  const canRenderScene = (scene: Scene) => {
    return scene.imagePath && scene.audioPath
  }

  const handleRenderSingleScene = async (sceneId: number) => {
    setError('')
    setSuccess('')
    setRenderingSceneId(sceneId)

    startTransition(async () => {
      try {
        // Start render and get jobId
        const result = await startRenderSingleScene(sceneId)
        
        if (result.jobId) {
          setSuccess('Scene rendering started...')
          
          // Poll for completion
          let attempts = 0
          const maxAttempts = 60 // 3 minutes max for single scene
          
          while (attempts < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, 3000))
            
            try {
              const pollResult = await pollSingleSceneRender(sceneId, result.jobId)
              
              if (pollResult.success && pollResult.videoUrl) {
                // Refresh data first
                await refreshData()
                // Small delay to ensure file is ready
                await new Promise(resolve => setTimeout(resolve, 500))
                setCurrentVideoUrl(pollResult.videoUrl + '?t=' + Date.now())
                setVideoModalOpen(true)
                setSuccess('Scene rendered successfully!')
                break
              }
              
              if (pollResult.status === 'failed') {
                setError('Render failed')
                break
              }
            } catch (pollErr) {
              // Continue polling on error
            }
            
            attempts++
          }
          
          if (attempts >= maxAttempts) {
            setError('Render timeout - please refresh to check status')
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to render scene')
      } finally {
        setRenderingSceneId(null)
      }
    })
  }

  const handleViewSceneVideo = (scene: Scene) => {
    if (scene.sceneVideoPath) {
      setCurrentVideoUrl(scene.sceneVideoPath + '?t=' + Date.now())
      setVideoModalOpen(true)
    }
  }

  const handleDeleteSceneVideo = async (sceneId: number) => {
    setDeletingSceneId(sceneId)
    setError('')
    setSuccess('')
    
    try {
      const response = await fetch('/api/scene/delete-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sceneId }),
      })
      
      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to delete scene video')
      }
      
      setSuccess('Scene video deleted successfully')
      refreshData()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete scene video')
    } finally {
      setDeletingSceneId(null)
    }
  }

  const handleDeleteFullVideo = async (videoId: number) => {
    setRenderingVideoId(videoId)
    setError('')
    setSuccess('')
    
    try {
      await deleteFullVideo(videoId)
      setSuccess('Full video deleted successfully')
      refreshData()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete full video')
    } finally {
      setRenderingVideoId(null)
    }
  }

  const handleDeleteWindowsVideo = async (videoId: number) => {
    setRenderingVideoId(videoId)
    setError('')
    setSuccess('')
    
    try {
      const result = await deleteWindowsVideo(videoId)
      if (result.success) {
        setSuccess('Windows video deleted successfully')
      } else {
        setError(result.message)
      }
      refreshData()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete Windows video')
    } finally {
      setRenderingVideoId(null)
    }
  }

  const handleMarkReviewCompleted = async (videoId: number, topicId: number) => {
    setError('')
    setSuccess('')
    
    try {
      await markTopicReviewCompleted(topicId, true)
      setSuccess('Video marked as completed!')
      refreshData()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to mark as completed')
    }
  }

  const handleRenderAllScenes = async (videoId: number) => {
    setError('')
    setSuccess('')
    setRenderingVideoId(videoId)
    setPollingEnabled(true)

    try {
      setSuccess('Checking for missing images/audio...')
      
      const result = await renderAllScenesSequentially(videoId)
      setSuccess(`Rendered ${result.successful}/${result.totalScenes} scenes`)
      await refreshData()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to render scenes')
    } finally {
      setRenderingVideoId(null)
    }
  }

  const handleGenerateMissingAndRender = async (videoId: number) => {
    setError('')
    setSuccess('')
    setGeneratingId(videoId)
    setRenderingVideoId(videoId)
    setPollingEnabled(true)

    try {
      setSuccess('Generating missing images...')
      await generateAllSceneImages(videoId)
      await refreshData()
      
      setSuccess('Generating missing audio...')
      await generateAllSceneAudio(videoId)
      await refreshData()
      
      setSuccess('Rendering all scenes...')
      const result = await renderAllScenesSequentially(videoId)
      setSuccess(`Rendered ${result.successful}/${result.totalScenes} scenes`)
      await refreshData()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate and render scenes')
    } finally {
      setGeneratingId(null)
      setRenderingVideoId(null)
    }
  }

  const handleGenerateThumbnail = async (videoId: number) => {
    setError('')
    setSuccess('')
    setGeneratingThumbnailId(videoId)

    startTransition(async () => {
      try {
        await generateThumbnail(videoId)
        setSuccess('Thumbnail generated successfully!')
        setTimeout(refreshData, 500)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to generate thumbnail')
      } finally {
        setGeneratingThumbnailId(null)
      }
    })
  }

  const handleViewThumbnail = (thumbnailPath: string) => {
    const thumbnailUrl = getAbsoluteUrl(thumbnailPath)
    setCurrentThumbnailUrl(thumbnailUrl)
    setThumbnailModalOpen(true)
  }

  const handleViewSceneImage = (imagePath: string) => {
    const imageUrl = getAbsoluteUrl(imagePath)
    setCurrentImageUrl(imageUrl)
    setImageModalOpen(true)
  }

  const handleCreateIntroScene = async (videoId: number) => {
    setError('')
    setGeneratingIntroId(videoId)

    startTransition(async () => {
      try {
        await createIntroScene(videoId)
        setSuccess('Intro scene created! Now generate audio for it.')
        setTimeout(refreshData, 500)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to create intro scene')
      } finally {
        setGeneratingIntroId(null)
      }
    })
  }

  const handleCreateIntroSceneWithAudio = async (videoId: number) => {
    setError('')
    setCreatingIntroWithAudioId(videoId)

    startTransition(async () => {
      try {
        await createIntroSceneWithAudio(videoId)
        setSuccess('Intro scene created with audio!')
        setTimeout(refreshData, 500)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to create intro scene with audio')
      } finally {
        setCreatingIntroWithAudioId(null)
      }
    })
  }

  const handleGenerateVideoDescription = async (videoId: number) => {
    setError('')
    setGeneratingDescriptionId(videoId)

    startTransition(async () => {
      try {
        const result = await generateVideoDescriptionAction(videoId)
        setSuccess('Description generated successfully!')
        setVideos(prev => prev.map(video => 
          video.id === videoId 
            ? { ...video, description: result.description }
            : video
        ))
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to generate description')
      } finally {
        setGeneratingDescriptionId(null)
      }
    })
  }

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setSuccess('Copied to clipboard!')
      setTimeout(() => setSuccess(''), 2000)
    } catch (err) {
      setError('Failed to copy to clipboard')
    }
  }

  const handleGenerateLongFormScenes = async (videoId: number) => {
    setError('')
    setSuccess('')
    setIsGeneratingLongFormScenes(true)

    startTransition(async () => {
      try {
        const result = await generateLongFormScenes(videoId, selectedStyle)
        setSuccess(result.message)
        refreshData()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to generate scenes')
      } finally {
        setIsGeneratingLongFormScenes(false)
      }
    })
  }

  const handleFixScenePrompts = async (videoId: number) => {
    setError('')
    setSuccess('')
    setIsFixingPrompts(true)

    startTransition(async () => {
      try {
        const result = await fixScenePrompts(videoId, selectedStyle)
        setSuccess(result.message)
        refreshData()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fix prompts')
      } finally {
        setIsFixingPrompts(false)
      }
    })
  }

  return (
    <div className="space-y-8">
      {error && (
        <Card className="border-destructive">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-destructive">
              <AlertCircle className="h-5 w-5" />
              {error}
            </div>
          </CardContent>
        </Card>
      )}
      {success && (
        <Card className="border-green-600">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-green-600">
              <CheckCircle className="h-5 w-5" />
              {success}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Selected Topics
            </CardTitle>
            <CardDescription>
              {selectedTopics.length > 0 
                ? `${selectedTopics.length} topics ready for script generation`
                : 'No topics selected for script generation'}
            </CardDescription>
          </div>
          {selectedTopics.length > 0 && (
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Label className="text-sm">Model:</Label>
                <Select value={selectedModel} onValueChange={setSelectedModel}>
                  <SelectTrigger className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {scriptModels.map((model) => (
                      <SelectItem key={model.id} value={model.id}>
                        {model.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button 
                onClick={handleGenerateAll}
                disabled={isPending}
              >
              {isPending && generatingId === -1 ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Generating All...
                </>
              ) : (
                <>
                  <Sparkles className="mr-2 h-4 w-4" />
                  Generate All Scripts
                </>
              )}
            </Button>
            </div>
          )}
        </CardHeader>
        <CardContent>
          {selectedTopics.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Topic</TableHead>
                  <TableHead>Base Topic</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {selectedTopics.map((topic) => (
                  <TableRow key={topic.id}>
                    <TableCell className="font-medium">{topic.title}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {topic.batch?.baseTopic || '-'}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex gap-2 justify-end">
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => handleGenerateScript(topic.id)}
                          disabled={isPending && generatingId === topic.id}
                        >
                          {isPending && generatingId === topic.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <>
                              <Play className="mr-2 h-4 w-4" />
                              Generate Script
                            </>
                          )}
                        </Button>
                        <Button 
                          variant="destructive" 
                          size="sm"
                          onClick={() => handleDeleteTopic(topic.id, topic.title)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <FileText className="h-10 w-10 mb-3" />
              <p className="text-sm">No topics selected. Go to Topics page and select topics to generate scripts.</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Automation Section */}
      <Card className="border-primary/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Cpu className="h-5 w-5 text-primary" />
            Automation Pipeline
          </CardTitle>
          <CardDescription>
            Automatically generate images, audio, and JSON files for all pending videos
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4 items-center">
            <Button
              variant="default"
              size="lg"
              onClick={handleAutomateAllVideos}
              disabled={isAutomating}
              className="bg-primary hover:bg-primary/90"
            >
              {isAutomating ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin mr-2" />
                  Processing... ({automationProgress.current}/{automationProgress.total})
                </>
              ) : (
                <>
                  <Play className="h-5 w-5 mr-2" />
                  Auto-Generate All Assets
                </>
              )}
            </Button>
            
            <Button
              variant="outline"
              size="lg"
              onClick={handleCreateBatchRenderList}
              disabled={isCreatingBatchList}
            >
              {isCreatingBatchList ? (
                <Loader2 className="h-5 w-5 animate-spin mr-2" />
              ) : (
                <List className="h-5 w-5 mr-2" />
              )}
              Create Batch Render List
            </Button>

            <Button
              variant="ghost"
              size="lg"
              onClick={handleRefreshAutomationStatus}
              disabled={isRefreshingStatus}
            >
              {isRefreshingStatus ? (
                <Loader2 className="h-5 w-5 animate-spin mr-2" />
              ) : (
                <RefreshCw className="h-5 w-5 mr-2" />
              )}
              Refresh Status
            </Button>
          </div>

          {/* Automation Status */}
          {automationStatus && (
            <div className="mt-6 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              <div className="bg-muted rounded-lg p-4 text-center">
                <div className="text-2xl font-bold">{automationStatus.totalVideos}</div>
                <div className="text-xs text-muted-foreground">Total Videos</div>
              </div>
              <div className="bg-muted rounded-lg p-4 text-center">
                <div className="text-2xl font-bold text-blue-600">{automationStatus.withScripts}</div>
                <div className="text-xs text-muted-foreground">With Scripts</div>
              </div>
              <div className="bg-muted rounded-lg p-4 text-center">
                <div className="text-2xl font-bold text-yellow-600">{automationStatus.withImages}</div>
                <div className="text-xs text-muted-foreground">With Images</div>
              </div>
              <div className="bg-muted rounded-lg p-4 text-center">
                <div className="text-2xl font-bold text-purple-600">{automationStatus.withAudio}</div>
                <div className="text-xs text-muted-foreground">With Audio</div>
              </div>
              <div className="bg-muted rounded-lg p-4 text-center">
                <div className="text-2xl font-bold text-orange-600">{automationStatus.withJson}</div>
                <div className="text-xs text-muted-foreground">JSON Ready</div>
              </div>
              <div className="bg-muted rounded-lg p-4 text-center">
                <div className="text-2xl font-bold text-green-600">{automationStatus.withFinalVideo}</div>
                <div className="text-xs text-muted-foreground">Videos Rendered</div>
              </div>
            </div>
          )}

          {/* Pending Videos */}
          {automationStatus && automationStatus.pending.length > 0 && (
            <div className="mt-6">
              <h4 className="text-sm font-semibold mb-3">Pending Videos ({automationStatus.pending.length} shown)</h4>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {automationStatus.pending.map((video) => (
                  <div key={video.id} className="flex justify-between items-center bg-muted/50 rounded px-3 py-2 text-sm">
                    <span className="truncate flex-1">{video.title}</span>
                    <Badge variant="outline" className="ml-2 shrink-0">{video.status}</Badge>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Batch Render Info */}
          {batchRenderInfo && (
            <div className="mt-6 p-4 bg-green-50 border border-green-200 rounded-lg">
              <div className="flex items-center gap-2 text-green-800 font-semibold mb-2">
                <CheckCircle className="h-5 w-5" />
                Batch Render List Created
              </div>
              <p className="text-sm text-green-700 mb-2">
                {batchRenderInfo.videoCount} videos ready for Windows rendering
              </p>
              <p className="text-xs text-green-600 font-mono bg-green-100 p-2 rounded">
                node scripts/windows-renderer/render-batch.js
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Generated Scripts</CardTitle>
          <CardDescription>
            {videos.length} videos with scripts
          </CardDescription>
        </CardHeader>
        <CardContent>
          {(() => { console.log('[Render] Videos count:', videos.length); return null; })()}
          {videos.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <FileText className="h-10 w-10 mb-3" />
              <p className="text-sm">No scripts generated yet.</p>
              <p className="text-xs mt-1">Generate scripts from the Selected Topics above.</p>
            </div>
          ) : (
            <Accordion type="single" collapsible className="w-full">
              {videos.map((video) => (
                <AccordionItem key={video.id} value={`video-${video.id}`}>
                  <AccordionTrigger>
                    <div className="flex items-center gap-4 pr-4">
                      <span className="font-medium text-left">{video.topic.title}</span>
                      {getModelBadge(video.model)}
                      {getStatusBadge(video.generationStatus)}
                      {video.windowsVideoExists && (
                        <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                          <CheckCircle className="h-3 w-3 mr-1" />
                          Windows Video Ready
                        </Badge>
                      )}
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="flex justify-between px-4 mb-4">
                      <div className="flex gap-2">
                        <Button
                          variant="default"
                          size="sm"
                          onClick={() => handleGenerateFullVideo(video.id)}
                          disabled={generatingId === video.id}
                        >
                          {generatingId === video.id ? (
                            <>
                              <Loader2 className="h-4 w-4 animate-spin mr-2" />
                              {Math.floor(generatingTimer / 60).toString().padStart(2, '0')}:{(generatingTimer % 60).toString().padStart(2, '0')}
                            </>
                          ) : (
                            <Video className="h-4 w-4 mr-2" />
                          )}
                          {generatingId === video.id ? ' Generating...' : 'Generate Full Video'}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleExportForWindowsRender(video.id)}
                          disabled={generatingId === video.id}
                          title="Export scenes for Windows GPU rendering (Shorts - 9:16)"
                        >
                          <Video className="h-4 w-4 mr-2" />
                          Export Shorts (9:16)
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleExportForLongFormRender(video.id)}
                          disabled={generatingId === video.id}
                          title="Export scenes for Windows GPU rendering (Long Form - 16:9)"
                        >
                          <Video className="h-4 w-4 mr-2" />
                          Export Long Form (16:9)
                        </Button>
                        {video.videoPath && (
                          <div className="flex gap-2">
                            <Button
                              variant="default"
                              size="sm"
                              onClick={() => handleViewVideo(video.videoPath! + '?t=' + Date.now())}
                            >
                              <Play className="h-4 w-4 mr-2" />
                              View Final Video
                            </Button>
                          </div>
                        )}
                        {video.windowsVideoPath && !video.videoPath && (
                          <div className="flex gap-2">
                            <Button
                              variant="default"
                              size="sm"
                              onClick={() => handleViewVideo(video.windowsVideoPath! + '?t=' + Date.now())}
                              title="Windows-rendered video"
                            >
                              <Play className="h-4 w-4 mr-2" />
                              View Windows Video
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleDeleteWindowsVideo(video.id)}
                              disabled={renderingVideoId === video.id}
                              title="Delete Windows video"
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        )}
                        {video.videoPath && video.thumbnailPath && (
                          <div className="flex gap-2">
                            <Button
                              variant="default"
                              size="sm"
                              onClick={() => handleViewThumbnail(video.thumbnailPath!)}
                              title="View thumbnail"
                            >
                              <ImageIcon2 className="h-4 w-4 mr-2" />
                              View Thumbnail
                            </Button>
                          </div>
                        )}
                        {(video.videoPath || video.windowsVideoPath) && (
                          <div className="flex gap-2">
                            <Button
                              variant="default"
                              size="sm"
                              onClick={() => handleMarkReviewCompleted(video.id, video.topicId)}
                              title="Mark as completed review"
                            >
                              <Check className="h-4 w-4 mr-2" />
                              Completed Review
                            </Button>
                          </div>
                        )}
                      </div>
                      
                      {/* Long Form Story Tools - Per Video */}
                      <Select value={selectedStyle} onValueChange={setSelectedStyle}>
                        <SelectTrigger className="w-36 h-8">
                          <SelectValue placeholder="Style" />
                        </SelectTrigger>
                        <SelectContent>
                          {IMAGE_STYLES.map((style) => (
                            <SelectItem key={style.value} value={style.value}>
                              {style.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      
                      <Button
                        variant="default"
                        size="sm"
                        onClick={() => handleGenerateLongFormScenes(video.id)}
                        disabled={isGeneratingLongFormScenes}
                        className="h-8"
                      >
                        {isGeneratingLongFormScenes ? (
                          <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        ) : (
                          <Sparkles className="h-4 w-4 mr-2" />
                        )}
                        Generate Scenes
                      </Button>

                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleFixScenePrompts(video.id)}
                        disabled={isFixingPrompts || !selectedStyle}
                        className="h-8"
                      >
                        {isFixingPrompts ? (
                          <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        ) : (
                          <Edit className="h-4 w-4 mr-2" />
                        )}
                        Fix Prompts
                      </Button>

                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteVideo(video.id, video.topic.title)}
                        disabled={isPending}
                      >
                        <Trash2 className="h-4 w-4 text-destructive mr-2" />
                        Delete & Regenerate
                      </Button>
                    </div>
                    
                    {/* Windows GPU Render Command - Show if JSON exists */}
                    {(windowsExportData || video.hasWindowsRender) && (
                      <div className="mt-4 bg-muted p-4 rounded-md border">
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="text-sm font-semibold">Windows GPU Render Command</h4>
                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                const cmd = windowsExportData?.command || video.windowsRenderCommand || ''
                                navigator.clipboard.writeText(cmd)
                                setSuccess('Command copied to clipboard!')
                              }}
                            >
                              <Copy className="h-4 w-4 mr-2" />
                              Copy
                            </Button>
                            {windowsExportData && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setWindowsExportData(null)}
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </div>
                        <code className="block text-xs font-mono bg-background p-2 rounded border overflow-x-auto whitespace-pre">
                          {windowsExportData?.command || video.windowsRenderCommand || ''}
                        </code>
                        <p className="text-xs text-muted-foreground mt-2">
                          Run this in Windows CMD. JSON: {windowsExportData?.jsonFilePath || video.windowsRenderPath || ''}
                        </p>
                      </div>
                    )}
                    
                    <div className="space-y-4">
                      <div>
                        <h4 className="text-sm font-semibold mb-2">Full Narration</h4>
                        <p className="text-sm text-muted-foreground bg-muted p-3 rounded-md">
                          {video.narration}
                        </p>
                        {video.narrationPath && (
                          <div className="mt-2">
                            <audio controls src={video.narrationPath} className="w-full" />
                          </div>
                        )}
                        {video.description && (
                          <div className="mt-3">
                            <h4 className="text-sm font-semibold mb-2">Description (YouTube/Instagram)</h4>
                            <div className="bg-muted p-3 rounded-md flex items-start justify-between gap-2">
                              <p className="text-sm text-muted-foreground">{video.description}</p>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => copyToClipboard(video.description!)}
                                title="Copy description"
                              >
                                <Copy className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>

                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="text-sm font-semibold">Scenes ({video.scenes.length})</h4>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={handleRefresh}
                          >
                            <RefreshCw className="h-4 w-4 mr-2" />
                            Refresh
                          </Button>
                        </div>
                        <div className="space-y-3">
                          {video.scenes.map((scene) => (
                            <Card key={scene.id} className="bg-muted/50">
                              <CardContent className="pt-4">
                                {editingScene === scene.id ? (
                                  <div className="space-y-3">
                                    <div className="flex items-start gap-2">
                                      <Badge variant="outline" className="w-8 justify-center mt-1">
                                        {scene.index}
                                      </Badge>
                                      <div className="flex-1 space-y-2">
                                        <textarea
                                          value={editNarration}
                                          onChange={(e) => setEditNarration(e.target.value)}
                                          className="w-full p-2 text-sm border rounded resize-none bg-background text-foreground"
                                          rows={3}
                                          placeholder="Narration"
                                        />
                                        <textarea
                                          value={editPrompt}
                                          onChange={(e) => setEditPrompt(e.target.value)}
                                          className="w-full p-2 text-sm border rounded resize-none bg-background text-foreground"
                                          rows={3}
                                          placeholder="Image prompt"
                                        />
                                        <div className="flex gap-2">
                                          <Button
                                            size="sm"
                                            onClick={() => handleSaveScene(scene.id, video.id)}
                                            disabled={savingScene === scene.id}
                                          >
                                            {savingScene === scene.id ? (
                                              <Loader2 className="h-4 w-4 animate-spin" />
                                            ) : (
                                              'Save'
                                            )}
                                          </Button>
                                          <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={handleCancelEdit}
                                          >
                                            Cancel
                                          </Button>
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                ) : (
                                  <div className="space-y-3">
                                    <div className="flex items-start gap-2">
                                      <Badge variant="outline" className="w-8 justify-center mt-1">
                                        {scene.index}
                                      </Badge>
                                      <span className="font-medium flex-1">{scene.narration}</span>
                                      <div className="flex items-center gap-2 flex-wrap">
                                        {scene.imagePath ? (
                                          <Button
                                            variant="destructive"
                                            size="sm"
                                            onClick={() => handleDeleteSceneImage(scene.id)}
                                          >
                                            <X className="h-4 w-4 mr-2" />
                                            Delete Image
                                          </Button>
                                        ) : (
                                          <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => handleGenerateSceneImage(scene.id)}
                                            disabled={generatingSceneId === scene.id}
                                          >
                                            {generatingSceneId === scene.id ? (
                                              <Loader2 className="h-4 w-4 animate-spin" />
                                            ) : (
                                              <>
                                                <ImageIcon className="h-4 w-4 mr-2" />
                                                Generate Image
                                              </>
                                            )}
                                          </Button>
                                        )}

                                        {scene.audioPath ? (
                                          <>
                                            <audio 
                                              controls 
                                              src={scene.audioPath} 
                                              className="h-8 w-64"
                                            />
                                            <Button
                                              variant="destructive"
                                              size="sm"
                                              onClick={() => handleDeleteSceneAudio(scene.id)}
                                            >
                                              <X className="h-4 w-4 mr-2" />
                                              Delete Audio
                                            </Button>
                                          </>
                                        ) : (
                                          <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => handleGenerateSceneAudio(scene.id)}
                                            disabled={generatingAudioId === scene.id}
                                          >
                                            {generatingAudioId === scene.id ? (
                                              <Loader2 className="h-4 w-4 animate-spin" />
                                            ) : (
                                              <>
                                                <Volume2 className="h-4 w-4 mr-2" />
                                                Generate Audio
                                              </>
                                            )}
                                          </Button>
                                        )}

                                        {scene.sceneVideoPath ? (
                                          <>
                                            <Button
                                              variant="default"
                                              size="sm"
                                              onClick={() => handleViewSceneVideo(scene)}
                                            >
                                              <Film className="h-4 w-4 mr-2" />
                                              View Scene
                                            </Button>
                                            <Button
                                              variant="outline"
                                              size="sm"
                                              onClick={() => handleDeleteSceneVideo(scene.id)}
                                              disabled={deletingSceneId === scene.id}
                                              title="Delete rendered video"
                                            >
                                              {deletingSceneId === scene.id ? (
                                                <Loader2 className="h-4 w-4 animate-spin" />
                                              ) : (
                                                <Trash2 className="h-4 w-4" />
                                              )}
                                            </Button>
                                          </>
                                        ) : (
                                          <Button
                                            variant="secondary"
                                            size="sm"
                                            onClick={() => handleRenderSingleScene(scene.id)}
                                            disabled={renderingSceneId === scene.id || !canRenderScene(scene)}
                                            title={!scene.imagePath || !scene.audioPath ? 'Generate image and audio first' : scene.sceneVideoPath ? 'Re-render this scene' : 'Render this scene'}
                                          >
                                            {renderingSceneId === scene.id ? (
                                              <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                            ) : (
                                              <Video className="h-4 w-4 mr-2" />
                                            )}
                                            {scene.sceneVideoPath ? 'Re-render' : 'Render'}
                                          </Button>
                                        )}

                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          onClick={() => handleEditScene(scene.id, scene.narration, scene.prompt)}
                                        >
                                          <Edit className="h-4 w-4 mr-2" />
                                          Edit
                                        </Button>
                                      </div>
                                    </div>

                                    {scene.imagePath && (
                                      <div 
                                        className="cursor-pointer"
                                        onClick={() => handleViewSceneImage(scene.imagePath!)}
                                      >
                                        <img 
                                          src={scene.imagePath}
                                          alt={`Scene ${scene.index}`}
                                          className="w-32 h-auto rounded-md border"
                                        />
                                      </div>
                                    )}

                                    <p className="text-xs text-muted-foreground">
                                      <span className="font-semibold">Image Prompt:</span> {scene.prompt}
                                    </p>
                                  </div>
                                )}
                              </CardContent>
                            </Card>
                          ))}
                        </div>
                      </div>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          )}
        </CardContent>
      </Card>

      {/* Video Preview Modal */}
      {videoModalOpen && currentVideoUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
          <div className="relative w-full max-w-4xl max-h-[90vh] flex flex-col">
            <Button
              variant="ghost"
              size="icon"
              className="absolute -top-2 -right-2 z-10 text-white hover:bg-white/20 rounded-full bg-black/50"
              onClick={() => setVideoModalOpen(false)}
            >
              <X className="h-6 w-6" />
            </Button>
            {absoluteVideoUrl ? (
              <div className="space-y-4">
                <div className="relative bg-black rounded-lg overflow-hidden">
                  {videoLoading && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/50 z-10">
                      <Loader2 className="h-8 w-8 animate-spin text-white" />
                    </div>
                  )}
                  <video
                    src={absoluteVideoUrl}
                    controls
                    className="w-full h-full max-h-[60vh] rounded-lg object-contain"
                    onLoadStart={() => {
                      setVideoLoading(true)
                      console.log('Video load started')
                    }}
                    onCanPlay={() => {
                      setVideoLoading(false)
                      console.log('Video can play')
                    }}
                    onLoadedData={() => {
                      setVideoLoading(false)
                      console.log('Video data loaded')
                    }}
                    onError={(e) => {
                      setVideoLoading(false)
                      const videoEl = e.currentTarget
                      console.error('Video error - networkState:', videoEl.networkState, 'readyState:', videoEl.readyState)
                    }}
                  >
                    Your browser does not support video playback.
                  </video>
                </div>
                <div className="flex gap-2">
                  <a
                    href={absoluteVideoUrl}
                    download
                    className="flex-1 flex items-center justify-center gap-2 py-2 px-4 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
                  >
                    Download Video
                  </a>
                  <Button
                    variant="outline"
                    onClick={() => window.open(absoluteVideoUrl, '_blank')}
                  >
                    Open in New Tab
                  </Button>
                </div>
              </div>
            ) : (
              <p className="text-white">No video URL available</p>
            )}
          </div>
        </div>
      )}

      {/* Thumbnail Preview Modal */}
      {thumbnailModalOpen && currentThumbnailUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
          <div className="relative w-full max-w-lg bg-background rounded-lg p-4">
            <Button
              variant="ghost"
              size="icon"
              className="absolute -top-3 -right-3 z-10 text-white hover:bg-white/20 rounded-full bg-black/50"
              onClick={() => setThumbnailModalOpen(false)}
            >
              <X className="h-5 w-5" />
            </Button>
            <img
              src={currentThumbnailUrl}
              alt="Thumbnail"
              className="w-full h-auto rounded-lg"
            />
          </div>
        </div>
      )}

      {/* Scene Image Preview Modal */}
      {imageModalOpen && currentImageUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
          <div className="relative w-full max-w-4xl max-h-[90vh] flex flex-col">
            <Button
              variant="ghost"
              size="icon"
              className="absolute -top-3 -right-3 z-10 text-white hover:bg-white/20 rounded-full bg-black/50"
              onClick={() => setImageModalOpen(false)}
            >
              <X className="h-5 w-5" />
            </Button>
            <div className="flex-1 flex items-center justify-center overflow-hidden">
              <img
                src={currentImageUrl}
                alt="Scene Image"
                className="max-w-full max-h-[80vh] object-contain rounded-lg"
              />
            </div>
            <div className="flex gap-2 mt-4">
              <a
                href={currentImageUrl}
                download
                className="flex-1 flex items-center justify-center gap-2 py-2 px-4 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
              >
                Download Image
              </a>
              <Button
                variant="outline"
                onClick={() => window.open(currentImageUrl, '_blank')}
              >
                Open in New Tab
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
