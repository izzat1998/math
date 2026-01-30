import { useState } from 'react'

interface MathKeyboardProps {
  onSymbol: (text: string) => void
}

const TABS = [
  {
    label: 'Asosiy',
    symbols: ['√', 'π', '−', '/', '±', '²', '³', '(', ')', ','],
  },
  {
    label: 'Funksiyalar',
    symbols: ['sin', 'cos', 'tan', 'cot', 'log', 'ln', 'arcsin', 'arccos', 'arctan', 'arccot'],
  },
  {
    label: 'Belgilar',
    symbols: ['∞', '°', '≤', '≥', '≠', '≈', 'α', 'β', 'γ', 'Δ'],
  },
] as const

export default function MathKeyboard({ onSymbol }: MathKeyboardProps) {
  const [activeTab, setActiveTab] = useState(0)

  const handleInsert = (e: React.MouseEvent | React.TouchEvent, text: string) => {
    e.preventDefault()
    onSymbol(text)
  }

  return (
    <div className="animate-keyboard-in overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm mt-2">
      {/* Tabs */}
      <div className="flex border-b border-slate-200">
        {TABS.map((tab, i) => (
          <button
            key={tab.label}
            onMouseDown={(e) => {
              e.preventDefault()
              setActiveTab(i)
            }}
            onTouchStart={(e) => {
              e.preventDefault()
              setActiveTab(i)
            }}
            className={`flex-1 py-1.5 text-xs font-medium transition-colors ${
              activeTab === i
                ? 'text-accent-600 border-b-2 border-accent-500 bg-accent-50'
                : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Symbol buttons */}
      <div className="flex flex-wrap gap-1 p-2">
        {TABS[activeTab].symbols.map((sym) => (
          <button
            key={sym}
            onMouseDown={(e) => handleInsert(e, sym)}
            onTouchStart={(e) => handleInsert(e, sym)}
            className="min-w-[2.25rem] h-8 px-2 rounded-md text-sm font-medium border border-slate-200 bg-slate-50 text-slate-700 hover:bg-accent-50 hover:border-accent-300 hover:text-accent-700 transition-colors select-none"
          >
            {sym}
          </button>
        ))}
      </div>
    </div>
  )
}
