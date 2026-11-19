import { formatTime, parseSlides } from './text'
import type { Recording } from './types'

export function download(name: string, data: BlobPart, type = 'text/plain') {
  const url = URL.createObjectURL(new Blob([data], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const safeName = (s: string) => s.replace(/[\\/:*?"<>|]+/g, '_').slice(0, 60) || 'note'

export function exportMarkdown(rec: Recording) {
  const transcript = rec.segments.map((s) => `[${formatTime(s.start)}] ${s.text}`).join('\n')
  download(`${safeName(rec.title)}.md`, `# ${rec.title}\n\n${rec.summary}\n\n## Transcript\n\n${transcript}\n`, 'text/markdown')
}

export async function exportPptx(rec: Recording) {
  const { default: PptxGenJS } = await import('pptxgenjs')
  const slides = parseSlides(rec.slides)
  const pptx = new PptxGenJS()
  pptx.layout = 'LAYOUT_WIDE'
  slides.forEach((s, i) => {
    const slide = pptx.addSlide()
    slide.background = { color: i === 0 ? '4F46E5' : 'FFFFFF' }
    const color = i === 0 ? 'FFFFFF' : '1E293B'
    slide.addText(s.title, { x: 0.6, y: 0.4, w: 12, h: 1, fontSize: i === 0 ? 40 : 30, bold: true, color })
    if (s.bullets.length)
      slide.addText(
        s.bullets.map((b) => ({ text: b, options: { bullet: true, breakLine: true } })),
        { x: 0.8, y: 1.7, w: 11.6, h: 5, fontSize: 22, color, valign: 'top' },
      )
  })
  await pptx.writeFile({ fileName: `${safeName(rec.title)}.pptx` })
}
