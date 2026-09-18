import sharp from 'sharp'

interface TextOverlayOptions {
  text: string
  fontSize?: number
  color?: string
  backgroundColor?: string
  maxWidth?: number
}

export async function addTextOverlay(
  inputPath: string,
  outputPath: string,
  options: TextOverlayOptions
): Promise<void> {
  const {
    text,
    fontSize = 32,
    color = 'white',
    backgroundColor = 'rgba(0, 0, 0, 0.6)',
    maxWidth = 800
  } = options

  const image = sharp(inputPath)
  const metadata = await image.metadata()
  const width = metadata.width || 800

  const textWidth = Math.min(width - 40, maxWidth)
  
  const svgText = `
    <svg width="${textWidth}" height="100">
      <rect x="0" y="0" width="${textWidth}" height="100" fill="${backgroundColor}" rx="8"/>
      <text
        x="${textWidth / 2}"
        y="55"
        font-family="Arial, sans-serif"
        font-size="${fontSize}"
        fill="${color}"
        text-anchor="middle"
        dominant-baseline="middle"
      >${escapeXml(text)}</text>
    </svg>
  `

  await image
    .composite([
      {
        input: Buffer.from(svgText),
        gravity: 'south'
      }
    ])
    .toFile(outputPath)
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}
