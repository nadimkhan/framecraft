'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Loader2, Play, CheckCircle, XCircle, ChevronDown, ChevronRight } from 'lucide-react'

interface Scene {
  index: number
  narration: string
  prompt: string
}

interface ModelResult {
  success: boolean
  title?: string
  narration?: string
  durationSeconds?: number
  scenes?: Scene[]
  error?: string
}

interface Topic {
  id: number
  title: string
  narration?: string
}

interface ScriptModel {
  id: string
  name: string
}

export default function ModelTestingPage() {
  const [topics, setTopics] = useState<Topic[]>([])
  const [models, setModels] = useState<ScriptModel[]>([])
  const [selectedTopicId, setSelectedTopicId] = useState<string>('')
  const [selectedModel, setSelectedModel] = useState<string>('')
  const [results, setResults] = useState<Record<string, ModelResult>>({})
  const [loading, setLoading] = useState<string | null>(null)
  const [expandedResults, setExpandedResults] = useState<Set<string>>(new Set())

  useEffect(() => {
    fetchModels()
    fetchTopics()
  }, [])

  const fetchModels = async () => {
    try {
      const res = await fetch('/api/model-test/models')
      const data = await res.json()
      setModels(data)
      if (data.length > 0) {
        setSelectedModel(data[0].id)
      }
    } catch (error) {
      console.error('Error fetching models:', error)
    }
  }

  const fetchTopics = async () => {
    try {
      const res = await fetch('/api/model-test/topics')
      const data = await res.json()
      setTopics(data)
      if (data.length > 0) {
        setSelectedTopicId(data[0].id.toString())
      }
    } catch (error) {
      console.error('Error fetching topics:', error)
    }
  }

  const handleGenerate = async () => {
    if (!selectedTopicId || !selectedModel) return

    setLoading(selectedModel)
    setResults(prev => ({ ...prev, [selectedModel]: { success: false, narration: '', error: '' } }))

    try {
      const res = await fetch('/api/model-test/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topicId: parseInt(selectedTopicId),
          model: selectedModel,
        }),
      })

      const data = await res.json()

      if (res.ok) {
        setResults(prev => ({
          ...prev,
          [selectedModel]: {
            success: true,
            title: data.title,
            narration: data.narration,
            durationSeconds: data.durationSeconds,
            scenes: data.scenes,
          },
        }))
        setExpandedResults(prev => new Set(prev).add(selectedModel))
      } else {
        setResults(prev => ({
          ...prev,
          [selectedModel]: {
            success: false,
            error: data.error || 'Failed to generate',
          },
        }))
      }
    } catch (error) {
      setResults(prev => ({
        ...prev,
        [selectedModel]: {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
      }))
    } finally {
      setLoading(null)
    }
  }

  const toggleExpand = (modelId: string) => {
    setExpandedResults(prev => {
      const next = new Set(prev)
      if (next.has(modelId)) {
        next.delete(modelId)
      } else {
        next.add(modelId)
      }
      return next
    })
  }

  const selectedTopic = topics.find(t => t.id.toString() === selectedTopicId)

  const workingModels = Object.entries(results).filter(([_, r]) => r.success)
  const failedModels = Object.entries(results).filter(([_, r]) => !r.success)

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Model Testing</h1>
        <p className="text-muted-foreground mt-1">
          Test different AI models for script generation
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Test Configuration</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Select Topic</Label>
              <Select value={selectedTopicId} onValueChange={setSelectedTopicId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a topic" />
                </SelectTrigger>
                <SelectContent>
                  {topics.map((topic) => (
                    <SelectItem key={topic.id} value={topic.id.toString()}>
                      {topic.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Select Model</Label>
              <Select value={selectedModel} onValueChange={setSelectedModel}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {models.map((model) => (
                    <SelectItem key={model.id} value={model.id}>
                      {model.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <Button 
            onClick={handleGenerate} 
            disabled={!selectedTopicId || !!loading}
            className="w-full"
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Play className="mr-2 h-4 w-4" />
                Generate Script
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {selectedTopic && (
        <Card>
          <CardHeader>
            <CardTitle>Topic</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-medium">{selectedTopic.title}</p>
          </CardContent>
        </Card>
      )}

      {workingModels.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Working Models ({workingModels.length})</CardTitle>
            <CardDescription>
              Models that successfully generated scripts
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {workingModels.map(([modelId, result]) => {
              const model = models.find(m => m.id === modelId)
              const isExpanded = expandedResults.has(modelId)

              return (
                <div key={modelId} className="border rounded-lg overflow-hidden">
                  <div 
                    className="flex items-center justify-between p-4 bg-muted/50 cursor-pointer hover:bg-muted"
                    onClick={() => toggleExpand(modelId)}
                  >
                    <div className="flex items-center gap-3">
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                      <CheckCircle className="h-5 w-5 text-green-500" />
                      <span className="font-medium">{model?.name}</span>
                      {result.scenes && (
                        <Badge variant="secondary">{result.scenes.length} scenes</Badge>
                      )}
                      {result.durationSeconds && (
                        <Badge variant="outline">~{result.durationSeconds}s</Badge>
                      )}
                    </div>
                  </div>

                  {isExpanded && result.scenes && (
                    <div className="p-4 border-t space-y-4">
                      {result.title && (
                        <div>
                          <Label className="text-muted-foreground">Title</Label>
                          <p className="font-medium">{result.title}</p>
                        </div>
                      )}
                      
                      <div>
                        <Label className="text-muted-foreground">Scenes</Label>
                        <div className="space-y-3 mt-2">
                          {result.scenes.map((scene) => (
                            <div key={scene.index} className="border rounded-lg p-3 bg-background">
                              <div className="flex items-center gap-2 mb-2">
                                <Badge variant="outline">Scene {scene.index}</Badge>
                              </div>
                              <div className="space-y-2">
                                <div>
                                  <Label className="text-xs text-muted-foreground">Narration</Label>
                                  <p className="text-sm">{scene.narration}</p>
                                </div>
                                <div>
                                  <Label className="text-xs text-muted-foreground">Image Prompt</Label>
                                  <p className="text-sm text-muted-foreground">{scene.prompt}</p>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </CardContent>
        </Card>
      )}

      {failedModels.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Failed Models ({failedModels.length})</CardTitle>
            <CardDescription>
              Models that encountered errors
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {failedModels.map(([modelId, result]) => {
              const model = models.find(m => m.id === modelId)

              return (
                <div key={modelId} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex items-center gap-3">
                    <XCircle className="h-5 w-5 text-red-500" />
                    <span className="font-medium">{model?.name}</span>
                  </div>
                  <p className="text-sm text-red-500">{result.error}</p>
                </div>
              )
            })}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
