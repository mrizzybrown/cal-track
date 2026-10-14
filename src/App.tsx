import { useEffect, useState } from 'react'
import { TabBar, type Tab } from './components/TabBar'
import { TodayScreen } from './screens/Today'
import { WeightScreen } from './screens/Weight'
import { HistoryScreen } from './screens/History'
import { SettingsScreen } from './screens/Settings'
import { requestPersistentStorage } from './db'

export function App() {
  const [tab, setTab] = useState<Tab>('today')

  useEffect(() => {
    requestPersistentStorage().catch(() => {})
  }, [])

  return (
    <div className="app">
      <main className="screen">
        {tab === 'today' && <TodayScreen />}
        {tab === 'weight' && <WeightScreen />}
        {tab === 'history' && <HistoryScreen />}
        {tab === 'settings' && <SettingsScreen />}
      </main>
      <TabBar active={tab} onChange={setTab} />
    </div>
  )
}
