import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'

// GET /api/onboarding/status — check onboarding state
export async function GET() {
  try {
    const config = await prisma.channelConfig.findFirst()

    if (!config) {
      return NextResponse.json({
        completed: false,
        step: 'niche',
        niche: null,
        artStyle: null,
        voiceStyle: null,
        backgroundMusic: null,
        effects: [],
        socials: [],
        series: null,
      })
    }

    // Fetch related data
    const [niche, artStyle, voiceStyle, backgroundMusicList, effects, socials] = await Promise.all([
      config.nicheId ? prisma.niche.findUnique({ where: { id: config.nicheId } }) : null,
      config.artStyleId ? prisma.artStyle.findUnique({ where: { id: config.artStyleId } }) : null,
      config.voiceStyleId ? prisma.voiceStyle.findUnique({ where: { id: config.voiceStyleId } }) : null,
      config.backgroundMusicIds.length > 0
        ? prisma.backgroundMusic.findMany({ where: { id: { in: config.backgroundMusicIds } } })
        : [],
      config.effectIds.length > 0 ? prisma.effect.findMany({ where: { id: { in: config.effectIds } } }) : [],
      prisma.socialAccount.findMany({ where: { userId: 'default' } }),
    ])

    // Determine current step
    let step = 'niche'
    if (config.nicheId) step = 'voice'
    if (config.voiceStyleId) step = 'music'
    if (config.backgroundMusicIds.length > 0 || config.customMusicPaths.length > 0) step = 'art-style'
    if (config.artStyleId) step = 'effects'
    if (config.effectIds.length > 0) step = 'socials'
    if (socials.some(s => s.status === 'connected')) step = 'series'
    if (config.onboardingCompleted) step = 'done'

    const backgroundMusic = backgroundMusicList[0] || (config.customMusicPaths[0]
      ? { name: 'Custom Upload', slug: 'custom', customPath: config.customMusicPaths[0] }
      : null)

    return NextResponse.json({
      completed: config.onboardingCompleted,
      step,
      niche,
      artStyle,
      voiceStyle,
      backgroundMusic,
      effects,
      socials,
      series: {
        contentMode: config.contentMode,
        videoDuration: config.videoDuration,
        videosPerDay: config.videosPerDay,
        publishTimes: config.publishTimes,
      },
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
