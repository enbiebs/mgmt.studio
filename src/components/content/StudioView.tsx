'use client'
import { useStore } from '@/lib/store'

const CONCEPTS = [
  { name: 'Collage',         desc: 'Vertical band + centre-axis shape stack (Form A).' },
  { name: 'Frame',           desc: 'Landscape 2-clip crossed split-screen (Form B).'   },
  { name: 'Fast-cut',        desc: '½-beat hard-cut bed + strobe bursts (Form C).'     },
  { name: 'Dark Film',       desc: '4:3 dark dreamy lo-fi flash-cut mood (Concept D).' },
  { name: 'Diptych',         desc: 'Magazine card + square clip over full-bleed (Form E).' },
  { name: 'Typology Grid',   desc: '4:5 white-page 3×3 word-per-cell grid (Form F).'  },
  { name: 'Editorial Split', desc: '5:4 magazine split, lyric in the margins (Form G).'},
]

const LOOKS = ['Dream filter', 'Film stock', 'Dark Film Grade', 'Airy Cool']
const FX    = ['Grade (enhance)', 'Film texture', 'Filmic finish', 'Overlay plate']

export function StudioView() {
  const { studioConcept, setStudioConcept } = useStore()

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Left — concepts */}
      <div className="w-[214px] flex-shrink-0 border-r border-gray-100 overflow-auto p-3">
        <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 px-2 mb-1.5">Concepts</div>
        {CONCEPTS.map(c => (
          <button
            key={c.name}
            onClick={() => setStudioConcept(c.name)}
            className={`w-full text-left px-2.5 py-2 rounded-xl mb-0.5 transition-colors ${
              studioConcept === c.name ? 'bg-blue-50' : 'hover:bg-gray-50'
            }`}
          >
            <div className="text-sm font-medium">{c.name}</div>
            <div className="text-[11px] text-gray-400 mt-0.5 leading-tight">{c.desc}</div>
          </button>
        ))}
      </div>

      {/* Center — canvas + prompt */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex-1 flex items-center justify-center bg-gray-50 border-b border-gray-100 text-gray-400">
          <div className="text-center">
            <div className="text-5xl mb-3">🎬</div>
            <div className="font-medium text-gray-500">Drop footage or upload to start</div>
            <div className="text-sm mt-1.5 text-gray-400">
              Concept: <span className="font-medium">{studioConcept ?? 'None selected'}</span>
            </div>
          </div>
        </div>
        <div className="p-4 flex gap-3">
          <textarea
            className="flex-1 border border-gray-200 rounded-xl px-3 py-2.5 resize-none h-[72px] outline-none text-sm focus:border-blue-400 bg-canvas"
            placeholder='Describe your edit, e.g. "warm teal-orange grade, punch in slowly, glitch the cut"'
          />
          <button className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium rounded-xl transition-colors self-end h-[38px]">
            Create
          </button>
        </div>
      </div>

      {/* Right — FX / Look */}
      <div className="w-[234px] flex-shrink-0 border-l border-gray-100 overflow-auto p-3">
        <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 px-2 mb-1.5">Look</div>
        {LOOKS.map(l => (
          <div key={l} className="px-2.5 py-2 rounded-xl hover:bg-gray-50 cursor-pointer transition-colors">
            <div className="text-sm font-medium">{l}</div>
          </div>
        ))}
        <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 px-2 mb-1.5 mt-3">FX</div>
        {FX.map(f => (
          <div key={f} className="px-2.5 py-2 rounded-xl hover:bg-gray-50 cursor-pointer transition-colors">
            <div className="text-sm font-medium">{f}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
