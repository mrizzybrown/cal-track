import { useRef, useState } from 'react'
import { saveSettings } from '../db'
import {
  backupCounts,
  backupFileName,
  checkBackup,
  clearAllData,
  exportBackup,
  restoreBackup,
  shareBackupFile,
  type Backup,
} from '../backup'
import { localDateKey } from '../units'

type Step =
  | { kind: 'idle'; note?: string; error?: string }
  | { kind: 'confirm-import'; backup: Backup }
  | { kind: 'confirm-clear' }

const longDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })

/** Export a backup file, restore one, or wipe everything. */
export function BackupSection({ lastBackupAt }: { lastBackupAt?: string }) {
  const [step, setStep] = useState<Step>({ kind: 'idle' })
  const [busy, setBusy] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  const doExport = async () => {
    setBusy(true)
    try {
      const backup = await exportBackup()
      const result = await shareBackupFile(JSON.stringify(backup), backupFileName(localDateKey()))
      if (result !== 'cancelled') {
        await saveSettings({ lastBackupAt: backup.exportedAt })
        setStep({ kind: 'idle', note: result === 'shared' ? 'Backup ready. Keep it somewhere safe, like Files › iCloud Drive.' : 'Backup downloaded.' })
      }
    } catch {
      setStep({ kind: 'idle', error: "Couldn't create the backup. Try again." })
    } finally {
      setBusy(false)
    }
  }

  const pickFile = async (file: File | undefined) => {
    if (!file) return
    try {
      const data: unknown = JSON.parse(await file.text())
      const error = checkBackup(data)
      setStep(error ? { kind: 'idle', error } : { kind: 'confirm-import', backup: data as Backup })
    } catch {
      setStep({ kind: 'idle', error: "This file isn't a Cal Track backup." })
    }
  }

  const doImport = async (backup: Backup) => {
    setBusy(true)
    try {
      await restoreBackup(backup)
      setStep({ kind: 'idle', note: `Restored the backup from ${longDate(backup.exportedAt)}.` })
    } catch {
      setStep({ kind: 'idle', error: "Couldn't restore that backup. Nothing was changed." })
    } finally {
      setBusy(false)
    }
  }

  const doClear = async () => {
    setBusy(true)
    await clearAllData()
    setBusy(false)
    setStep({ kind: 'idle', note: 'All data deleted.' })
  }

  return (
    <>
      <section className="card">
        <p>Backup</p>
        <p className="muted small">
          {lastBackupAt
            ? `Last backup: ${longDate(lastBackupAt)}.`
            : 'No backup yet. Export one now and then, so a lost or reset phone doesn’t lose your history.'}
        </p>
        <button type="button" className="primary-button" onClick={doExport} disabled={busy}>
          Export backup
        </button>
        <button type="button" className="secondary-button" onClick={() => fileInput.current?.click()} disabled={busy}>
          Import backup
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => {
            pickFile(e.target.files?.[0])
            e.target.value = ''
          }}
        />
        {step.kind === 'idle' && step.note && (
          <p className="muted small backup-note" role="status">
            {step.note}
          </p>
        )}
        {step.kind === 'idle' && step.error && (
          <p className="field-error backup-note" role="alert">
            {step.error}
          </p>
        )}
        {step.kind === 'confirm-import' && (
          <div className="confirm-box" role="alertdialog" aria-label="Restore backup">
            <p>
              Replace everything on this phone with the backup from {longDate(step.backup.exportedAt)}?
            </p>
            <p className="muted small">
              It has {backupCounts(step.backup).entries} logged items, {backupCounts(step.backup).weights} weigh-ins and{' '}
              {backupCounts(step.backup).savedMeals} saved meals. What's on this phone now will be lost.
            </p>
            <button type="button" className="danger-button" onClick={() => doImport(step.backup)} disabled={busy}>
              Replace with backup
            </button>
            <button type="button" className="secondary-button" onClick={() => setStep({ kind: 'idle' })}>
              Cancel
            </button>
          </div>
        )}
      </section>

      <section className="card">
        {step.kind === 'confirm-clear' ? (
          <div role="alertdialog" aria-label="Delete all data">
            <p>Delete all your logs, foods, meals, weigh-ins and settings?</p>
            <p className="muted small">This can’t be undone. Export a backup first if you might want them.</p>
            <button type="button" className="danger-button" onClick={doClear} disabled={busy}>
              Delete everything
            </button>
            <button type="button" className="secondary-button" onClick={() => setStep({ kind: 'idle' })}>
              Cancel
            </button>
          </div>
        ) : (
          <button type="button" className="link-button danger-link" onClick={() => setStep({ kind: 'confirm-clear' })}>
            Delete all data…
          </button>
        )}
      </section>
    </>
  )
}
