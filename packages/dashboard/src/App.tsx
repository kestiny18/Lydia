import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Bot,
  Briefcase,
  Database,
  Gauge,
  Menu,
  Settings2,
  Sparkles,
  Wrench,
} from 'lucide-react';
import { TaskHome } from './components/TaskHome';
import { ChatWorkspace } from './components/ChatWorkspace';
import { MemoryWorkspace } from './components/MemoryWorkspace';
import { ControlWorkspace } from './components/ControlWorkspace';
import { SetupWorkspace } from './components/SetupWorkspace';
import { api } from './lib/api';

type View = 'tasks' | 'chat' | 'memory' | 'control' | 'setup';

interface ChatSeed {
  text: string;
  token: number;
}

interface NavItem {
  key: View;
  label: string;
  icon: ReactNode;
  group: 'chat' | 'workspace' | 'system';
  disabledWhenUnready?: boolean;
}

export default function App() {
  const [activeView, setActiveView] = useState<View>('chat');
  const [chatSeed, setChatSeed] = useState<ChatSeed | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const { data: status } = useQuery({
    queryKey: ['status'],
    queryFn: () => api.getStatus(),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  const { data: setupStatus } = useQuery({
    queryKey: ['setup'],
    queryFn: () => api.getSetupStatus(),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  const setupReady = Boolean(setupStatus?.ready);

  const navItems: NavItem[] = [
    { key: 'chat', label: 'Chat', icon: <Bot size={16} />, group: 'chat' },
    { key: 'tasks', label: 'Tasks', icon: <Briefcase size={16} />, group: 'workspace', disabledWhenUnready: true },
    { key: 'memory', label: 'Memory', icon: <Database size={16} />, group: 'workspace' },
    { key: 'control', label: 'Control', icon: <Settings2 size={16} />, group: 'system' },
    { key: 'setup', label: 'Setup', icon: <Wrench size={16} />, group: 'system' },
  ];

  const groupedNav = useMemo(() => ([
    { id: 'chat', title: 'Chat', items: navItems.filter((item) => item.group === 'chat') },
    { id: 'workspace', title: 'Workspace', items: navItems.filter((item) => item.group === 'workspace') },
    { id: 'system', title: 'System', items: navItems.filter((item) => item.group === 'system') },
  ]), [navItems]);

  const viewTitle = useMemo(() => {
    if (activeView === 'tasks') return 'Tracked execution, history, and resuming.';
    if (activeView === 'chat') return 'Fast conversational control with persistent context.';
    if (activeView === 'memory') return 'Inspect facts, episodes, and reports.';
    if (activeView === 'control') return 'Govern strategy, health, and runtime behavior.';
    return 'Bootstrap runtime, providers, and local workspace.';
  }, [activeView]);

  const openChatFromTask = (seedText: string) => {
    setChatSeed({ text: seedText, token: Date.now() });
    setActiveView('chat');
  };

  const renderView = () => {
    if (activeView === 'tasks') return <TaskHome onContinueInChat={openChatFromTask} />;
    if (activeView === 'memory') return <MemoryWorkspace />;
    if (activeView === 'control') return <ControlWorkspace />;
    if (activeView === 'setup') return <SetupWorkspace onSetupCompleted={() => setActiveView('chat')} />;
    return <ChatWorkspace seedMessage={chatSeed?.text} seedToken={chatSeed?.token} />;
  };

  return (
    <div className="app-shell">
      <aside className={`${sidebarCollapsed ? 'w-[76px]' : 'w-[232px]'} border-r border-[color:var(--line)] bg-white/96 flex flex-col shrink-0 transition-[width] duration-200`}>
        <div className={`h-14 border-b border-[color:var(--line)] flex items-center gap-3 ${sidebarCollapsed ? 'px-3 justify-center' : 'px-5'}`}>
          <button
            type="button"
            onClick={() => setSidebarCollapsed((prev) => !prev)}
            className="h-8 w-8 rounded-lg border border-[color:var(--line)] text-[color:var(--text-muted)] grid place-items-center"
          >
            <Menu size={15} />
          </button>
          {!sidebarCollapsed && (
            <div className="min-w-0">
              <div className="text-[17px] font-extrabold tracking-tight text-[color:var(--text-strong)]">Lydia</div>
              <div className="text-[10px] uppercase tracking-[0.22em] text-[color:var(--text-muted)]">Gateway Dashboard</div>
            </div>
          )}
        </div>

        <div className={`${sidebarCollapsed ? 'px-3 py-4' : 'px-5 py-4'} border-b border-[color:var(--line)]`}>
          <div className={`flex items-center gap-2 text-sm text-[color:var(--success)] ${sidebarCollapsed ? 'justify-center' : ''}`}>
            <span className="h-2 w-2 rounded-full bg-[color:var(--success)]" />
            {!sidebarCollapsed && <span>{status?.status === 'ok' ? 'System Online' : 'Connecting...'}</span>}
          </div>
          {!sidebarCollapsed && !setupReady && (
            <div className="mt-3 rounded-2xl border border-[color:var(--warning-soft)] bg-[color:var(--warning-soft)] px-3 py-2 text-[11px] leading-5 text-[color:var(--warning)]">
              Setup is incomplete. Chat is available now; tasks remain gated until the workspace is initialized.
            </div>
          )}
        </div>

        <nav className={`flex-1 overflow-y-auto py-5 space-y-6 ${sidebarCollapsed ? 'px-2' : 'px-4'}`}>
          {groupedNav.map((section) => (
            <div key={section.id}>
              {!sidebarCollapsed && (
                <div className="mb-2 px-2 text-[11px] uppercase tracking-[0.18em] text-[color:var(--text-muted)]">
                  {section.title}
                </div>
              )}
              <div className="space-y-1.5">
                {section.items.map((item) => {
                  const disabled = Boolean(item.disabledWhenUnready && !setupReady);
                  const active = item.key === activeView;
                  return (
                    <button
                      key={item.key}
                      onClick={() => !disabled && setActiveView(item.key)}
                      disabled={disabled}
                      className={`w-full rounded-2xl py-3 text-sm flex items-center transition-colors ${
                        active
                          ? 'bg-[#fff1f1] text-[#b3261e] border border-[#f5caca] shadow-[0_8px_20px_rgba(179,38,30,0.08)]'
                          : disabled
                            ? 'text-gray-300 cursor-not-allowed'
                            : 'text-[color:var(--text-muted)] hover:bg-[color:var(--surface-subtle)]'
                      } ${sidebarCollapsed ? 'justify-center px-0' : 'gap-3 px-3'}`}
                      title={disabled ? 'Complete setup first' : undefined}
                    >
                      <span className="shrink-0">{item.icon}</span>
                      {!sidebarCollapsed && <span className="flex-1 text-left">{item.label}</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className={`${sidebarCollapsed ? 'px-2' : 'px-4'} py-4 border-t border-[color:var(--line)]`}>
          <div className={`rounded-2xl border border-[color:var(--line)] bg-[color:var(--surface-subtle)] py-3 ${sidebarCollapsed ? 'px-0' : 'px-3'}`}>
            <div className={`flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-[color:var(--text-muted)] ${sidebarCollapsed ? 'justify-center' : ''}`}>
              <Sparkles size={12} />
              {!sidebarCollapsed && 'Runtime'}
            </div>
            {!sidebarCollapsed && <div className="mt-2 text-sm text-[color:var(--text-strong)]">v{status?.version || '0.0.0'}</div>}
          </div>
        </div>
      </aside>

      <main className="flex-1 min-w-0 overflow-hidden bg-[linear-gradient(180deg,#ffffff_0%,#fbfcff_100%)]">
        <header className="h-14 px-7 border-b border-[color:var(--line)] bg-white/92 flex items-center justify-between shrink-0">
          <div>
            <div className="text-[11px] uppercase tracking-[0.22em] text-[color:var(--text-muted)]">
              {activeView}
            </div>
            <div className="text-sm text-[color:var(--text-strong)] mt-0.5">{viewTitle}</div>
          </div>

          <div className="flex items-center gap-3 text-xs">
            <div className="inline-flex items-center gap-2 rounded-full border border-[color:var(--line)] bg-white px-3 py-2 text-[color:var(--text-muted)]">
              <Gauge size={12} />
              <span>Version {status?.version || '0.0.0'}</span>
            </div>
            <div className="inline-flex items-center gap-2 rounded-full border border-[color:var(--line)] bg-white px-3 py-2 text-[color:var(--success)]">
              <span className="h-2 w-2 rounded-full bg-[color:var(--success)]" />
              <span>{status?.status === 'ok' ? 'Health OK' : 'Health Pending'}</span>
            </div>
          </div>
        </header>

        <section className="h-[calc(100vh-56px)] overflow-hidden">
          {renderView()}
        </section>
      </main>
    </div>
  );
}
