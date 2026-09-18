import 'dotenv/config';
import { prisma } from '@/lib/db';
import { getYouTubeChannelVideos, getYouTubeChannelConfig, isYouTubeOAuthConfigured } from '@/lib/youtubeVideos';

async function populateExistingVideos() {
  console.log('[Populate] Starting to populate existing YouTube videos...');

  if (!isYouTubeOAuthConfigured()) {
    console.error('[Populate] YouTube OAuth not configured');
    process.exit(1);
  }

  const channelConfig = getYouTubeChannelConfig();
  if (!channelConfig) {
    console.error('[Populate] YouTube channel not configured');
    process.exit(1);
  }

  console.log('[Populate] Channel:', channelConfig.channelId);

  const videos = await getYouTubeChannelVideos();
  console.log(`[Populate] Found ${videos.length} videos on YouTube`);

  if (videos.length === 0) {
    console.log('[Populate] No videos found');
    return;
  }

  // Create a default batch for existing videos
  let batch = await prisma.topicBatch.findFirst({
    where: { baseTopic: '__EXISTING_YT_VIDEOS__' }
  });

  if (!batch) {
    batch = await prisma.topicBatch.create({
      data: {
        baseTopic: '__EXISTING_YT_VIDEOS__',
        days: 0,
      }
    });
    console.log('[Populate] Created default batch:', batch.id);
  }

  // Get existing titles from topics
  const existingTopics = await prisma.topic.findMany({
    select: { title: true }
  });
  const existingTitles = new Set(existingTopics.map(t => t.title.toLowerCase().trim()));
  console.log(`[Populate] Existing topics in DB: ${existingTitles.size}`);

  let createdCount = 0;
  let skippedCount = 0;

  for (const video of videos) {
    const normalizedTitle = video.title.toLowerCase().trim();
    
    if (existingTitles.has(normalizedTitle)) {
      skippedCount++;
      continue;
    }

    // Create topic
    await prisma.topic.create({
      data: {
        title: video.title,
        selected: false,
        batchId: batch.id,
        isExistingVideo: true,
      }
    });

    existingTitles.add(normalizedTitle);
    createdCount++;
    
    if (createdCount % 10 === 0) {
      console.log(`[Populate] Created ${createdCount} topics so far...`);
    }
  }

  console.log(`[Populate] Done! Created: ${createdCount}, Skipped (duplicates): ${skippedCount}`);
}

populateExistingVideos()
  .then(() => {
    console.log('[Populate] Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('[Populate] Error:', error);
    process.exit(1);
  });
