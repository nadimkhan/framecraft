const YOUTUBE_CLIENT_ID = process.env.YOUTUBE_CLIENT_ID;
const YOUTUBE_CLIENT_SECRET = process.env.YOUTUBE_CLIENT_SECRET;
const YOUTUBE_REDIRECT_URI = process.env.YOUTUBE_REDIRECT_URI || 'http://localhost:3000/api/youtube/callback';

console.log('[YouTube OAuth] CLIENT_ID:', YOUTUBE_CLIENT_ID ? 'set' : 'NOT SET');
console.log('[YouTube OAuth] CLIENT_SECRET:', YOUTUBE_CLIENT_SECRET ? 'set' : 'NOT SET');

let cachedAccessToken: string | null = null;
let tokenExpiry: number = 0;

export function getYouTubeAuthUrl(): string {
  const scopes = [
    'https://www.googleapis.com/auth/youtube',
    'https://www.googleapis.com/auth/youtube.force-ssl'
  ];
  
  const params = new URLSearchParams({
    client_id: YOUTUBE_CLIENT_ID || '',
    redirect_uri: YOUTUBE_REDIRECT_URI,
    response_type: 'code',
    scope: scopes.join(' '),
    access_type: 'offline',
    prompt: 'consent'
  });
  
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function exchangeCodeForTokens(code: string): Promise<{ refresh_token: string; access_token: string }> {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({
      client_id: YOUTUBE_CLIENT_ID || '',
      client_secret: YOUTUBE_CLIENT_SECRET || '',
      code,
      grant_type: 'authorization_code',
      redirect_uri: YOUTUBE_REDIRECT_URI
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to exchange code for tokens: ${error}`);
  }

  const data = await response.json();
  return {
    refresh_token: data.refresh_token,
    access_token: data.access_token
  };
}

export async function getAccessToken(): Promise<string> {
  const refreshToken = process.env.YOUTUBE_REFRESH_TOKEN;
  
  if (!refreshToken) {
    throw new Error('YouTube refresh token not configured. Please complete OAuth setup.');
  }

  if (cachedAccessToken && Date.now() < tokenExpiry) {
    return cachedAccessToken;
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
  cachedAccessToken = data.access_token;
  tokenExpiry = Date.now() + (data.expires_in * 1000) - 60000;

  return cachedAccessToken as string;
}

export async function youtubeApiRequest(
  endpoint: string,
  method: string = 'GET',
  body?: object
): Promise<Response> {
  const accessToken = await getAccessToken();

  return fetch(`https://www.googleapis.com/youtube/v3/${endpoint}`, {
    method,
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: body ? JSON.stringify(body) : undefined
  });
}

export function isYouTubeOAuthConfigured(): boolean {
  // Check for default refresh token or channel-specific token
  const hasDefaultToken = !!process.env.YOUTUBE_REFRESH_TOKEN;
  const hasChannelToken = !!process.env.YOUTUBE_CHANNEL_ID && !!process.env[`YOUTUBE_REFRESH_TOKEN_${process.env.YOUTUBE_CHANNEL_ID}`];
  
  return !!(YOUTUBE_CLIENT_ID && YOUTUBE_CLIENT_SECRET && (hasDefaultToken || hasChannelToken));
}

export function canStartOAuthFlow(): boolean {
  return !!(YOUTUBE_CLIENT_ID && YOUTUBE_CLIENT_SECRET);
}

export function getYouTubeClientId(): string | undefined {
  return YOUTUBE_CLIENT_ID;
}
