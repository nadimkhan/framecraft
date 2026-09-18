'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  PenLine, FileText, Image, Mic, Clapperboard, Eye, Upload,
  RefreshCw, ImagePlus, Volume2, Sparkles, MessageSquareText,
  Loader2, AlertTriangle, CheckCircle2, Clock, ChevronLeft,
  ChevronRight, ExternalLink, Kanban, Layers,
} from 'lucide-react';
import { STAGE_LABELS, PIPELINE_STAGES, PipelineVideo } from '@/lib/pipelineService';

const STAGE_ICONS: Record<string, React.ReactNode> = {
  draft: <PenLine className="w-4 h-4" />,
  script: <FileText className="w-4 h-4" />,
  images: <Image className="w-4 h-4" />,
  voiceover: <Mic className="w-4 h-4" />,
  render: <Clapperboard className="w-4 h-4" />,
  review: <Eye className="w-4 h-4" />,
  uploaded: <Upload className="w-4 h-4" />,
};

const STAGE_COLORS: Record<string, string> = {
  draft: 'border-gray-600 bg-gray-950',
  script: 'border-gray-600 bg-gray-950',
  images: 'border-gray-600 bg-gray-950',
  voiceover: 'border-gray-600 bg-gray-950',
  render: 'border-gray-600 bg-gray-950',
  review: 'border-gray-600 bg-gray-950',
  uploaded: 'border-gray-600 bg-gray-950',
};

const STAGE_COLORS_ACTIVE: Record<string, string> = {
  draft: 'border-blue-500 bg-blue-950/20',
  script: 'border-blue-500 bg-blue-950/20',
  images: 'border-blue-500 bg-blue-950/20',
  voiceover: 'border-blue-500 bg-blue-950/20',
  render: 'border-blue-500 bg-blue-950/20',
  review: 'border-blue-500 bg-blue-950/20',
  uploaded: 'border-blue-500 bg-blue-950/20',
};

const MAX_SHORTS_DURATION = 60;

interface PipelineBoardData {
  batchId: string;
  batchName: string;
  stages: Record<string, PipelineVideo[]>;
  totalVideos: number;
}

type SceneAction = 'none' | 'image' | 'audio' | 'prompt' | 'narration';

interface RegeneratingState {
  videoId: number;
  sceneId?: number;
  action: SceneAction;
}

export default function PipelinePage() {
  const searchParams = useSearchParams();
  const batchIdParam = searchParams.get('batchId');

  const [board, setBoard] = useState<PipelineBoardData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [expandedVideo, setExpandedVideo] = useState<number | null>(null);
  const [batchId, setBatchId] = useState(batchIdParam || '');
  const [batches, setBatches] = useState<Array<{ id: string; name: string }>>([]);
  const [regenerating, setRegenerating] = useState<RegeneratingState | null>(null);
  const [workingStage, setWorkingStage] = useState<string | null>(null);
  const [imageBust, setImageBust] = useState(0);
  const [renderingFull, setRenderingFull] = useState<number | null>(null);

  const fetchBatches = useCallback(async () => {
    try {
      const res = await fetch('/api/batches');
      const data = await res.json();
      setBatches(Array.isArray(data) ? data : (data.batches || []));
    } catch { }
  }, []);

  const fetchBoard = useCallback(async (id: string) => {
    if (!id) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/pipeline?batchId=${id}`);
      if (!res.ok) throw new Error('Failed to load pipeline');
      const data = await res.json();
      setBoard(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchBatches(); }, [fetchBatches]);
  useEffect(() => {
    if (batchId) fetchBoard(batchId);
  }, [batchId, fetchBoard]);

  const moveVideo = async (videoId: number, stage: string) => {
    // Enforce 60s max for shorts
    if (stage === 'images' || stage === 'script') {
      const video = board?.stages.draft?.find(v => v.id === videoId)
        || board?.stages.script?.find(v => v.id === videoId);
      if (video && video.scenes && video.scenes.length > 0) {
        const minDur = 4;
        const totalMin = video.scenes.length * minDur;
        if (totalMin > MAX_SHORTS_DURATION) {
          setError(`This video has ${video.scenes.length} scenes (minimum ${totalMin}s) — exceeds ${MAX_SHORTS_DURATION}s shorts limit.`);
          return;
        }
      }
    }

    setRegenerating({ videoId, action: 'image' });
    setWorkingStage(stage);
    try {
      const res = await fetch('/api/pipeline', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoId, stage }),
      });
      if (!res.ok) throw new Error('Failed');
      setImageBust(prev => prev + 1);
      await fetchBoard(batchId);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setRegenerating(null);
      setWorkingStage(null);
    }
  };

  const regenerateSceneItem = async (videoId: number, sceneId: number, type: 'image' | 'audio' | 'prompt' | 'narration') => {
    setRegenerating({ videoId, sceneId, action: type });
    try {
      const res = await fetch('/api/scene/regenerate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sceneId, type }),
      });
      if (!res.ok) throw new Error('Regeneration failed');
      setImageBust(prev => prev + 1);
      await fetchBoard(batchId);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setRegenerating(null);
    }
  };

  const regenerateFullVideo = async (videoId: number) => {
    setRenderingFull(videoId);
    try {
      const res = await fetch('/api/video/render', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoId }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Render failed');
      }
      await fetchBoard(batchId);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setRenderingFull(null);
    }
  };

  if (!batchId && !loading) {
    return (
      <div className="p-8">
        <h1 className="text-2xl font-bold mb-6 flex items-center gap-2">
          <Kanban className="w-6 h-6" /> Pipeline
        </h1>
        <div className="max-w-md">
          <label className="block text-sm font-medium mb-2 text-muted-foreground">Select a Batch</label>
          <select
            className="w-full rounded-md border border-gray-600 bg-background px-3 py-2 text-foreground"
            value={batchId}
            onChange={(e) => setBatchId(e.target.value)}
          >
            <option value="">-- Choose Batch --</option>
            {batches.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      <header className="border-b border-gray-700 px-6 py-4 flex items-center justify-between shrink-0 bg-background z-10">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Kanban className="w-6 h-6" /> {board?.batchName || 'Pipeline'}
          </h1>
          <p className="text-sm text-muted-foreground">{board ? `${board.totalVideos} videos` : 'Loading...'}</p>
        </div>
        <div className="flex gap-3">
          <select
            className="rounded-md border border-gray-600 bg-background px-3 py-2 text-sm"
            value={batchId}
            onChange={(e) => setBatchId(e.target.value)}
          >
            {batches.map((b) => (<option key={b.id} value={b.id}>{b.name}</option>))}
          </select>
          <button onClick={() => fetchBoard(batchId)} className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground hover:opacity-90">Refresh</button>
        </div>
      </header>

      {error && (
        <div className="bg-destructive/10 border-b border-destructive/30 text-destructive px-6 py-3 text-sm flex items-center justify-between shrink-0 z-10">
          <span className="flex items-center gap-2"><AlertTriangle className="w-4 h-4" /> {error}</span>
          <button onClick={() => setError('')} className="hover:text-destructive/70">✕</button>
        </div>
      )}

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : board ? (
        <div className="flex-1 overflow-x-auto p-4">
          <div className="flex gap-4 h-full min-w-max">
            {PIPELINE_STAGES.map((stage) => {
              const videos = board.stages[stage] || [];
              const stageIndex = PIPELINE_STAGES.indexOf(stage as any);
              const nextStage = stageIndex < PIPELINE_STAGES.length - 1 ? PIPELINE_STAGES[stageIndex + 1] : null;
              const prevStage = stageIndex > 0 ? PIPELINE_STAGES[stageIndex - 1] : null;
              const isWorking = workingStage === stage;

              return (
                <div key={stage} className={`flex-shrink-0 w-80 rounded-lg border ${isWorking ? STAGE_COLORS_ACTIVE[stage] : STAGE_COLORS[stage]} flex flex-col`}>
                  <div className="px-4 py-3 border-b border-gray-700/50 flex items-center justify-between">
                    <h3 className="font-semibold text-sm flex items-center gap-1.5">
                      {STAGE_ICONS[stage]} {STAGE_LABELS[stage as keyof typeof STAGE_LABELS] || stage}
                    </h3>
                    <span className="bg-muted text-muted-foreground text-xs px-2 py-0.5 rounded-full">{videos.length}</span>
                  </div>
                  <div className="flex-1 overflow-y-auto p-2 space-y-2 min-h-[200px]">
                    {videos.map((video) => (
                      <PipelineCard
                        key={video.id}
                        video={video}
                        isExpanded={expandedVideo === video.id}
                        isRegenerating={regenerating}
                        imageBust={imageBust}
                        renderingFull={renderingFull === video.id}
                        onToggle={() => setExpandedVideo(expandedVideo === video.id ? null : video.id)}
                        onAdvance={nextStage ? () => moveVideo(video.id, nextStage!) : undefined}
                        onGoBack={prevStage ? () => moveVideo(video.id, prevStage!) : undefined}
                        onRegenerateScene={(sceneId, type) => regenerateSceneItem(video.id, sceneId, type)}
                        onRegenerateFull={() => regenerateFullVideo(video.id)}
                        stage={stage}
                        nextStage={nextStage}
                      />
                    ))}
                    {videos.length === 0 && <div className="text-center text-muted-foreground text-xs py-8">No videos</div>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function PipelineCard({
  video, isExpanded, isRegenerating, imageBust, renderingFull,
  onToggle, onAdvance, onGoBack, onRegenerateScene, onRegenerateFull, stage, nextStage,
}: {
  video: PipelineVideo;
  isExpanded: boolean;
  isRegenerating: RegeneratingState | null;
  imageBust: number;
  renderingFull: boolean;
  onToggle: () => void;
  onAdvance?: () => void;
  onGoBack?: () => void;
  onRegenerateScene: (sceneId: number, type: 'image' | 'audio' | 'prompt' | 'narration') => void;
  onRegenerateFull: () => void;
  stage: string;
  nextStage: string | null;
}) {
  const completedScenes = video.scenes?.filter((s) => s.imagePath && s.audioPath).length || 0;
  const totalScenes = video.scenes?.length || 0;
  const hasVideo = !!video.videoPath;
  const estimatedMin = totalScenes * 4;
  const isOver60 = estimatedMin > MAX_SHORTS_DURATION;
  const isAdvancing = isRegenerating?.videoId === video.id && !isRegenerating.sceneId;

  return (
    <div className={`bg-card rounded-lg border border-gray-700 overflow-hidden ${isExpanded ? 'ring-1 ring-primary' : ''}`}>
      <button onClick={onToggle} className="w-full text-left p-3 hover:bg-accent/50 transition-colors">
        <div className="font-medium text-sm truncate">{video.title}</div>
        <div className="flex items-center gap-2 mt-1">
          <span className={`text-xs flex items-center gap-1 ${isOver60 ? 'text-destructive font-semibold' : 'text-muted-foreground'}`}>
            <Clock className="w-3 h-3" />
            {video.durationSeconds}s
          </span>
          {totalScenes > 0 && (
            <span className={`text-xs flex items-center gap-1 ${isOver60 ? 'text-destructive font-semibold' : 'text-muted-foreground'}`}>
              <Layers className="w-3 h-3" />
              {completedScenes}/{totalScenes} scenes
              {isOver60 && <AlertTriangle className="w-3 h-3" />}
            </span>
          )}
        </div>
        {hasVideo && (
          <span className="inline-flex items-center gap-1 mt-1 text-xs bg-green-900/30 text-green-400 px-1.5 py-0.5 rounded">
            <CheckCircle2 className="w-3 h-3" /> Rendered
          </span>
        )}
        {stage === 'script' && totalScenes > 0 && (
          <span className="inline-flex items-center gap-1 mt-1 text-xs bg-blue-900/30 text-blue-400 px-1.5 py-0.5 rounded">
            <FileText className="w-3 h-3" /> Scripted
          </span>
        )}
        {isAdvancing && (
          <span className="inline-flex items-center gap-1 mt-1 text-xs bg-yellow-900/30 text-yellow-400 px-1.5 py-0.5 rounded animate-pulse">
            <Loader2 className="w-3 h-3 animate-spin" /> Processing...
          </span>
        )}
      </button>

      {isExpanded && (
        <div className="border-t border-gray-700 p-3 space-y-3 max-h-[500px] overflow-y-auto">
          {isOver60 && (
            <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-2 text-xs text-destructive flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{totalScenes} scenes × 4s minimum = {estimatedMin}s — exceeds {MAX_SHORTS_DURATION}s shorts limit. Remove scenes first.</span>
            </div>
          )}

          {video.scenes?.map((scene) => {
            const isRegenning = isRegenerating?.sceneId === scene.id;
            const regenAction = isRegenning ? isRegenerating?.action : null;
            return (
              <div key={scene.id} className="bg-background rounded-lg p-3 space-y-2 border border-gray-700">
                {/* Scene header with regen buttons */}
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-primary">Scene {scene.index + 1}</span>
                  <div className="flex gap-1">
                    {/* Image regen */}
                    <button
                      onClick={(e) => { e.stopPropagation(); onRegenerateScene(scene.id, 'image'); }}
                      disabled={!!isRegenning}
                      className="text-xs px-2 py-0.5 rounded bg-muted hover:bg-accent transition-colors disabled:opacity-50 flex items-center gap-1"
                      title="Regenerate image via Pollinations"
                    >
                      {isRegenning && regenAction === 'image'
                        ? <Loader2 className="w-3 h-3 animate-spin" />
                        : <ImagePlus className="w-3 h-3" />}
                      Regen
                    </button>
                    {/* Audio regen */}
                    <button
                      onClick={(e) => { e.stopPropagation(); onRegenerateScene(scene.id, 'audio'); }}
                      disabled={!!isRegenning}
                      className="text-xs px-2 py-0.5 rounded bg-muted hover:bg-accent transition-colors disabled:opacity-50 flex items-center gap-1"
                      title="Regenerate voiceover via Azure TTS"
                    >
                      {isRegenning && regenAction === 'audio'
                        ? <Loader2 className="w-3 h-3 animate-spin" />
                        : <Volume2 className="w-3 h-3" />}
                      Regen
                    </button>
                  </div>
                </div>

                {/* Image Preview */}
                {scene.imagePath ? (
                  <img
                    src={`${scene.imagePath}${imageBust > 0 ? `?bust=${imageBust}` : ''}`}
                    alt={`Scene ${scene.index + 1}`}
                    className="w-full h-40 object-cover rounded border border-gray-700"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                ) : (
                  <div className="w-full h-40 bg-muted rounded border border-gray-700 flex items-center justify-center text-muted-foreground text-xs">
                    <Image className="w-5 h-5 mr-1.5 opacity-40" /> No image yet
                  </div>
                )}

                {/* Prompt with regen button */}
                <div className="flex items-start justify-between gap-2">
                  <div className="text-xs text-muted-foreground flex-1">
                    <span className="font-medium text-foreground">Prompt:</span> {scene.prompt}
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); onRegenerateScene(scene.id, 'prompt'); }}
                    disabled={!!isRegenning}
                    className="text-xs px-1.5 py-0.5 rounded bg-muted hover:bg-accent transition-colors disabled:opacity-50 flex items-center gap-1 shrink-0"
                    title="Regenerate prompt via OpenRouter LLM"
                  >
                    {isRegenning && regenAction === 'prompt'
                      ? <Loader2 className="w-3 h-3 animate-spin" />
                      : <Sparkles className="w-3 h-3" />}
                    Regen
                  </button>
                </div>

                {/* Narration with regen button */}
                <div className="flex items-start justify-between gap-2">
                  <div className="text-xs text-muted-foreground flex-1">
                    <span className="font-medium text-foreground">Narration:</span> {scene.narration}
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); onRegenerateScene(scene.id, 'narration'); }}
                    disabled={!!isRegenning}
                    className="text-xs px-1.5 py-0.5 rounded bg-muted hover:bg-accent transition-colors disabled:opacity-50 flex items-center gap-1 shrink-0"
                    title="Regenerate narration via OpenRouter LLM"
                  >
                    {isRegenning && regenAction === 'narration'
                      ? <Loader2 className="w-3 h-3 animate-spin" />
                      : <MessageSquareText className="w-3 h-3" />}
                    Regen
                  </button>
                </div>

                {/* Audio Playback */}
                {scene.audioPath ? (
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-green-400 shrink-0" />
                    <audio controls className="h-8 w-full" preload="metadata">
                      <source src={scene.audioPath} type="audio/mpeg" />
                    </audio>
                  </div>
                ) : (
                  <div className="text-xs text-gray-500 italic flex items-center gap-1">
                    <Clock className="w-3 h-3" /> No audio yet
                  </div>
                )}
              </div>
            );
          })}

          {/* Full Video Preview */}
          {hasVideo && (
            <div className="bg-background rounded-lg p-3 space-y-2 border border-green-500/30">
              <div className="flex items-center justify-between">
                <div className="text-xs font-semibold text-green-400 flex items-center gap-1.5">
                  <Clapperboard className="w-3.5 h-3.5" /> Final Video
                </div>
                <button
                  onClick={onRegenerateFull}
                  disabled={renderingFull}
                  className="text-xs px-2 py-0.5 rounded bg-green-900/40 hover:bg-green-800/50 text-green-400 border border-green-700/50 transition-colors disabled:opacity-50 flex items-center gap-1"
                  title="Regenerate all scene clips and assemble full video"
                >
                  {renderingFull
                    ? <><Loader2 className="w-3 h-3 animate-spin" /> Rendering...</>
                    : <><RefreshCw className="w-3 h-3" /> Regen Video</>}
                </button>
              </div>
              <video controls className="w-full rounded border border-gray-700" preload="metadata" style={{ maxHeight: '300px' }}>
                <source src={video.videoPath!} type="video/mp4" />
              </video>
              <a
                href={video.videoPath!}
                target="_blank"
                rel="noopener"
                className="text-xs text-primary hover:underline flex items-center gap-1 justify-center"
              >
                Open full size <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          )}

          {totalScenes === 0 && (
            <div className="text-xs text-muted-foreground italic text-center py-4">
              No scenes yet. Advance to Script stage.
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-2 pt-2 border-t border-gray-700/50">
            {onGoBack && (
              <button onClick={onGoBack} disabled={!!isRegenerating}
                className="flex-1 rounded bg-muted px-2 py-1.5 text-xs hover:bg-accent transition-colors disabled:opacity-50 flex items-center justify-center gap-1">
                <ChevronLeft className="w-3.5 h-3.5" /> Back
              </button>
            )}
            {onAdvance && (
              <button onClick={onAdvance} disabled={!!isRegenerating || isOver60}
                className="flex-1 rounded bg-primary px-2 py-1.5 text-xs text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-1"
                title={isOver60 ? `Exceeds ${MAX_SHORTS_DURATION}s limit` : ''}
              >
                {isAdvancing ? (
                  <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Working...</>
                ) : (
                  <>Advance <ChevronRight className="w-3.5 h-3.5" /></>
                )}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
