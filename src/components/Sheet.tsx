import { useEffect, useRef, type ReactNode } from 'react'

/**
 * A panel pinned near the top of the screen so the iOS keyboard never covers it.
 * Closes on backdrop tap or Escape and returns focus to whatever opened it.
 */
export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const close = useRef(onClose)
  close.current = onClose

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close.current()
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
      opener?.focus?.()
    }
  }, [])

  return (
    <div className="sheet-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title}>
        <div className="sheet-header">
          <h2>{title}</h2>
          <button type="button" className="text-button" onClick={onClose}>
            Cancel
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
