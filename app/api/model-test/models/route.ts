import { NextRequest, NextResponse } from 'next/server'

export async function GET() {
  const model1 = process.env.SCRIPT_MODEL_1 || 'stepfun/step-3.5-flash:free'
  const model2 = process.env.SCRIPT_MODEL_2 || 'google/gemma-3-27b-it:free'
  const model3 = process.env.SCRIPT_MODEL_3 || 'arcee-ai/trinity-large-preview:free'

  const getModelName = (modelId: string): string => {
    const names: Record<string, string> = {
      'stepfun/step-3.5-flash:free': 'StepFun 3.5',
      'google/gemma-3-27b-it:free': 'Gemma 3 27B',
      'arcee-ai/trinity-large-preview:free': 'Trinity Large',
    }
    return names[modelId] || modelId.split('/').pop()?.split(':')[0] || modelId
  }

  const models = [
    { id: model1, name: getModelName(model1) },
    { id: model2, name: getModelName(model2) },
    { id: model3, name: getModelName(model3) },
  ].filter(m => m.id)

  return NextResponse.json(models)
}
