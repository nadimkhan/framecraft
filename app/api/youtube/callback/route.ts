import { NextRequest, NextResponse } from 'next/server';
import { exchangeCodeForTokens, getYouTubeAuthUrl, canStartOAuthFlow } from '@/lib/youtubeOAuth';
import fs from 'fs';
import path from 'path';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');
  const error = searchParams.get('error');

  if (error) {
    return NextResponse.json({ error: error }, { status: 400 });
  }

  if (!code) {
    const canStart = canStartOAuthFlow();
    console.log('[Callback] canStartOAuth:', canStart);
    
    if (!canStart) {
      return NextResponse.json({
        error: 'YouTube OAuth not configured',
        message: 'Please add YOUTUBE_CLIENT_ID and YOUTUBE_CLIENT_SECRET to .env file',
        authUrl: null,
        debug: {
          clientId: !!process.env.YOUTUBE_CLIENT_ID,
          clientSecret: !!process.env.YOUTUBE_CLIENT_SECRET,
          refreshToken: !!process.env.YOUTUBE_REFRESH_TOKEN
        }
      }, { status: 400 });
    }

    const authUrl = getYouTubeAuthUrl();
    return NextResponse.redirect(authUrl);
  }

  try {
    console.log('[YouTube OAuth] Exchanging code for tokens...');
    const tokens = await exchangeCodeForTokens(code);
    
    console.log('[YouTube OAuth] Got tokens!');
    console.log('[YouTube OAuth] Refresh token:', tokens.refresh_token ? 'received' : 'not received');
    console.log('[YouTube OAuth] Access token:', tokens.access_token ? 'received' : 'not received');

    const envPath = path.join(process.cwd(), '.env');
    let envContent = fs.readFileSync(envPath, 'utf-8');

    // Check if YOUTUBE_CHANNEL_ID is set - if so, save channel-specific token
    const channelId = process.env.YOUTUBE_CHANNEL_ID;
    const tokenKey = channelId ? `YOUTUBE_REFRESH_TOKEN_${channelId}` : 'YOUTUBE_REFRESH_TOKEN';
    
    // Always save the new token (overwrite old one)
    const tokenRegex = new RegExp(`^${tokenKey}=.*$`, 'm');
    if (envContent.match(tokenRegex)) {
      envContent = envContent.replace(tokenRegex, `${tokenKey}="${tokens.refresh_token}"`);
    } else {
      envContent += `\n${tokenKey}="${tokens.refresh_token}"`;
    }

    fs.writeFileSync(envPath, envContent);

    return NextResponse.json({
      success: true,
      message: channelId 
        ? `YouTube OAuth authorized for channel ${channelId}! Token saved.`
        : 'YouTube OAuth authorized successfully! Token saved.',
      hasRefreshToken: !!tokens.refresh_token,
      channelId: channelId || 'default'
    });
  } catch (error) {
    console.error('[YouTube OAuth] Error:', error);
    return NextResponse.json({
      error: 'Failed to exchange code for tokens',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
