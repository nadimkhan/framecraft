import { prisma } from '@/lib/db'

async function fixPrompts() {
  const scenes = await prisma.scene.findMany({
    where: {
      prompt: {
        contains: 'Anime-style',
      },
    },
  })

  console.log(`Found ${scenes.length} scenes with Anime-style prompts`)

  for (const scene of scenes) {
    const oldPrompt = scene.prompt
    const newPrompt = oldPrompt
      .replace(/Anime-style/gi, 'ANIME CONCEPT ART:')
      .replace(/ANIME CONCEPT ART::/g, 'ANIME CONCEPT ART:')

    await prisma.scene.update({
      where: { id: scene.id },
      data: { prompt: newPrompt },
    })

    console.log(`Updated scene ${scene.id}: ${oldPrompt.substring(0, 50)}... -> ${newPrompt.substring(0, 50)}...`)
  }

  console.log('Done!')
}

fixPrompts()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
