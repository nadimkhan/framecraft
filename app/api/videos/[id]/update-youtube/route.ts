import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { youtubeApiRequest, isYouTubeOAuthConfigured, getYouTubeClientId } from '@/lib/youtubeOAuth';

const prisma = new PrismaClient();

export async function POST(request: NextRequest) {
  try {
    const { videoId, youtubeVideoId, title, description, tags } = await request.json();

    if (!videoId || !youtubeVideoId) {
      return NextResponse.json(
        { error: 'Video ID and YouTube Video ID are required' },
        { status: 400 }
      );
    }

    if (!isYouTubeOAuthConfigured()) {
      const clientId = getYouTubeClientId();
      return NextResponse.json({
        error: 'YouTube OAuth not configured',
        authUrl: clientId ? '/api/youtube/callback' : null,
        message: 'Please complete OAuth setup. Visit /api/youtube/callback to authorize.'
      }, { status: 500 });
    }

    const video = await prisma.video.findUnique({
      where: { id: videoId },
      include: { topic: true }
    });

    if (!video) {
      return NextResponse.json(
        { error: 'Video not found' },
        { status: 404 }
      );
    }

    const videoTitle = title || video.topic?.title || video.title;
    const videoDescription = description || video.description || '';
    const videoTags = tags 
      ? (Array.isArray(tags) ? tags : tags.split(',').map((t: string) => t.trim())) 
      : (video.tags ? video.tags.split(',').map((t: string) => t.trim()) : []);

    console.log('[YouTube Update] Sending request:');
    console.log('  Video ID:', youtubeVideoId);
    console.log('  Title:', videoTitle);
    console.log('  Description:', videoDescription?.substring(0, 100) + '...');
    console.log('  Tags:', videoTags);

    const youtubeResponse = await youtubeApiRequest(
      `videos?part=snippet`,
      'PUT',
      {
        id: youtubeVideoId,
        snippet: {
          title: videoTitle,
          description: videoDescription,
          tags: videoTags,
          categoryId: '22'
        }
      }
    );

    console.log('[YouTube Update] Response status:', youtubeResponse.status);

    if (!youtubeResponse.ok) {
      const error = await youtubeResponse.json();
      console.error('YouTube API error:', JSON.stringify(error, null, 2));
      return NextResponse.json(
        { error: error.error?.message || 'Failed to update YouTube video', details: error },
        { status: youtubeResponse.status }
      );
    }

    const youtubeData = await youtubeResponse.json();
    console.log('YouTube update response:', youtubeData);

    return NextResponse.json({
      success: true,
      youtubeVideoId,
      message: 'Metadata updated on YouTube successfully',
    });
  } catch (error) {
    console.error('Error updating YouTube metadata:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update metadata' },
      { status: 500 }
    );
  }
}
