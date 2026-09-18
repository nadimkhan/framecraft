import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { youtubeApiRequest, isYouTubeOAuthConfigured, getYouTubeClientId } from '@/lib/youtubeOAuth';
import fs from 'fs';
import path from 'path';
import { sanitizeFolderName } from '@/lib/tts';

interface YouTubeChannelConfig {
  channelId: string;
  refreshToken: string;
}

function getYouTubeChannelConfig(): YouTubeChannelConfig | null {
  const channelId = process.env.YOUTUBE_CHANNEL_ID;
  
  if (!channelId) {
    const refreshToken = process.env.YOUTUBE_REFRESH_TOKEN;
    if (!refreshToken) return null;
    return { channelId: 'default', refreshToken };
  }

  const refreshToken = process.env[`YOUTUBE_REFRESH_TOKEN_${channelId}`] || process.env.YOUTUBE_REFRESH_TOKEN;
  
  if (!refreshToken) {
    console.error(`[LongForm YouTube Upload] No refresh token found for channel ${channelId}`);
    return null;
  }

  return { channelId, refreshToken };
}

function getConfiguredChannels(): string[] {
  const channels: string[] = [];
  
  if (process.env.YOUTUBE_REFRESH_TOKEN) {
    channels.push('default');
  }
  
  const envKeys = Object.keys(process.env);
  for (const key of envKeys) {
    if (key.startsWith('YOUTUBE_REFRESH_TOKEN_') && process.env[key]) {
      const channelId = key.replace('YOUTUBE_REFRESH_TOKEN_', '');
      channels.push(channelId);
    }
  }
  
  return channels;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { videoId } = body;

    console.log('[LongForm YouTube Upload] Request body:', body);
    console.log('[LongForm YouTube Upload] Video ID:', videoId, 'Type:', typeof videoId);

    if (!videoId) {
      return NextResponse.json(
        { error: 'Video ID is required' },
        { status: 400 }
      );
    }

    const parsedVideoId = parseInt(String(videoId), 10);
    if (isNaN(parsedVideoId)) {
      return NextResponse.json(
        { error: 'Invalid video ID' },
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

    const channelConfig = getYouTubeChannelConfig();
    if (!channelConfig) {
      return NextResponse.json({
        error: 'YouTube channel not configured',
        message: 'Please set YOUTUBE_CHANNEL_ID in .env file',
        configuredChannels: getConfiguredChannels()
      }, { status: 500 });
    }

    console.log('[LongForm YouTube Upload] Using channel:', channelConfig.channelId);

    const video = await prisma.video.findUnique({
      where: { id: parsedVideoId },
      include: { topic: true, batch: true }
    });

    console.log('[LongForm YouTube Upload] Found video:', video?.id, 'videoPath:', video?.videoPath, 'thumbnailPath:', video?.thumbnailPath);

    if (!video) {
      return NextResponse.json(
        { error: 'Video not found' },
        { status: 404 }
      );
    }

    // Check if this is a long form video
    if (video.batch?.contentMode !== 'long_form') {
      return NextResponse.json(
        { error: 'This video is not a long form video. Use the regular upload endpoint.' },
        { status: 400 }
      );
    }

    // Find video file
    let videoFilePath: string | null = null;
    
    if (video.videoPath) {
      videoFilePath = path.join(process.cwd(), 'public', video.videoPath.replace(/^\//, ''));
    } else {
      const topicTitle = video.topic?.title || video.title;
      const sanitizedTitle = sanitizeFolderName(topicTitle);
      const windowsVideoPath = `/generations/${sanitizedTitle}/${sanitizedTitle}.mp4`;
      const potentialPath = path.join(process.cwd(), 'public', windowsVideoPath.replace(/^\//, ''));
      
      if (fs.existsSync(potentialPath)) {
        videoFilePath = potentialPath;
        console.log('[LongForm YouTube Upload] Found Windows-rendered video at:', videoFilePath);
      }
    }

    if (!videoFilePath) {
      return NextResponse.json(
        { error: 'Video file not found. Please render the video first.' },
        { status: 400 }
      );
    }

    if (!fs.existsSync(videoFilePath)) {
      return NextResponse.json(
        { error: 'Video file does not exist on disk', path: videoFilePath },
        { status: 400 }
      );
    }

    // Find thumbnail file
    let thumbnailFilePath: string | null = null;
    
    if (video.thumbnailPath) {
      thumbnailFilePath = path.join(process.cwd(), 'public', video.thumbnailPath.replace(/^\//, ''));
    } else {
      // Try to find thumbnail on disk
      const topicTitle = video.topic?.title || video.title;
      const sanitizedTitle = sanitizeFolderName(topicTitle);
      const thumbPath = path.join(process.cwd(), 'public', 'generations', sanitizedTitle, `${sanitizedTitle}.jpg`);
      
      if (fs.existsSync(thumbPath)) {
        thumbnailFilePath = thumbPath;
        console.log('[LongForm YouTube Upload] Found thumbnail at:', thumbnailFilePath);
      }
    }

    console.log('[LongForm YouTube Upload] Full video file path:', videoFilePath);
    console.log('[LongForm YouTube Upload] Full thumbnail path:', thumbnailFilePath);

    const videoTitle = video.topic?.title || video.title || 'Untitled Video';
    const videoDescription = video.description || '';
    const videoTags = video.tags 
      ? video.tags.split(',').map((t: string) => t.trim()) 
      : [];

    console.log('[LongForm YouTube Upload] Starting upload:');
    console.log('[LongForm YouTube Upload] Channel:', channelConfig.channelId);
    console.log('  File:', videoFilePath);
    console.log('  Thumbnail:', thumbnailFilePath);
    console.log('  Title:', videoTitle);
    console.log('  Description:', videoDescription?.substring(0, 100) + '...');

    const accessToken = await getAccessTokenInternal(channelConfig);

    // Step 1: Upload video with metadata
    const fileBuffer = fs.readFileSync(videoFilePath);
    const fileSize = fileBuffer.length;

    const metadata = {
      snippet: {
        title: videoTitle,
        description: videoDescription,
        tags: videoTags,
        categoryId: '22'
      },
      status: {
        privacyStatus: 'private'
      }
    };

    const metadataString = JSON.stringify(metadata);
    
    const boundary = '-------' + Math.random().toString(36).substring(2);
    const delimiter = '\r\n--' + boundary + '\r\n';
    const closeDelimiter = '\r\n--' + boundary + '--';

    const videoRequestBody = 
      delimiter + 'Content-Type: application/json; charset=UTF-8\r\n\r\n' + 
      metadataString + 
      delimiter + 'Content-Type: video/*\r\nContent-Transfer-Encoding: binary\r\n\r\n';

    const trailingBytes = Buffer.from(closeDelimiter, 'utf-8');
    const totalBodyLength = Buffer.byteLength(videoRequestBody) + fileBuffer.length + trailingBytes.length;

    const uploadResponse = await fetch(
      `https://www.googleapis.com/upload/youtube/v3/videos?uploadType=multipart&part=snippet,status`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': `multipart/related; boundary="${boundary}"`,
          'Content-Length': totalBodyLength.toString()
        },
        body: Buffer.concat([
          Buffer.from(videoRequestBody, 'utf-8'),
          fileBuffer,
          trailingBytes
        ])
      }
    );

    if (!uploadResponse.ok) {
      const error = await uploadResponse.json();
      console.error('YouTube API video upload error:', JSON.stringify(error, null, 2));
      return NextResponse.json(
        { error: error.error?.message || 'Failed to upload video to YouTube', details: error },
        { status: uploadResponse.status }
      );
    }

    const youtubeData = await uploadResponse.json();
    console.log('YouTube video upload response:', youtubeData);

    const youtubeVideoId = youtubeData.id;

    // Step 2: Upload thumbnail if available
    if (thumbnailFilePath && fs.existsSync(thumbnailFilePath)) {
      console.log('[LongForm YouTube Upload] Uploading thumbnail...');
      
      const thumbBuffer = fs.readFileSync(thumbnailFilePath);

      const thumbResponse = await fetch(
        `https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${youtubeVideoId}`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'image/jpeg',
            'Content-Length': thumbBuffer.length.toString()
          },
          body: thumbBuffer
        }
      );

      if (!thumbResponse.ok) {
        const thumbError = await thumbResponse.json();
        console.warn('YouTube thumbnail upload warning:', JSON.stringify(thumbError, null, 2));
        // Continue - thumbnail failure is not critical
      } else {
        console.log('[LongForm YouTube Upload] Thumbnail uploaded successfully!');
      }
    } else {
      console.log('[LongForm YouTube Upload] No thumbnail found, skipping thumbnail upload');
    }

    // Save YouTube video ID to database
    const updatedVideo = await prisma.video.update({
      where: { id: parsedVideoId },
      data: { 
        youtubeVideoId: youtubeVideoId
      },
    });

    console.log('[LongForm YouTube Upload] Video uploaded successfully, YouTube ID:', youtubeVideoId);

    return NextResponse.json({
      success: true,
      youtubeVideoId: youtubeVideoId,
      thumbnailUploaded: !!thumbnailFilePath,
      message: 'Long form video uploaded to YouTube successfully (private). Go to YouTube Studio > Content to publish it.'
    });
  } catch (error) {
    console.error('Error uploading long form video to YouTube:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to upload video' },
      { status: 500 }
    );
  }
}

async function getAccessTokenInternal(channelConfig: YouTubeChannelConfig): Promise<string> {
  const YOUTUBE_CLIENT_ID = process.env.YOUTUBE_CLIENT_ID;
  const YOUTUBE_CLIENT_SECRET = process.env.YOUTUBE_CLIENT_SECRET;
  const refreshToken = channelConfig.refreshToken;
  
  if (!refreshToken) {
    throw new Error('YouTube refresh token not configured. Please complete OAuth setup.');
  }

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({
      client_id: YOUTUBE_CLIENT_ID || '',
      client_secret: YOUTUBE_CLIENT_SECRET || '',
      refresh_token: refreshToken,
      grant_type: 'refresh_token'
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to refresh access token: ${error}`);
  }

  const data = await response.json();
  return data.access_token;
}
