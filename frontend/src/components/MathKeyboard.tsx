import { useCallback } from 'react'

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

const ROW_NUMBERS: KeyDef[] = [
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
]

const ROW_VARS: KeyDef[] = [
  { label: 'π', insert: 'π' },
  { label: 'e', insert: 'e' },
  { label: 'a', insert: 'a' },
  { label: 'b', insert: 'b' },
  { label: 'c', insert: 'c' },
  { label: 'x', insert: 'x' },
  { label: 'y', insert: 'y' },
  { label: 'z', insert: 'z' },
  { label: '.', insert: '.' },
]

const ROW_STRUCTURES: KeyDef[] = [
  { label: '(', insert: '(' },
  { label: ')', insert: ')' },
  { label: '⬚/⬚', insert: '/' },
  { label: '√⬚', insert: '√(' },
  { label: '⬚^⬚', insert: '^' },
  { label: '⬚²', insert: '²' },
  { label: '⬚³', insert: '³' },
  { label: '³√⬚', insert: '³√(' },
  { label: 'ⁿ√⬚', insert: 'ⁿ√(' },
]

const ROW_OPS_TRIG: KeyDef[] = [
  { label: '+', insert: '+' },
  { label: '−', insert: '−' },
  { label: 'sin', insert: 'sin(' },
  { label: 'cos', insert: 'cos(' },
  { label: 'tan', insert: 'tan(' },
  { label: 'cot', insert: 'cot(' },
]

const ROW_ARC: KeyDef[] = [
  { label: 'arcsin', insert: 'arcsin(' },
  { label: 'arccos', insert: 'arccos(' },
  { label: 'arctan', insert: 'arctan(' },
  { label: 'arcctg', insert: 'arcctg(' },
]

const ROW_LOGS: KeyDef[] = [
  { label: 'ln', insert: 'ln(' },
  { label: 'log', insert: 'log(' },
  { label: 'log₍₎', insert: 'log_' },
  { label: 'exp', insert: 'exp(' },
]

const ROW_NAV: KeyDef[] = [
  { label: '‹', action: 'left', variant: 'nav', ariaLabel: 'Kursorni chapga' },
  { label: '›', action: 'right', variant: 'nav', ariaLabel: "Kursorni o'ngga" },
  { label: '↵', action: 'enter', variant: 'nav', ariaLabel: 'Keyingi maydon' },
  { label: '⌫', action: 'backspace', variant: 'delete', ariaLabel: "O'chirish" },
]

const ROWS = [ROW_NUMBERS, ROW_VARS, ROW_STRUCTURES, ROW_OPS_TRIG, ROW_ARC, ROW_LOGS, ROW_NAV]

function KeyButton({
  keyDef,
  onPress,
}: {
  keyDef: KeyDef
  onPress: (key: KeyDef) => void
}) {
  const handle = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault()
    onPress(keyDef)
  }

  const isNav = 'variant' in keyDef && keyDef.variant === 'nav'
  const isDel = 'variant' in keyDef && keyDef.variant === 'delete'

  return (
    <button
      onMouseDown={handle}
      onTouchStart={handle}
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

  return (
    <div className="animate-keyboard-in rounded-2xl bg-slate-100 p-1.5 mt-2 space-y-1">
      {ROWS.map((row, ri) => (
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
