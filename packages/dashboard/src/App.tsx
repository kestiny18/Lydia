import { useState } from 'react';
import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Bot, Briefcase, Database, Settings2 } from 'lucide-react';
import { TaskHome } from './components/TaskHome';
import { ChatWorkspace } from './components/ChatWorkspace';
import { MemoryWorkspace } from './components/MemoryWorkspace';
import { ControlWorkspace } from './components/ControlWorkspace';
import { api } from './lib/api';

type View = 'work' | 'chat' | 'memory' | 'control';

export default function App() {
  const [activeView, setActiveView] = useState<View>('work');

  const { data: status } = useQuery({
    queryKey: ['status'],
    queryFn: () => api.getStatus(),
  });

  const { data: setupStatus } = useQuery({
    queryKey: ['setup'],
    queryFn: () => fetch('/api/setup').then((res) => res.json()),
  });

  const navItems: Array<{ key: View; label: string; icon: ReactNode }> = [
    { key: 'work', label: 'Work', icon: <Briefcase size={16} /> },
    { key: 'chat', label: 'Chat', icon: <Bot size={16} /> },
    { key: 'memory', label: 'Memory', icon: <Database size={16} /> },
    { key: 'control', label: 'Control', icon: <Settings2 size={16} /> },
  ];

  return (
    <div className="app-shell h-screen">
      <aside className="w-56 border-r border-[color:var(--line)] bg-white/90 backdrop-blur-sm flex flex-col">
        <div className="px-4 py-4 border-b border-[color:var(--line)]">
          <div className="text-lg font-bold tracking-tight text-[color:var(--text-strong)]">Lydia</div>
          <div className="mt-1 text-[11px] flex items-center gap-1.5 text-[color:var(--success)]">
            <span className="h-1.5 w-1.5 rounded-full bg-[color:var(--success)] animate-pulse" />
            {status?.status === 'ok' ? 'System Online' : 'Connecting...'}
          </div>
          {setupStatus && !setupStatus.ready && (
            <div className="mt-3 rounded-md border border-[color:var(--warning-soft)] bg-[color:var(--warning-soft)]/40 px-2 py-1 text-[11px] text-[color:var(--warning)]">
              Setup incomplete. Run <code>lydia init</code>.
            </div>
          )}
        </div>

        <nav className="p-3 space-y-1">
          {navItems.map((item) => {
            const active = item.key === activeView;
            return (
              <button
                key={item.key}
                onClick={() => setActiveView(item.key)}
                className={`w-full rounded-xl px-3 py-2 text-sm flex items-center gap-2 transition-colors ${
                  active
                    ? 'bg-[color:var(--surface-accent)] text-[color:var(--accent)] border border-[color:var(--line-strong)] font-semibold'
                    : 'text-[color:var(--text-muted)] hover:bg-[color:var(--surface-subtle)]'
                }`}
              >
                {item.icon}
                {item.label}
              </button>
            );
          })}
        </nav>

        <div className="mt-auto px-4 py-3 border-t border-[color:var(--line)] text-[11px] text-[color:var(--text-muted)]">
          v{status?.version || '0.0.0'}
        </div>
      </aside>

      <main className="flex-1 min-w-0 overflow-hidden">
        <header className="h-14 px-6 border-b border-[color:var(--line)] bg-white/70 backdrop-blur-sm flex items-center justify-between">
          <div>
            <h1 className="text-sm uppercase tracking-[0.16em] text-[color:var(--text-muted)] font-semibold">
              {activeView}
            </h1>
          </div>
          <div className="text-xs text-[color:var(--text-muted)]">
            Personal assistant control plane
          </div>
        </header>

        <section className="h-[calc(100vh-56px)] overflow-hidden">
          {activeView === 'work' && <TaskHome />}
          {activeView === 'chat' && <ChatWorkspace />}
          {activeView === 'memory' && <MemoryWorkspace />}
          {activeView === 'control' && <ControlWorkspace />}
        </section>
      </main>
    </div>
  );
}
