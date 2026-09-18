'use client';

import { useEffect, useState, use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardHeader, 
  CardTitle 
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { 
  MoreHorizontal, 
  Trash2, 
  Eye,
  Loader2,
  ArrowLeft,
  RefreshCw,
  Upload,
  ChevronDown,
  ChevronRight,
  Copy,
  Play,
  X,
  AlertTriangle,
  Sparkles,
  Image,
} from 'lucide-react';

interface BatchVideo {
  id: number;
  title: string;
  generationStatus: 'generating' | 'ready' | 'failed';
  uploadStatus: 'new' | 'uploaded';
  orderIndex: number | null;
  topicId: number;
  description?: string | null;
  tags?: string | null;
  youtubeVideoId?: string | null;
  videoPath?: string | null;
  thumbnailPath?: string | null;
  topic?: {
    title: string;
  };
}

interface BatchProgress {
  total: number;
  ready: number;
  failed: number;
  generating: number;
  percentage: number;
}

interface Batch {
  id: string;
  name: string;
  description: string | null;
  contentMode: string;
  createdAt: string;
  updatedAt: string;
  videos: BatchVideo[];
  progress: BatchProgress;
}

export default function BatchDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [batch, setBatch] = useState<Batch | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'new' | 'uploaded'>('new');
  const [expandedVideo, setExpandedVideo] = useState<number | null>(null);
  const [viewingVideo, setViewingVideo] = useState<{ url: string; title: string } | null>(null);
  const [generatedMetadata, setGeneratedMetadata] = useState<Record<number, { description: string; tags: string[] }>>({});
  const [generatingMetadata, setGeneratingMetadata] = useState<number | null>(null);
  const [bulkGenerating, setBulkGenerating] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{ current: number; total: number; videoId: number | null }>({ current: 0, total: 0, videoId: null });
  const [youtubeIdInput, setYoutubeIdInput] = useState<Record<number, string>>({});
  const [updatingYoutube, setUpdatingYoutube] = useState<number | null>(null);
  const [uploadingVideo, setUploadingVideo] = useState<number | null>(null);
  const [generatingThumbnail, setGeneratingThumbnail] = useState<number | null>(null);
  const [viewingThumbnail, setViewingThumbnail] = useState<{ url: string; title: string } | null>(null);

  useEffect(() => {
    fetchBatch();
  }, [id]);

  const fetchBatch = async () => {
    try {
      console.log(`[Batch] Fetching batch: ${id}`);
      const res = await fetch(`/api/batches/${id}`);
      if (res.ok) {
        const data = await res.json();
        console.log(`[Batch] Received ${data.videos?.length || 0} videos`);
        console.log(`[Batch] Videos with youtubeVideoId:`, data.videos?.filter((v: BatchVideo) => v.youtubeVideoId).map((v: BatchVideo) => ({ id: v.id, youtubeVideoId: v.youtubeVideoId })));
        setBatch(data);
      } else {
        console.error('[Batch] Fetch failed:', res.status);
      }
    } catch (error) {
      console.error('Error fetching batch:', error);
    } finally {
      setLoading(false);
    }
  };

  const removeVideo = async (videoId: number) => {
    if (!confirm('Are you sure you want to remove this video from the batch?')) {
      return;
    }

    try {
      const res = await fetch(`/api/videos/${videoId}/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'remove' }),
      });

      if (res.ok) {
        fetchBatch();
      } else {
        const error = await res.json();
        alert('Failed to remove: ' + error.error);
      }
    } catch (error) {
      console.error('Error removing video:', error);
      alert('Error removing video from batch');
    }
  };

  const regenerateVideo = async (videoId: number, topicId: number) => {
    if (!confirm('This will remove the video from the batch and send the topic back to Selected Topics for regeneration. Continue?')) {
      return;
    }

    try {
      // Step 1: Remove from batch
      const removeRes = await fetch(`/api/videos/${videoId}/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'remove' }),
      });

      if (!removeRes.ok) {
        const error = await removeRes.json();
        alert('Failed to remove from batch: ' + error.error);
        return;
      }

      // Step 2: Delete the video and its scenes
      const deleteRes = await fetch(`/api/videos/${videoId}`, {
        method: 'DELETE',
      });

      if (!deleteRes.ok) {
        console.error('Failed to delete video, but removed from batch');
      }

      // Step 3: Mark topic as selected again
      const selectRes = await fetch(`/api/topics/${topicId}/select`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ selected: true }),
      });

      if (!selectRes.ok) {
        console.error('Failed to re-select topic');
      }

      // Refresh the batch data
      fetchBatch();
      alert('Video removed and topic sent back to Selected Topics for regeneration');
    } catch (error) {
      console.error('Error regenerating video:', error);
      alert('Error during regeneration');
    }
  };

  const deleteVideoFile = async (videoId: number) => {
    if (!confirm('Are you sure you want to delete the rendered video file? This will free up disk space but you will need to re-render the video.')) {
      return;
    }

    try {
      const res = await fetch('/api/video/delete-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoId }),
      });

      const data = await res.json();
      
      if (res.ok) {
        alert('Video file deleted successfully');
        fetchBatch();
      } else {
        alert('Failed to delete video: ' + data.error);
      }
    } catch (error) {
      console.error('Error deleting video:', error);
      alert('Error deleting video file');
    }
  };

  const markAsUploaded = async (videoId: number) => {
    try {
      const res = await fetch(`/api/videos/${videoId}/upload-status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uploadStatus: 'uploaded' }),
      });

      if (res.ok) {
        fetchBatch();
      }
    } catch (error) {
      console.error('Error updating upload status:', error);
    }
  };

  const markAsNew = async (videoId: number) => {
    try {
      const res = await fetch(`/api/videos/${videoId}/upload-status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uploadStatus: 'new' }),
      });

      if (res.ok) {
        fetchBatch();
      }
    } catch (error) {
      console.error('Error updating upload status:', error);
    }
  };

  const cleanupDuplicates = async () => {
    if (!confirm('This will permanently delete duplicate videos for the same topic, keeping only the most recent. Continue?')) {
      return;
    }

    console.log(`[Cleanup] Starting cleanup for batch: ${id}`);

    try {
      const res = await fetch(`/api/batches/${id}/cleanup-duplicates`, {
        method: 'POST',
      });

      console.log(`[Cleanup] Response status: ${res.status}`);

      if (res.ok) {
        const result = await res.json();
        console.log(`[Cleanup] Result:`, result);
        alert(`Cleanup complete! Deleted ${result.deleted} duplicates, kept ${result.kept} videos.`);
        await fetchBatch();
      } else {
        const errorText = await res.text();
        console.error(`[Cleanup] Error response:`, errorText);
        alert('Cleanup failed: ' + errorText);
      }
    } catch (error) {
      console.error('[Cleanup] Error:', error);
      alert('Error during cleanup: ' + (error instanceof Error ? error.message : 'Unknown error'));
    }
  };

  const getGenerationBadge = (status: BatchVideo['generationStatus']) => {
    switch (status) {
      case 'generating':
        return <Badge variant="secondary">Generating</Badge>;
      case 'ready':
        return <Badge variant="default">Ready</Badge>;
      case 'failed':
        return <Badge variant="destructive">Failed</Badge>;
    }
  };

  const getContentModeLabel = (mode: string) => {
    switch (mode) {
      case 'single':
        return 'Single Video';
      case 'series':
        return 'Series';
      case 'long_form':
        return 'Long Form';
      case 'calendar':
        return 'Calendar';
      default:
        return mode;
    }
  };

  const extractTagsFromDescription = (description: string | null): string[] => {
    if (!description) return [];
    const hashtagRegex = /#[\w]+/g;
    const matches = description.match(hashtagRegex);
    return matches ? matches.map(tag => tag.slice(1)) : [];
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const toggleExpand = (videoId: number) => {
    setExpandedVideo(expandedVideo === videoId ? null : videoId);
  };

  const generateYouTubeMetadata = async (videoId: number, title: string) => {
    setGeneratingMetadata(videoId);
    try {
      const res = await fetch('/api/generate-metadata', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, videoId }),
      });

      if (res.ok) {
        const data = await res.json();
        setGeneratedMetadata(prev => ({
          ...prev,
          [videoId]: data
        }));
        // Refresh batch data to get saved metadata
        fetchBatch();
      } else {
        const error = await res.json();
        alert('Failed to generate metadata: ' + error.error);
      }
    } catch (error) {
      console.error('Error generating metadata:', error);
      alert('Error generating metadata');
    } finally {
      setGeneratingMetadata(null);
    }
  };

  const generateAllMetadata = async () => {
    if (!batch) return;
    
    const videosWithoutMetadata = batch.videos.filter(v => !v.description);
    
    if (videosWithoutMetadata.length === 0) {
      alert('All videos already have metadata!');
      return;
    }

    if (!confirm(`Generate metadata for ${videosWithoutMetadata.length} videos? This will take approximately ${videosWithoutMetadata.length * 10} seconds.`)) {
      return;
    }

    setBulkGenerating(true);
    setBulkProgress({ current: 0, total: videosWithoutMetadata.length, videoId: null });

    let processed = 0;
    const results: { videoId: number; success: boolean; error?: string }[] = [];

    for (const video of videosWithoutMetadata) {
      setBulkProgress({ current: processed + 1, total: videosWithoutMetadata.length, videoId: video.id });
      
      try {
        const res = await fetch(`/api/videos/${video.id}/generate-metadata`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ videoId: video.id }),
        });

        if (res.ok) {
          const data = await res.json();
          setGeneratedMetadata(prev => ({
            ...prev,
            [video.id]: { description: data.description, tags: data.tags.split(', ') }
          }));
          results.push({ videoId: video.id, success: true });
        } else {
          const error = await res.json();
          results.push({ videoId: video.id, success: false, error: error.error });
        }
      } catch (error) {
        results.push({ videoId: video.id, success: false, error: 'Network error' });
      }

      processed++;

      if (processed < videosWithoutMetadata.length) {
        await new Promise(resolve => setTimeout(resolve, 10000));
      }
    }

    setBulkGenerating(false);
    setBulkProgress({ current: 0, total: 0, videoId: null });
    
    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;
    
    if (failCount > 0) {
      alert(`Completed! ${successCount} succeeded, ${failCount} failed.`);
    } else {
      alert(`Successfully generated metadata for ${successCount} videos!`);
    }
    
    fetchBatch();
  };

  const saveYoutubeVideoId = async (videoId: number) => {
    const youtubeId = youtubeIdInput[videoId]?.trim();
    console.log('[saveYoutubeVideoId] videoId:', videoId, 'youtubeId:', youtubeId);
    
    if (!youtubeId) {
      alert('Please enter a YouTube video ID');
      return;
    }

    try {
      console.log('[saveYoutubeVideoId] Sending PATCH request...');
      const res = await fetch(`/api/videos/${videoId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ youtubeVideoId: youtubeId, action: 'setYoutubeId' }),
      });

      const data = await res.json();
      console.log('[saveYoutubeVideoId] Response:', res.status, data);

      if (res.ok) {
        alert('YouTube video ID saved!');
        setYoutubeIdInput(prev => ({ ...prev, [videoId]: '' }));
        fetchBatch();
      } else {
        alert('Failed to save: ' + data.error);
      }
    } catch (error) {
      console.error('[saveYoutubeVideoId] Error:', error);
      alert('Error saving YouTube ID');
    }
  };

  const updateYoutubeMetadata = async (videoId: number) => {
    const video = batch?.videos.find(v => v.id === videoId);
    if (!video?.youtubeVideoId) {
      alert('Please set the YouTube video ID first');
      return;
    }

    setUpdatingYoutube(videoId);
    try {
      const res = await fetch(`/api/videos/${videoId}/update-youtube`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          videoId,
          youtubeVideoId: video.youtubeVideoId,
        }),
      });

      if (res.ok) {
        alert('Metadata updated on YouTube successfully!');
      } else {
        const error = await res.json();
        alert('Failed to update: ' + error.error);
      }
    } catch (error) {
      console.error('Error updating YouTube metadata:', error);
      alert('Error updating YouTube metadata');
    } finally {
      setUpdatingYoutube(null);
    }
  };

  const uploadVideoToYouTube = async (videoId: number) => {
    const video = batch?.videos.find(v => v.id === videoId);
    if (!video?.videoPath) {
      alert('No video file available for upload');
      return;
    }

    if (!confirm('This will upload the video to YouTube. Do you want to continue?')) {
      return;
    }

    setUploadingVideo(videoId);
    try {
      // Check if this is a long form video
      const isLongForm = batch?.contentMode === 'long_form';
      const endpoint = isLongForm ? `/api/videos/${videoId}/upload-youtube-longform` : `/api/videos/${videoId}/upload-youtube`;
      
      console.log(`[Upload] Using endpoint: ${endpoint} (longform: ${isLongForm})`);
      
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoId }),
      });

      const data = await res.json();

      if (res.ok) {
        const successMsg = isLongForm 
          ? `Video uploaded successfully!${data.thumbnailUploaded ? ' Thumbnail also uploaded.' : ''}`
          : 'Video uploaded to YouTube successfully!';
        alert(successMsg);
        fetchBatch();
      } else {
        alert('Failed to upload: ' + data.error);
      }
    } catch (error) {
      console.error('Error uploading video:', error);
      alert('Error uploading video to YouTube');
    } finally {
      setUploadingVideo(null);
    }
  };

  const generateThumbnail = async (videoId: number) => {
    setGeneratingThumbnail(videoId);
    try {
      const res = await fetch(`/api/videos/${videoId}/generate-thumbnail`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (res.ok) {
        const data = await res.json();
        alert(`Thumbnail generated successfully! Saved to: ${data.thumbnailPath}`);
        fetchBatch();
      } else {
        const error = await res.json();
        alert('Failed to generate thumbnail: ' + error.error);
      }
    } catch (error) {
      console.error('Error generating thumbnail:', error);
      alert('Error generating thumbnail');
    } finally {
      setGeneratingThumbnail(null);
    }
  };

  const clearYoutubeVideoId = async (videoId: number) => {
    if (!confirm('This will clear the YouTube video ID. You can upload again after. Continue?')) {
      return;
    }

    try {
      const res = await fetch(`/api/videos/${videoId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'clearYoutubeId' }),
      });

      if (res.ok) {
        alert('YouTube video ID cleared!');
        fetchBatch();
      } else {
        const error = await res.json();
        alert('Failed to clear: ' + error.error);
      }
    } catch (error) {
      console.error('Error clearing YouTube ID:', error);
      alert('Error clearing YouTube ID');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!batch) {
    return (
      <div className="p-8 text-center">
        <p>Batch not found</p>
        <Button asChild className="mt-4">
          <Link href="/dashboard/batches">Back to Batches</Link>
        </Button>
      </div>
    );
  }

  const newVideos = batch.videos.filter(v => v.uploadStatus === 'new');
  const uploadedVideos = batch.videos.filter(v => v.uploadStatus === 'uploaded');
  const displayedVideos = activeTab === 'new' ? newVideos : uploadedVideos;

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/dashboard/batches">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Link>
        </Button>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">{batch.name}</h1>
          {batch.description && (
            <p className="text-muted-foreground mt-1">{batch.description}</p>
          )}
        </div>
        
        <div className="flex items-center gap-2">
          {batch && (
            <>
              {(() => {
                const videosWithoutMeta = batch.videos.filter(v => !v.description);
                if (videosWithoutMeta.length > 0) {
                  return (
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={generateAllMetadata}
                      disabled={bulkGenerating}
                    >
                      {bulkGenerating ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Sparkles className="h-4 w-4 mr-2" />
                      )}
                      {bulkGenerating 
                        ? `Generating (${bulkProgress.current}/${bulkProgress.total})`
                        : `Generate Metadata (${videosWithoutMeta.length})`
                      }
                    </Button>
                  );
                }
                return null;
              })()}
            </>
          )}
          <Button variant="outline" size="sm" onClick={cleanupDuplicates}>
            <AlertTriangle className="h-4 w-4 mr-2" />
            Cleanup Duplicates
          </Button>
          <Button variant="outline" size="sm" onClick={fetchBatch}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Mode</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{getContentModeLabel(batch.contentMode)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Videos</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{batch.progress?.total || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Ready</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-500">
              {batch.progress?.ready || 0}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">New / Uploaded</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {newVideos.length} / {uploadedVideos.length}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Videos</CardTitle>
          <CardDescription>
            {activeTab === 'new' ? 'Videos ready for upload' : 'Videos already uploaded to YouTube'}
          </CardDescription>
          <div className="flex gap-2 mt-4">
            <Button 
              variant={activeTab === 'new' ? 'default' : 'outline'} 
              size="sm"
              onClick={() => setActiveTab('new')}
            >
              New ({newVideos.length})
            </Button>
            <Button 
              variant={activeTab === 'uploaded' ? 'default' : 'outline'} 
              size="sm"
              onClick={() => setActiveTab('uploaded')}
            >
              Uploaded ({uploadedVideos.length})
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {displayedVideos.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground">
                {activeTab === 'new' ? 'No new videos in this batch' : 'No uploaded videos in this batch'}
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10"></TableHead>
                  <TableHead>Order</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Generation</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {displayedVideos.map((video, index) => {
                  const isExpanded = expandedVideo === video.id;
                  const tags = extractTagsFromDescription(video.description || null);
                  
                  return (
                    <>
                      <TableRow key={video.id} className="cursor-pointer hover:bg-muted/50" onClick={() => toggleExpand(video.id)}>
                        <TableCell>
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                            {isExpanded ? (
                              <ChevronDown className="h-4 w-4" />
                            ) : (
                              <ChevronRight className="h-4 w-4" />
                            )}
                          </Button>
                        </TableCell>
                        <TableCell>{video.orderIndex ?? index + 1}</TableCell>
                        <TableCell className="font-medium">{video.topic?.title || video.title}</TableCell>
                        <TableCell>
                          {getGenerationBadge(video.generationStatus)}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                            {video.videoPath && (
                              <Button 
                                variant="default" 
                                size="sm"
                                onClick={() => setViewingVideo({ url: video.videoPath!, title: video.topic?.title || video.title })}
                              >
                                <Play className="h-4 w-4 mr-2" />
                                View Video
                              </Button>
                            )}
                            {activeTab === 'new' && video.generationStatus === 'ready' && (
                              <Button 
                                variant="outline" 
                                size="sm"
                                onClick={() => markAsUploaded(video.id)}
                              >
                                <Upload className="h-4 w-4 mr-2" />
                                Mark Uploaded
                              </Button>
                            )}
                            {activeTab === 'uploaded' && (
                              <Button 
                                variant="outline" 
                                size="sm"
                                onClick={() => markAsNew(video.id)}
                              >
                                <Upload className="h-4 w-4 mr-2" />
                                Move to New
                              </Button>
                            )}
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="sm" onClick={(e) => e.stopPropagation()}>
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem asChild>
                                  <Link href={`/dashboard/videos?videoId=${video.id}`} onClick={(e) => e.stopPropagation()}>
                                    <Eye className="h-4 w-4 mr-2" />
                                    View Assets
                                  </Link>
                                </DropdownMenuItem>
                                <DropdownMenuItem 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    regenerateVideo(video.id, video.topicId);
                                  }}
                                >
                                  <RefreshCw className="h-4 w-4 mr-2" />
                                  Regenerate
                                </DropdownMenuItem>
                                {video.videoPath && (
                                  <DropdownMenuItem 
                                    className="text-orange-600"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      deleteVideoFile(video.id);
                                    }}
                                  >
                                    <Trash2 className="h-4 w-4 mr-2" />
                                    Delete Video File
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuSeparator />
                                <DropdownMenuItem 
                                  className="text-red-600"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    removeVideo(video.id);
                                  }}
                                >
                                  <Trash2 className="h-4 w-4 mr-2" />
                                  Remove from Batch
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </TableCell>
                      </TableRow>
                      
                      {/* Expanded Row with YouTube Metadata */}
                      {isExpanded && (
                        <TableRow className="bg-muted/30">
                          <TableCell colSpan={5} className="p-4">
                            <div className="space-y-4">
                              {/* YouTube Title */}
                              <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                  <label className="text-sm font-semibold text-muted-foreground">YouTube Title</label>
                                  <Button 
                                    variant="ghost" 
                                    size="sm" 
                                    onClick={() => copyToClipboard(video.topic?.title || video.title)}
                                  >
                                    <Copy className="h-4 w-4 mr-1" />
                                    Copy
                                  </Button>
                                </div>
                                <div className="bg-background border rounded-md p-3 text-sm">
                                  {video.topic?.title || video.title}
                                </div>
                              </div>

                              {/* Description */}
                              {video.description && (
                                <div className="space-y-2">
                                  <div className="flex items-center justify-between">
                                    <label className="text-sm font-semibold text-muted-foreground">Description</label>
                                    <Button 
                                      variant="ghost" 
                                      size="sm" 
                                      onClick={() => copyToClipboard(video.description!)}
                                    >
                                      <Copy className="h-4 w-4 mr-1" />
                                      Copy
                                    </Button>
                                  </div>
                                  <div className="bg-background border rounded-md p-3 text-sm max-h-48 overflow-y-auto whitespace-pre-wrap">
                                    {video.description}
                                  </div>
                                </div>
                              )}

                              {/* Tags */}
                              {tags.length > 0 && (
                                <div className="space-y-2">
                                  <div className="flex items-center justify-between">
                                    <label className="text-sm font-semibold text-muted-foreground">Tags ({tags.length})</label>
                                    <Button 
                                      variant="ghost" 
                                      size="sm" 
                                      onClick={() => copyToClipboard(tags.join(', '))}
                                    >
                                      <Copy className="h-4 w-4 mr-1" />
                                      Copy All
                                    </Button>
                                  </div>
                                  <div className="bg-background border rounded-md p-3">
                                    <div className="flex flex-wrap gap-2">
                                      {tags.map((tag, i) => (
                                        <Badge key={i} variant="secondary" className="cursor-pointer" onClick={() => copyToClipboard(tag)}>
                                          #{tag}
                                        </Badge>
                                      ))}
                                    </div>
                                  </div>
                                </div>
                              )}

                              {/* Generate Metadata Button - only if no description */}
                              {!video.description && (
                                <div className="border-t pt-4 mt-4">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => generateYouTubeMetadata(video.id, video.topic?.title || video.title)}
                                    disabled={generatingMetadata === video.id}
                                    className="w-full"
                                  >
                                    {generatingMetadata === video.id ? (
                                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                    ) : (
                                      <Sparkles className="h-4 w-4 mr-2" />
                                    )}
                                    {generatingMetadata === video.id ? 'Generating...' : 'Generate YouTube Metadata'}
                                  </Button>

                                  {generatedMetadata[video.id] && (
                                    <div className="mt-4 space-y-4">
                                      <div className="space-y-2">
                                        <div className="flex items-center justify-between">
                                          <label className="text-sm font-semibold text-muted-foreground">AI Description</label>
                                          <Button 
                                            variant="ghost" 
                                            size="sm" 
                                            onClick={() => copyToClipboard(generatedMetadata[video.id].description)}
                                          >
                                            <Copy className="h-4 w-4 mr-1" />
                                            Copy
                                          </Button>
                                        </div>
                                        <div className="bg-background border rounded-md p-3 text-sm max-h-48 overflow-y-auto whitespace-pre-wrap">
                                          {generatedMetadata[video.id].description}
                                        </div>
                                      </div>

                                      {generatedMetadata[video.id].tags.length > 0 && (
                                        <div className="space-y-2">
                                          <div className="flex items-center justify-between">
                                            <label className="text-sm font-semibold text-muted-foreground">AI Tags ({generatedMetadata[video.id].tags.length})</label>
                                            <Button 
                                              variant="ghost" 
                                              size="sm" 
                                              onClick={() => copyToClipboard(generatedMetadata[video.id].tags.join(', '))}
                                            >
                                              <Copy className="h-4 w-4 mr-1" />
                                              Copy All
                                            </Button>
                                          </div>
                                          <div className="bg-background border rounded-md p-3">
                                            <div className="flex flex-wrap gap-2">
                                              {generatedMetadata[video.id].tags.map((tag, i) => (
                                                <Badge key={i} variant="secondary" className="cursor-pointer" onClick={() => copyToClipboard(tag)}>
                                                  {tag}
                                                </Badge>
                                              ))}
                                            </div>
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>
                              )}

                              {/* Video Folder Path */}
                              {video.topic?.title && (() => {
                                const folderName = video.topic.title.replace(/[^a-zA-Z0-9]/g, '_');
                                const fullPath = `/home/nadim/ytautomation/public/generations/${folderName}`;
                                return (
                                  <div className="border-t pt-4 mt-4">
                                    <label className="text-sm font-semibold text-muted-foreground">Video Folder Path</label>
                                    <div className="flex gap-2 mt-2">
                                      <Input
                                        readOnly
                                        value={fullPath}
                                        className="flex-1 text-xs font-mono"
                                      />
                                      <Button
                                        variant="secondary"
                                        size="sm"
                                        onClick={() => copyToClipboard(fullPath)}
                                      >
                                        <Copy className="h-4 w-4" />
                                      </Button>
                                    </div>
                                  </div>
                                );
                              })()}

                              {/* Video Status */}
                              <div className="border-t pt-4 mt-4">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                                    <span>Video: {video.videoPath ? '✅ Ready' : '❌ Not rendered'}</span>
                                    <span>Thumbnail: {video.thumbnailPath ? '✅ Ready' : '❌ Not generated'}</span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    {video.thumbnailPath && (
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => setViewingThumbnail({ 
                                          url: video.thumbnailPath!, 
                                          title: video.topic?.title || video.title 
                                        })}
                                      >
                                        <Image className="h-4 w-4 mr-2" />
                                        Preview
                                      </Button>
                                    )}
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => generateThumbnail(video.id)}
                                      disabled={generatingThumbnail === video.id || !video.videoPath}
                                    >
                                      {generatingThumbnail === video.id ? (
                                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                      ) : (
                                        <Sparkles className="h-4 w-4 mr-2" />
                                      )}
                                      {generatingThumbnail === video.id ? 'Generating...' : 'Generate Thumbnail'}
                                    </Button>
                                  </div>
                                </div>
                              </div>

                              {/* YouTube Video ID Section */}
                              <div className="border-t pt-4 mt-4 space-y-3">
                                <div className="flex items-center justify-between">
                                  <label className="text-sm font-semibold text-muted-foreground">YouTube Video ID</label>
                                  {video.youtubeVideoId && (
                                    <Badge variant="default">Uploaded</Badge>
                                  )}
                                </div>
                                
                                {/* Upload Video Button - show when videoPath exists but no youtubeVideoId */}
                                {!video.youtubeVideoId && video.videoPath && video.generationStatus === 'ready' && (
                                  <div className="mb-3">
                                    <Button
                                      variant="default"
                                      size="sm"
                                      onClick={() => uploadVideoToYouTube(video.id)}
                                      disabled={uploadingVideo === video.id}
                                      className="w-full"
                                    >
                                      {uploadingVideo === video.id ? (
                                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                      ) : (
                                        <Upload className="h-4 w-4 mr-2" />
                                      )}
                                      {uploadingVideo === video.id ? 'Uploading...' : 'Upload Video to YouTube'}
                                    </Button>
                                  </div>
                                )}

                                {!video.youtubeVideoId && !video.videoPath && (
                                  <p className="text-xs text-muted-foreground">
                                    No video file available. Please render the video first.
                                  </p>
                                )}
                                <div className="flex gap-2">
                                  <Input
                                    placeholder="e.g., dQw4w9WgXcQ"
                                    value={youtubeIdInput[video.id] || video.youtubeVideoId || ''}
                                    onChange={(e) => setYoutubeIdInput(prev => ({ ...prev, [video.id]: e.target.value }))}
                                    className="flex-1"
                                  />
                                  <Button
                                    variant="secondary"
                                    size="sm"
                                    onClick={() => saveYoutubeVideoId(video.id)}
                                  >
                                    {video.youtubeVideoId ? 'Update' : 'Save ID'}
                                  </Button>
                                </div>
                                {video.youtubeVideoId && (
                                  <div className="flex gap-2">
                                    <Button
                                      variant="default"
                                      size="sm"
                                      onClick={() => updateYoutubeMetadata(video.id)}
                                      disabled={updatingYoutube === video.id}
                                      className="flex-1"
                                    >
                                      {updatingYoutube === video.id ? (
                                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                      ) : (
                                        <Upload className="h-4 w-4 mr-2" />
                                      )}
                                      {updatingYoutube === video.id ? 'Updating...' : 'Update Metadata on YouTube'}
                                    </Button>
                                  </div>
                                )}
                                {video.youtubeVideoId && (
                                  <p className="text-xs text-muted-foreground">
                                    YouTube ID: {video.youtubeVideoId}
                                  </p>
                                )}
                                {video.youtubeVideoId && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="text-orange-600 border-orange-600 hover:bg-orange-50"
                                    onClick={() => clearYoutubeVideoId(video.id)}
                                  >
                                    <X className="h-4 w-4 mr-2" />
                                    Clear YouTube ID
                                  </Button>
                                )}
                              </div>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </>
                  );
                })}
              </TableBody>
            </Table>
          )}

          {/* Video View Modal */}
          {viewingVideo && (
            <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
              <div className="bg-background rounded-lg max-w-4xl w-full max-h-[90vh] overflow-hidden">
                <div className="flex items-center justify-between p-4 border-b">
                  <h3 className="font-semibold truncate pr-4">{viewingVideo.title}</h3>
                  <Button variant="ghost" size="sm" onClick={() => setViewingVideo(null)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                <div className="p-4">
                  <video 
                    src={viewingVideo.url} 
                    controls 
                    className="w-full rounded-lg"
                    style={{ maxHeight: '70vh' }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Thumbnail View Modal */}
          {viewingThumbnail && (
            <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={() => setViewingThumbnail(null)}>
              <div className="bg-background rounded-lg max-w-4xl w-full max-h-[90vh] overflow-hidden" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between p-4 border-b">
                  <h3 className="font-semibold truncate pr-4">{viewingThumbnail.title} - Thumbnail</h3>
                  <Button variant="ghost" size="sm" onClick={() => setViewingThumbnail(null)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                <div className="p-4 flex items-center justify-center bg-muted">
                  <img 
                    src={viewingThumbnail.url} 
                    alt="Thumbnail"
                    className="max-w-full max-h-[70vh] rounded-lg object-contain"
                  />
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
