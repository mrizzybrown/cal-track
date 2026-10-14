import { useEffect, useRef, useState } from 'react'

type CameraState = 'starting' | 'scanning' | 'denied' | 'unavailable'

/** Live camera barcode scanner, with a typed-in fallback. Calls onCode once with the first barcode read. */
export function BarcodeScanner({ onCode }: { onCode: (code: string) => void }) {
  const video = useRef<HTMLVideoElement>(null)
  const [camera, setCamera] = useState<CameraState>('starting')
  const [typed, setTyped] = useState('')
  const done = useRef(false)
  const onCodeRef = useRef(onCode)
  onCodeRef.current = onCode

  useEffect(() => {
    let stream: MediaStream | null = null
    let timer: ReturnType<typeof setTimeout> | undefined
    let stopped = false

    const finish = (code: string) => {
      if (done.current) return
      done.current = true
      navigator.vibrate?.(60)
      onCodeRef.current(code)
    }

    const start = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCamera('unavailable')
        return
      }
      try {
        const [{ createDetector }, media] = await Promise.all([
          import('../scan/detector'),
          navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false }),
        ])
        stream = media
        if (stopped || !video.current) return
        video.current.srcObject = media
        await video.current.play()
        setCamera('scanning')
        const detector = createDetector()
        const tick = async () => {
          if (stopped || done.current || !video.current) return
          try {
            const found = await detector.detect(video.current)
            const code = found.find((b) => /^\d{8,14}$/.test(b.rawValue))?.rawValue
            if (code) return finish(code)
          } catch {
            // A frame that can't be read yet (e.g. video still warming up); try the next one.
          }
          timer = setTimeout(tick, 150)
        }
        tick()
      } catch (e) {
        if (stopped) return
        setCamera(e instanceof DOMException && e.name === 'NotAllowedError' ? 'denied' : 'unavailable')
      }
    }
    start()

    return () => {
      stopped = true
      clearTimeout(timer)
      stream?.getTracks().forEach((t) => t.stop())
    }
  }, [])

  const digits = typed.replace(/\D/g, '')

  return (
    <div className="scanner">
      <div className="camera-box">
        <video ref={video} playsInline muted aria-label="Camera view" />
        {camera === 'scanning' && <div className="scan-guide" aria-hidden="true" />}
        {camera === 'starting' && <p className="camera-note">Starting camera…</p>}
        {camera === 'denied' && (
          <p className="camera-note">
            Camera access is off. Allow it in Settings › Safari › Camera, or type the barcode below.
          </p>
        )}
        {camera === 'unavailable' && <p className="camera-note">Camera not available. Type the barcode below.</p>}
      </div>
      {camera === 'scanning' && <p className="hint center">Hold the barcode inside the box.</p>}

      <form
        className="card form inset"
        onSubmit={(e) => {
          e.preventDefault()
          if (digits.length >= 8) {
            done.current = true
            onCode(digits)
          }
        }}
      >
        <div className="field">
          <label htmlFor="barcode-typed">Or type the barcode number</label>
          <input
            id="barcode-typed"
            inputMode="numeric"
            autoComplete="off"
            placeholder="e.g. 5000157024671"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
          />
        </div>
        <button type="submit" className="secondary-button" disabled={digits.length < 8}>
          Look up
        </button>
      </form>
    </div>
  )
}
