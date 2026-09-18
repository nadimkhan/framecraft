import { prisma } from "../lib/db";
async function main() {
  const series = await prisma.series.findMany({
    select: { id: true, seriesName: true, youtubeChannelId: true, instagramAccountId: true }
  });
  console.log(JSON.stringify(series, null, 2));
}
main().finally(() => prisma.$disconnect());
