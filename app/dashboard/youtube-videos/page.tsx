import { getYouTubeVideosByStatus, VideoPrivacyStatus } from '@/lib/youtubeVideos'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PageHeader } from '@/components/page-header'

export const dynamic = 'force-dynamic'

async function getVideos() {
  try {
    const videos = await getYouTubeVideosByStatus(['public', 'private', 'unlisted', 'scheduled'])
    return videos
  } catch (error) {
    console.error('Failed to fetch YouTube videos:', error)
    return []
  }
}

export default async function YouTubeVideosPage() {
  const videos = await getVideos()

  const groupedVideos = videos.reduce((acc, video) => {
    if (!acc[video.status]) {
      acc[video.status] = []
    }
    acc[video.status].push(video)
    return acc
  }, {} as Record<VideoPrivacyStatus, typeof videos>)

  const statusLabels: Record<VideoPrivacyStatus, { label: string; color: string }> = {
    public: { label: 'Published', color: 'text-green-500' },
    private: { label: 'Private', color: 'text-gray-500' },
    unlisted: { label: 'Unlisted', color: 'text-yellow-500' },
    scheduled: { label: 'Scheduled', color: 'text-blue-500' },
  }

  return (
    <div className="flex-1 min-w-0 flex flex-col">
      <PageHeader
        title="YouTube Videos"
        description="Videos published or scheduled on your channel"
      />
      <div className="flex-1 px-6 py-6">
        {videos.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              No videos found on your channel.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-8">
          {(['public', 'scheduled', 'unlisted', 'private'] as VideoPrivacyStatus[]).map((status) => {
            const statusVideos = groupedVideos[status]
            if (!statusVideos || statusVideos.length === 0) return null

            return (
              <Card key={status}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <span className={statusLabels[status].color}>●</span>
                    {statusLabels[status].label}
                    <span className="text-muted-foreground font-normal">({statusVideos.length})</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {statusVideos.map((video) => (
                      <li key={video.id} className="flex items-center gap-3">
                        <a
                          href={`https://youtube.com/watch?v=${video.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:underline truncate"
                        >
                          {video.title}
                        </a>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
      </div>
    </div>
  )
}
