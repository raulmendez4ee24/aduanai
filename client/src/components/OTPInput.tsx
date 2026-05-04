import { useRef, KeyboardEvent, ClipboardEvent } from 'react'

interface OTPInputProps {
  length?: number
  value: string
  onChange: (value: string) => void
  disabled?: boolean
}

export function OTPInput({ length = 6, value, onChange, disabled = false }: OTPInputProps) {
  const inputs = useRef<(HTMLInputElement | null)[]>([])

  const digits = value.padEnd(length, '').split('').slice(0, length)

  function handleChange(index: number, char: string) {
    const digit = char.replace(/\D/g, '').slice(-1)
    const newDigits = [...digits]
    newDigits[index] = digit
    onChange(newDigits.join('').trimEnd())
    if (digit && index < length - 1) {
      inputs.current[index + 1]?.focus()
    }
  }

  function handleKeyDown(index: number, e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace') {
      if (digits[index]) {
        const newDigits = [...digits]
        newDigits[index] = ''
        onChange(newDigits.join('').trimEnd())
      } else if (index > 0) {
        inputs.current[index - 1]?.focus()
        const newDigits = [...digits]
        newDigits[index - 1] = ''
        onChange(newDigits.join('').trimEnd())
      }
    } else if (e.key === 'ArrowLeft' && index > 0) {
      inputs.current[index - 1]?.focus()
    } else if (e.key === 'ArrowRight' && index < length - 1) {
      inputs.current[index + 1]?.focus()
    }
  }

  function handlePaste(e: ClipboardEvent<HTMLInputElement>) {
    e.preventDefault()
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, length)
    if (pasted) {
      onChange(pasted)
      const focusIndex = Math.min(pasted.length, length - 1)
      inputs.current[focusIndex]?.focus()
    }
  }

  return (
    <div className="flex gap-3 justify-center">
      {Array.from({ length }).map((_, i) => (
        <input
          key={i}
          ref={el => { inputs.current[i] = el }}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={digits[i] || ''}
          disabled={disabled}
          onChange={e => handleChange(i, e.target.value)}
          onKeyDown={e => handleKeyDown(i, e)}
          onPaste={handlePaste}
          onFocus={e => e.target.select()}
          className="w-14 h-14 text-center text-2xl font-mono font-semibold rounded-xl border-2 border-gray-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 outline-none transition-all text-[#1a1a1a] bg-white disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ fontFamily: "'Outfit', sans-serif" }}
        />
      ))}
    </div>
  )
}
