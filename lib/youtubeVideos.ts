export { isYouTubeOAuthConfigured } from './youtubeOAuth';
import { isYouTubeOAuthConfigured } from './youtubeOAuth';

export type VideoPrivacyStatus = 'public' | 'private' | 'unlisted' | 'scheduled';

export interface YouTubeVideo {
  id: string;
  title: string;
  status: VideoPrivacyStatus;
  publishedAt: string | null;
  scheduledPublishTime: string | null;
}

export function getYouTubeChannelConfig(): { channelId: string; refreshToken: string } | null {
  const channelId = process.env.YOUTUBE_CHANNEL_ID;
  
  if (!channelId) {
    const refreshToken = process.env.YOUTUBE_REFRESH_TOKEN;
    if (!refreshToken) return null;
    return { channelId: 'default', refreshToken };
  }

  const refreshToken = process.env[`YOUTUBE_REFRESH_TOKEN_${channelId}`] || process.env.YOUTUBE_REFRESH_TOKEN;
  
  if (!refreshToken) {
    return null;
  }

  return { channelId, refreshToken };
}

async function getAccessTokenInternal(): Promise<string> {
  const YOUTUBE_CLIENT_ID = process.env.YOUTUBE_CLIENT_ID;
  const YOUTUBE_CLIENT_SECRET = process.env.YOUTUBE_CLIENT_SECRET;
  
  const channelConfig = getYouTubeChannelConfig();
  if (!channelConfig) {
    throw new Error('YouTube refresh token not configured. Please complete OAuth setup.');
  }
  
  const { refreshToken } = channelConfig;

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

export async function getYouTubeChannelVideos(): Promise<YouTubeVideo[]> {
  if (!isYouTubeOAuthConfigured()) {
    throw new Error('YouTube OAuth not configured');
  }

  const channelConfig = getYouTubeChannelConfig();
  if (!channelConfig) {
    throw new Error('YouTube channel not configured');
  }

  const accessToken = await getAccessTokenInternal();

  // Get channel's uploads playlist ID
  const channelResponse = await fetch(
    'https://www.googleapis.com/youtube/v3/channels?part=contentDetails&mine=true',
    {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    }
  );

  if (!channelResponse.ok) {
    const error = await channelResponse.json();
    throw new Error(`Failed to get channel: ${JSON.stringify(error)}`);
  }

  const channelData = await channelResponse.json();
  const uploadsPlaylistId = channelData.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;

  if (!uploadsPlaylistId) {
    throw new Error('Could not find uploads playlist');
  }

  // Get videos from uploads playlist
  const allVideos: YouTubeVideo[] = [];
  let nextPageToken: string | undefined;

  do {
    const params = new URLSearchParams({
      part: 'snippet,status',
      playlistId: uploadsPlaylistId,
      maxResults: '50',
      ...(nextPageToken && { pageToken: nextPageToken })
    });

    const response = await fetch(
      `https://www.googleapis.com/youtube/v3/playlistItems?${params}`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Failed to get playlist items: ${JSON.stringify(error)}`);
    }

    const data = await response.json();

    for (const item of data.items || []) {
      const snippet = item.snippet;
      const status = item.status?.privacyStatus || 'private';
      
      allVideos.push({
        id: snippet.resourceId?.videoId || '',
        title: snippet.title || '',
        status: status as VideoPrivacyStatus,
        publishedAt: snippet.publishedAt || null,
        scheduledPublishTime: item.status?.publishAt || null
      });
    }

    nextPageToken = data.nextPageToken;
  } while (nextPageToken);

  return allVideos;
}

export async function getYouTubeVideoTitles(): Promise<string[]> {
  const videos = await getYouTubeChannelVideos();
  return videos.map(v => v.title);
}

export async function isTopicOnYouTube(topicTitle: string): Promise<boolean> {
  const titles = await getYouTubeVideoTitles();
  const normalizedTopic = topicTitle.toLowerCase().trim();
  return titles.some(t => t.toLowerCase().trim() === normalizedTopic);
}

export async function getYouTubeVideosByStatus(
  status?: VideoPrivacyStatus[]
): Promise<YouTubeVideo[]> {
  const allVideos = await getYouTubeChannelVideos();

  if (!status || status.length === 0) {
    return allVideos;
  }

  return allVideos.filter(video => status.includes(video.status));
}

export async function getYouTubeVideoTitlesByStatus(
  status?: VideoPrivacyStatus[]
): Promise<{ status: VideoPrivacyStatus; titles: string[] }[]> {
  const videos = await getYouTubeVideosByStatus(status);
  
  const groupedByStatus = videos.reduce((acc, video) => {
    if (!acc[video.status]) {
      acc[video.status] = [];
    }
    acc[video.status].push(video.title);
    return acc;
  }, {} as Record<VideoPrivacyStatus, string[]>);

  const statuses = status || ['public', 'private', 'unlisted', 'scheduled'];
  
  return statuses.map(s => ({
    status: s,
    titles: groupedByStatus[s] || []
  }));
}

export async function getYouTubeVideoTitlesFlat(
  status?: VideoPrivacyStatus[]
): Promise<string[]> {
  const videos = await getYouTubeVideosByStatus(status);
  return videos.map(v => v.title);
}
