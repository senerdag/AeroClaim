import { useState } from 'react'
import { Sidebar } from './components/Sidebar'
import { ChatArea } from './components/ChatArea'
import { History } from './components/History'

export type View = 'chat' | 'history'

function App() {
  const [view, setView] = useState<View>('chat')

  return (
    <div className="flex h-screen w-full overflow-hidden">
      <Sidebar currentView={view} onNavigate={setView} />
      <main className="flex-1 flex flex-col overflow-hidden">
        {view === 'chat' && <ChatArea />}
        {view === 'history' && <History />}
      </main>
    </div>
  )
}

export default App
