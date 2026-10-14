import type { ReactNode } from 'react'

export type Tab = 'today' | 'weight' | 'lifts' | 'history' | 'settings'

const TABS: { id: Tab; label: string; icon: ReactNode }[] = [
  {
    id: 'today',
    label: 'Today',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="8.5" />
        <path d="M12 7.5V12l3 2" />
      </svg>
    ),
  },
  {
    id: 'weight',
    label: 'Weight',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="3.5" y="4.5" width="17" height="15" rx="3" />
        <path d="M9 9.5a4 4 0 0 1 6 0M12 9.5l1.5-1.5" />
      </svg>
    ),
  },
  {
    id: 'lifts',
    label: 'Lifts',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M7 12h10M4.5 8.5v7M7 6.5v11M17 6.5v11M19.5 8.5v7M2.5 12h2M19.5 12h2" />
      </svg>
    ),
  },
  {
    id: 'history',
    label: 'History',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5 19.5V13M10 19.5V8M15 19.5v-9M20 19.5V5" />
      </svg>
    ),
  },
  {
    id: 'settings',
    label: 'Settings',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 7h10M18 7h2M4 17h2M10 17h10" />
        <circle cx="16" cy="7" r="2" />
        <circle cx="8" cy="17" r="2" />
      </svg>
    ),
  },
]

export function TabBar({ active, onChange }: { active: Tab; onChange: (t: Tab) => void }) {
  return (
    <nav className="tabbar" aria-label="Main">
      {TABS.map((t) => (
        <button
          key={t.id}
          type="button"
          className={t.id === active ? 'tab active' : 'tab'}
          aria-current={t.id === active ? 'page' : undefined}
          onClick={() => onChange(t.id)}
        >
          {t.icon}
          <span>{t.label}</span>
        </button>
      ))}
    </nav>
  )
}
