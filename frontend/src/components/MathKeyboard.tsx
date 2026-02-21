import { useCallback, useState } from 'react'

interface MathKeyboardProps {
  onSymbol: (text: string) => void
  onBackspace: () => void
  onCursorMove: (direction: 'left' | 'right') => void
  onEnter: () => void
}

type KeyDef = {
  label: string
  insert: string
  wide?: boolean
  ariaLabel?: string
} | {
  label: string
  action: 'backspace' | 'left' | 'right' | 'enter'
  wide?: boolean
  variant?: 'nav' | 'delete'
  ariaLabel?: string
}

// ── Tab: Numbers & basics (default) ──
const TAB_123_ROWS: KeyDef[][] = [
  [
    { label: '1', insert: '1' },
    { label: '2', insert: '2' },
    { label: '3', insert: '3' },
    { label: '4', insert: '4' },
    { label: '5', insert: '5' },
    { label: '6', insert: '6' },
    { label: '7', insert: '7' },
    { label: '8', insert: '8' },
    { label: '9', insert: '9' },
    { label: '0', insert: '0' },
  ],
  [
    { label: 'x', insert: 'x' },
    { label: 'y', insert: 'y' },
    { label: 'a', insert: 'a' },
    { label: 'b', insert: 'b' },
    { label: 'π', insert: 'π' },
    { label: '.', insert: '.' },
    { label: '+', insert: '+' },
    { label: '−', insert: '−' },
    { label: '(', insert: '(' },
    { label: ')', insert: ')' },
  ],
  [
    { label: '‹', action: 'left', variant: 'nav', ariaLabel: 'Kursorni chapga' },
    { label: '›', action: 'right', variant: 'nav', ariaLabel: "Kursorni o'ngga" },
    { label: '↵', action: 'enter', variant: 'nav', ariaLabel: 'Keyingi maydon' },
    { label: '⌫', action: 'backspace', variant: 'delete', ariaLabel: "O'chirish" },
  ],
]

// ── Tab: Functions (trig, log, arc) ──
const TAB_FX_ROWS: KeyDef[][] = [
  [
    { label: 'sin', insert: 'sin(' },
    { label: 'cos', insert: 'cos(' },
    { label: 'tan', insert: 'tan(' },
    { label: 'cot', insert: 'cot(' },
  ],
  [
    { label: 'arcsin', insert: 'arcsin(' },
    { label: 'arccos', insert: 'arccos(' },
    { label: 'arctan', insert: 'arctan(' },
    { label: 'arcctg', insert: 'arcctg(' },
  ],
  [
    { label: 'ln', insert: 'ln(' },
    { label: 'log', insert: 'log(' },
    { label: 'log₍₎', insert: 'log_' },
    { label: 'exp', insert: 'exp(' },
    { label: 'e', insert: 'e' },
  ],
  [
    { label: '‹', action: 'left', variant: 'nav', ariaLabel: 'Kursorni chapga' },
    { label: '›', action: 'right', variant: 'nav', ariaLabel: "Kursorni o'ngga" },
    { label: '↵', action: 'enter', variant: 'nav', ariaLabel: 'Keyingi maydon' },
    { label: '⌫', action: 'backspace', variant: 'delete', ariaLabel: "O'chirish" },
  ],
]

// ── Tab: Structures (powers, roots, fractions) ──
const TAB_STRUCT_ROWS: KeyDef[][] = [
  [
    { label: '⬚/⬚', insert: '/' },
    { label: '√⬚', insert: '√(' },
    { label: '³√⬚', insert: '³√(' },
    { label: 'ⁿ√⬚', insert: 'ⁿ√(' },
  ],
  [
    { label: '⬚^⬚', insert: '^' },
    { label: '⬚²', insert: '²' },
    { label: '⬚³', insert: '³' },
    { label: 'c', insert: 'c' },
    { label: 'z', insert: 'z' },
  ],
  [
    { label: '‹', action: 'left', variant: 'nav', ariaLabel: 'Kursorni chapga' },
    { label: '›', action: 'right', variant: 'nav', ariaLabel: "Kursorni o'ngga" },
    { label: '↵', action: 'enter', variant: 'nav', ariaLabel: 'Keyingi maydon' },
    { label: '⌫', action: 'backspace', variant: 'delete', ariaLabel: "O'chirish" },
  ],
]

type TabKey = '123' | 'f(x)' | '√^'
const TABS: { key: TabKey; label: string; rows: KeyDef[][] }[] = [
  { key: '123', label: '123', rows: TAB_123_ROWS },
  { key: 'f(x)', label: 'f(x)', rows: TAB_FX_ROWS },
  { key: '√^', label: '√ ^', rows: TAB_STRUCT_ROWS },
]

function KeyButton({
  keyDef,
  onPress,
}: {
  keyDef: KeyDef
  onPress: (key: KeyDef) => void
}) {
  const handle = (e: React.PointerEvent) => {
    e.preventDefault()
    onPress(keyDef)
  }

  const isNav = 'variant' in keyDef && keyDef.variant === 'nav'
  const isDel = 'variant' in keyDef && keyDef.variant === 'delete'

  return (
    <button
      onPointerDown={handle}
      aria-label={keyDef.ariaLabel || keyDef.label}
      className={`
        flex items-center justify-center rounded-lg text-center select-none
        transition-colors active:scale-95 active:brightness-95
        ${isDel
          ? 'bg-slate-300 text-slate-700 h-10'
          : isNav
            ? 'bg-slate-200 text-slate-600 h-10'
            : 'bg-white text-slate-800 shadow-[0_1px_2px_rgba(0,0,0,0.08)] border border-slate-200/80 h-10'
        }
      `}
      style={{ minWidth: 0 }}
    >
      <span className={`
        ${isDel || isNav ? 'text-[18px] font-bold' : ''}
        ${'insert' in keyDef && keyDef.insert.length <= 1 ? 'text-[16px] font-medium' : 'text-[13px] font-semibold'}
      `}>
        {keyDef.label}
      </span>
    </button>
  )
}

export default function MathKeyboard({ onSymbol, onBackspace, onCursorMove, onEnter }: MathKeyboardProps) {
  const [activeTab, setActiveTab] = useState<TabKey>('123')

  const handleKey = useCallback((key: KeyDef) => {
    if ('action' in key) {
      switch (key.action) {
        case 'backspace': onBackspace(); break
        case 'left': onCursorMove('left'); break
        case 'right': onCursorMove('right'); break
        case 'enter': onEnter(); break
      }
    } else {
      onSymbol(key.insert)
    }
  }, [onSymbol, onBackspace, onCursorMove, onEnter])

  const currentTab = TABS.find(t => t.key === activeTab)!

  return (
    <div className="animate-keyboard-in rounded-2xl bg-slate-100 p-1.5 mt-2 space-y-1">
      {/* Tab bar */}
      <div className="flex gap-1 mb-0.5">
        {TABS.map(tab => (
          <button
            key={tab.key}
            onPointerDown={(e) => { e.preventDefault(); setActiveTab(tab.key) }}
            className={`flex-1 py-1.5 rounded-lg text-[12px] font-bold transition-colors ${
              activeTab === tab.key
                ? 'bg-primary-500 text-white'
                : 'bg-slate-200 text-slate-500'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Key rows */}
      {currentTab.rows.map((row, ri) => (
        <div
          key={ri}
          className="grid gap-1"
          style={{
            gridTemplateColumns: `repeat(${row.length}, 1fr)`,
          }}
        >
          {row.map((key, ki) => (
            <KeyButton key={ki} keyDef={key} onPress={handleKey} />
          ))}
        </div>
      ))}
    </div>
  )
}
