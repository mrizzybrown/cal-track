import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

/**
 * A panel pinned near the top of the screen so the iOS keyboard never covers it.
 * Closes on backdrop tap or Escape and returns focus to whatever opened it. While open, the rest of
 * the app is inert, so taps and screen readers stay inside the sheet.
 */
export function Sheet({
  title,
  onClose,
  onBack,
  children,
}: {
  title: string
  onClose: () => void
  /** Shows a Back button instead of Cancel. */
  onBack?: () => void
  children: ReactNode
}) {
  const panel = useRef<HTMLDivElement>(null)
  const close = useRef(onClose)
  close.current = onClose

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close.current()
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    const app = document.getElementById('root')
    app?.setAttribute('inert', '')
    if (!panel.current?.contains(document.activeElement)) panel.current?.focus({ preventScroll: true })
    return () => {
      app?.removeAttribute('inert')
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
      opener?.focus?.()
    }
  }, [])

  return createPortal(
    <div className="sheet-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={panel} tabIndex={-1} className="sheet" role="dialog" aria-modal="true" aria-label={title}>
        <div className="sheet-header">
          <h2>{title}</h2>
          {onBack ? (
            <button type="button" className="text-button" onClick={onBack}>
              Back
            </button>
          ) : (
            <button type="button" className="text-button" onClick={onClose}>
              Cancel
            </button>
          )}
        </div>
        {children}
      </div>
    </div>,
    document.body,
  )
}
