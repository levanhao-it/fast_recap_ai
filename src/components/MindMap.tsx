import { useEffect, useRef } from 'react'
import { Transformer } from 'markmap-lib'
import { Markmap } from 'markmap-view'
import { download } from '../lib/export'

const transformer = new Transformer()

export default function MindMap({ markdown, name }: { markdown: string; name: string }) {
  const svg = useRef<SVGSVGElement>(null)
  const mm = useRef<Markmap | null>(null)

  useEffect(() => {
    if (!svg.current) return
    const { root } = transformer.transform(markdown)
    if (!mm.current) mm.current = Markmap.create(svg.current, { duration: 300 }, root)
    else {
      mm.current.setData(root)
      void mm.current.fit()
    }
  }, [markdown])

  const saveSvg = () => {
    if (!svg.current) return
    const clone = svg.current.cloneNode(true) as SVGSVGElement
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
    download(`${name}.svg`, new XMLSerializer().serializeToString(clone), 'image/svg+xml')
  }

  return (
    <div>
      <svg ref={svg} className="h-[60vh] w-full rounded-xl border border-slate-200 bg-white text-slate-900 dark:border-slate-700" />
      <div className="mt-2 flex gap-2">
        <button className="btn-ghost" onClick={() => void mm.current?.fit()}>
          Fit
        </button>
        <button className="btn-ghost" onClick={saveSvg}>
          SVG
        </button>
      </div>
    </div>
  )
}
