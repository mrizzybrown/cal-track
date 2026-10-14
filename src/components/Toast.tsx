import { useEffect } from 'react'

export interface ToastState {
  message: string
  undo?: () => void
}

/** A short confirmation above the tab bar, with an optional Undo. Hides itself after 5 seconds. */
export function Toast({ toast, onDone }: { toast: ToastState; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 5000)
    return () => clearTimeout(t)
  }, [toast, onDone])

  return (
    <div className="toast" role="status">
      <span>{toast.message}</span>
      {toast.undo && (
        <button
          type="button"
          className="toast-undo"
          onClick={() => {
            toast.undo?.()
            onDone()
          }}
        >
          Undo
        </button>
      )}
    </div>
  )
}
