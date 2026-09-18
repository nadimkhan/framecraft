import { Suspense } from 'react'
import VideosClient from './videos-client'
import { getSelectedTopics, getAllVideosWithWindowsRenderStatus } from './actions'
import { Card, CardContent } from '@/components/ui/card'
import { Loader2 } from 'lucide-react'
import { PageHeader } from '@/components/page-header'

function getAllScriptModels() {
  const models: { id: string; name: string }[] = []
  
  for (let i = 1; i <= 10; i++) {
    const modelId = process.env[`SCRIPT_MODEL_${i}`]
    if (modelId) {
      models.push({ id: modelId, name: getModelName(modelId) })
    }
  }
  
  return models
}

function getModelName(modelId: string): string {
  const names: Record<string, string> = {
    'stepfun/step-3.5-flash:free': 'StepFun 3.5',
    'google/gemma-3-27b-it:free': 'Gemma 3 27B',
    'arcee-ai/trinity-large-preview:free': 'Trinity Large',
    'nvidia/nemotron-nano-12b-v2-vl:free': 'Nemotron Nano',
    'openai/gpt-oss-120b:free': 'GPT OSS 120B',
    'z-ai/glm-4.5-air:free': 'GLM 4.5 Air',
    'meta-llama/llama-3.3-70b-instruct:free': 'Llama 3.3',
    'qwen/qwen3-next-80b-a3b-instruct:free': 'Qwen3 Next',
  }
  return names[modelId] || modelId.split('/').pop()?.split(':')[0] || modelId
}

const scriptModels = getAllScriptModels()

async function getInitialData() {
  try {
    const [selectedTopics, videos] = await Promise.all([
      getSelectedTopics(),
      getAllVideosWithWindowsRenderStatus(),
    ])
    return { selectedTopics, videos }
  } catch {
    return { selectedTopics: [], videos: [] }
  }
}

function VideosLoading() {
  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground mt-4">Loading videos...</p>
      </CardContent>
    </Card>
  )
}

export const dynamic = 'force-dynamic'

export default async function VideosPage() {
  const initialData = await getInitialData()

  return (
    <div className="flex-1 min-w-0 flex flex-col">
      <PageHeader
        title="Videos"
        description="Generate scripts and manage video production"
      />
      <div className="flex-1 px-6 py-6">
        <Suspense fallback={<VideosLoading />}>
          <VideosClient
            initialSelectedTopics={initialData.selectedTopics}
            initialVideos={initialData.videos}
            scriptModels={scriptModels}
          />
        </Suspense>
      </div>
    </div>
  )
}
