import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export default function ReviewPage() {
  return (
    <div className="p-8 space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Review</h1>
        <p className="text-muted-foreground mt-1">
          Preview and approve videos before uploading
        </p>
      </div>

      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center justify-center py-12">
          <p className="text-muted-foreground text-center">
            Phase 3: Video Rendering & Review
          </p>
          <p className="text-sm text-muted-foreground mt-2">
            Rendered videos will appear here for review
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
