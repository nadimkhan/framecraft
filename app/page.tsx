import { redirect } from 'next/navigation'
import prisma from '@/lib/db'

export const dynamic = 'force-dynamic'

export default async function HomePage() {
  // Check if any Series has completed onboarding
  const completedSeries = await prisma.series.findFirst({
    where: { onboardingCompleted: true },
    take: 1,
  })

  if (!completedSeries) {
    redirect('/onboarding')
  }

  redirect('/dashboard')
}
