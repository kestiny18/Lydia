import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ClipboardList, Settings } from 'lucide-react';
import { TaskHome } from './components/TaskHome';
import { SettingsLayout } from './components/SettingsLayout';

type View = 'tasks' | 'settings';

function App() {
  const [activeView, setActiveView] = useState<View>('tasks');

  const { data: status } = useQuery({
    queryKey: ['status'],
    queryFn: () => fetch('/api/status').then(res => res.json())
  });

  const { data: setupStatus } = useQuery({
    queryKey: ['setup'],
    queryFn: () => fetch('/api/setup').then(res => res.json())
  });

  return (
    <div className="flex h-screen bg-gray-50 text-gray-900 font-sans">
      {/* Sidebar */}
      <aside className="w-56 bg-white border-r border-gray-200 flex flex-col shrink-0">
        {/* Logo */}
        <div className="p-5 border-b border-gray-100">
          <h1 className="text-lg font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-purple-600">
            Lydia
          </h1>
          <div className="mt-1.5 text-[11px] text-green-600 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
            {status?.status === 'ok' ? 'Online' : 'Connecting...'}
          </div>
          {setupStatus && !setupStatus.ready && (
            <div className="mt-2 text-[11px] text-yellow-700 bg-yellow-50 border border-yellow-200 rounded px-2 py-1">
              Run <code>lydia init</code> first
            </div>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-3 space-y-1">
          {/* Tasks - Primary */}
          <button
            onClick={() => setActiveView('tasks')}
            className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
              activeView === 'tasks'
                ? 'bg-blue-50 text-blue-700 border border-blue-200'
                : 'text-gray-700 hover:bg-gray-50'
            }`}
          >
            <ClipboardList size={18} />
            Tasks
          </button>

          {/* Divider */}
          <div className="pt-3 pb-1">
            <div className="border-t border-gray-100" />
          </div>

          {/* Settings */}
          <button
            onClick={() => setActiveView('settings')}
            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
              activeView === 'settings'
                ? 'bg-gray-100 text-gray-900 font-medium'
                : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700'
            }`}
          >
            <Settings size={18} />
            Settings & Extensions
          </button>
        </nav>

        {/* Footer */}
        <div className="p-4 border-t border-gray-100 text-[11px] text-gray-400">
          v{status?.version || '0.0.0'}
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-hidden">
        {activeView === 'tasks' && <TaskHome />}
        {activeView === 'settings' && <SettingsLayout />}
      </main>
    </div>
  );
}

export default App;
