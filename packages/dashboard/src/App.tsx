import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Database, History, Activity, Terminal, ShieldCheck } from 'lucide-react';
import { StrategyReview } from './components/StrategyReview';

function App() {
  const [activeTab, setActiveTab] = useState<'overview' | 'memory' | 'approvals' | 'replay' | 'strategy'>('overview');

  const { data: status } = useQuery({
    queryKey: ['status'],
    queryFn: () => fetch('/api/status').then(res => res.json())
  });

  const { data: setupStatus } = useQuery({
    queryKey: ['setup'],
    queryFn: () => fetch('/api/setup').then(res => res.json())
  });

  return (
    <div className="flex h-screen bg-gray-100 text-gray-900 font-sans">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-gray-200 flex flex-col">
        <div className="p-6 border-b border-gray-100">
          <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-purple-600">
            Lydia <span className="text-gray-400 font-normal text-sm">Dashboard</span>
          </h1>
          <div className="mt-2 text-xs text-green-600 flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
            {status?.status === 'ok' ? 'System Online' : 'Connecting...'}
          </div>
          {setupStatus && !setupStatus.ready && (
            <div className="mt-2 text-xs text-yellow-700 bg-yellow-50 border border-yellow-200 rounded px-2 py-1">
              Setup incomplete: run `lydia init`
            </div>
          )}
        </div>

        <nav className="flex-1 p-4 space-y-1">
          <NavItem
            icon={<Activity size={18} />}
            label="Overview"
            active={activeTab === 'overview'}
            onClick={() => setActiveTab('overview')}
          />
          <NavItem
            icon={<Database size={18} />}
            label="Memory Bank"
            active={activeTab === 'memory'}
            onClick={() => setActiveTab('memory')}
          />
          <NavItem
            icon={<History size={18} />}
            label="Replay Studio"
            active={activeTab === 'replay'}
            onClick={() => setActiveTab('replay')}
          />
          <NavItem
            icon={<ShieldCheck size={18} />}
            label="Approvals"
            active={activeTab === 'approvals'}
            onClick={() => setActiveTab('approvals')}
          />
          <NavItem
            icon={<Database size={18} />}
            label="Strategy"
            active={activeTab === 'strategy'}
            onClick={() => setActiveTab('strategy')}
          />
        </nav>

        <div className="p-4 border-t border-gray-100 text-xs text-gray-400">
          v{status?.version || '0.0.0'}
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto p-8">
        {activeTab === 'overview' && <OverviewView status={status} />}
        {activeTab === 'memory' && <MemoryView />}
        {activeTab === 'approvals' && <ApprovalsView />}
        {activeTab === 'replay' && <ReplayView />}
        {activeTab === 'strategy' && <StrategyReview />}
      </main>
    </div>
  );
}

function NavItem({ icon, label, active, onClick }: any) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${active
        ? 'bg-blue-50 text-blue-700'
        : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
        }`}
    >
      {icon}
      {label}
    </button>
  );
}

function OverviewView({ status }: any) {
  return (
    <div className="max-w-4xl mx-auto">
      <h2 className="text-2xl font-bold mb-6">System Overview</h2>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <StatCard title="Memory DB" value="Connected" icon={<Database className="text-blue-500" />} />
        <StatCard title="Agent Status" value="Idle" icon={<Terminal className="text-green-500" />} />
        <StatCard title="Uptime" value="Since 10:00 AM" icon={<Activity className="text-purple-500" />} />
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="text-lg font-semibold mb-4">Configuration</h3>
        <pre className="bg-gray-50 p-4 rounded text-sm overflow-x-auto">
          {JSON.stringify(status, null, 2)}
        </pre>
      </div>
    </div>
  );
}

function StatCard({ title, value, icon }: any) {
  return (
    <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm flex items-center justify-between">
      <div>
        <div className="text-sm text-gray-500 mb-1">{title}</div>
        <div className="text-2xl font-bold">{value}</div>
      </div>
      <div className="p-3 bg-gray-50 rounded-full">{icon}</div>
    </div>
  );
}

function MemoryView() {
  const { data: facts } = useQuery({
    queryKey: ['facts'],
    queryFn: () => fetch('/api/memory/facts').then(res => res.json())
  });

  return (
    <div className="max-w-4xl mx-auto">
      <h2 className="text-2xl font-bold mb-6">Memory Bank</h2>

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-gray-50 border-b border-gray-200 text-xs uppercase text-gray-500 font-medium">
            <tr>
              <th className="px-6 py-3">Content</th>
              <th className="px-6 py-3 w-32">Tags</th>
              <th className="px-6 py-3 w-40">Created</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {facts?.map((fact: any) => (
              <tr key={fact.id} className="hover:bg-gray-50">
                <td className="px-6 py-4">{fact.content}</td>
                <td className="px-6 py-4">
                  <div className="flex gap-1 flex-wrap">
                    {fact.tags?.map((tag: string) => (
                      <span key={tag} className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full text-xs">
                        {tag}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="px-6 py-4 text-sm text-gray-500">
                  {new Date(fact.created_at).toLocaleDateString()}
                </td>
              </tr>
            ))}
            {!facts?.length && (
              <tr>
                <td colSpan={3} className="px-6 py-8 text-center text-gray-500">
                  No memories found yet. Teach Lydia something!
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ReplayView() {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [expandedStep, setExpandedStep] = useState<number | null>(null);

  const { data: episodes } = useQuery({
    queryKey: ['episodes'],
    queryFn: () => fetch('/api/replay?limit=50').then(res => res.json())
  });

  const { data: episodeDetail } = useQuery({
    queryKey: ['episode', selectedId],
    queryFn: () => fetch(`/api/replay/${selectedId}`).then(res => res.json()),
    enabled: selectedId !== null
  });

  const formatArgs = (args: any) => {
    if (!args) return '—';
    try {
      return JSON.stringify(args, null, 2);
    } catch {
      return String(args);
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      <h2 className="text-2xl font-bold mb-6">Replay Studio</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 font-semibold">Episodes</div>
          <ul className="divide-y divide-gray-100">
            {episodes?.map((e: any) => (
              <li key={e.id}>
                <button
                  onClick={() => setSelectedId(e.id)}
                  className={`w-full text-left px-6 py-4 hover:bg-gray-50 ${selectedId === e.id ? 'bg-blue-50' : ''
                    }`}
                >
                  <div className="text-sm font-medium">{e.input}</div>
                  <div className="text-xs text-gray-500">
                    #{e.id} · {new Date(e.created_at).toLocaleString()}
                  </div>
                </button>
              </li>
            ))}
            {!episodes?.length && (
              <li className="px-6 py-6 text-center text-gray-500">No episodes yet.</li>
            )}
          </ul>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="font-semibold mb-3">Details</div>
          {!episodeDetail && (
            <div className="text-gray-500 text-sm">Select an episode to view traces.</div>
          )}
          {episodeDetail?.episode && (
            <div className="space-y-4">
              <div>
                <div className="text-xs text-gray-500">Input</div>
                <div className="text-sm font-medium">{episodeDetail.episode.input}</div>
              </div>
              <div>
                <div className="text-xs text-gray-500">Result</div>
                <div className="text-sm">{episodeDetail.episode.result || '—'}</div>
              </div>
              {(episodeDetail.episode.strategy_id || episodeDetail.episode.strategy_version) && (
                <div>
                  <div className="text-xs text-gray-500">Strategy</div>
                  <div className="text-sm">
                    {episodeDetail.episode.strategy_id || 'unknown'} v{episodeDetail.episode.strategy_version || '0'}
                  </div>
                </div>
              )}
              <div>
                <div className="text-xs text-gray-500">Traces</div>
                <div className="text-xs text-gray-400">
                  {episodeDetail.traces?.length || 0} step(s)
                </div>
              </div>
              {episodeDetail.summary && (
                <div className="flex gap-2 text-xs">
                  <span className="px-2 py-1 rounded bg-green-100 text-green-700">
                    success: {episodeDetail.summary.success}
                  </span>
                  <span className="px-2 py-1 rounded bg-red-100 text-red-700">
                    failed: {episodeDetail.summary.failed}
                  </span>
                  {episodeDetail.summary.failed > 0 && (
                    <span className="px-2 py-1 rounded bg-yellow-100 text-yellow-700">
                      drift suspected
                    </span>
                  )}
                </div>
              )}
              <div className="space-y-3">
                {(episodeDetail.traces || []).map((t: any, index: number) => (
                  <div key={t.id || index} className="border border-gray-100 rounded-lg p-3 text-xs">
                    <div className="flex items-center justify-between">
                      <div className="font-semibold">Step {t.step_index + 1}</div>
                      <div className={`px-2 py-0.5 rounded-full text-[10px] ${t.status === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                        }`}>
                        {t.status}
                      </div>
                    </div>
                    <button
                      onClick={() => setExpandedStep(expandedStep === index ? null : index)}
                      className="mt-2 text-xs text-blue-600 hover:underline"
                    >
                      {expandedStep === index ? 'Hide details' : 'Show details'}
                    </button>
                    <div className="mt-2 text-gray-500">Tool</div>
                    <div className="font-mono">{t.tool_name}</div>
                    {expandedStep === index && (
                      <div>
                        <div className="mt-2 text-gray-500">Args</div>
                        <pre className="bg-gray-50 p-2 rounded overflow-auto">{formatArgs(t.args)}</pre>
                        <div className="mt-2 text-gray-500">Output</div>
                        <pre className="bg-gray-50 p-2 rounded overflow-auto">{formatArgs(t.output)}</pre>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ApprovalsView() {
  const { data: approvals } = useQuery({
    queryKey: ['approvals'],
    queryFn: () => fetch('/api/memory/approvals?limit=100').then(res => res.json())
  });

  const parseTags = (tags?: string[]) => {
    const result: Record<string, string> = {};
    (tags || []).forEach((tag) => {
      const parts = tag.split(':');
      if (parts.length >= 2) {
        const key = parts[0];
        const value = parts.slice(1).join(':');
        result[key] = value;
      }
    });
    return result;
  };

  return (
    <div className="max-w-4xl mx-auto">
      <h2 className="text-2xl font-bold mb-6">Risk Approvals</h2>

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-gray-50 border-b border-gray-200 text-xs uppercase text-gray-500 font-medium">
            <tr>
              <th className="px-6 py-3">Content</th>
              <th className="px-6 py-3 w-40">Scope</th>
              <th className="px-6 py-3 w-40">Created</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {approvals?.map((fact: any) => (
              <tr key={fact.id} className="hover:bg-gray-50">
                <td className="px-6 py-4">
                  <div className="font-medium">{fact.content}</div>
                  <div className="text-xs text-gray-400 mt-1">
                    {(() => {
                      const tags = parseTags(fact.tags);
                      const tool = tags.tool ? `tool: ${tags.tool}` : '';
                      const reason = tags.reason ? `reason: ${tags.reason}` : '';
                      const signature = tags.signature ? `signature: ${tags.signature}` : '';
                      return [tool, reason, signature].filter(Boolean).join(' · ');
                    })()}
                  </div>
                </td>
                <td className="px-6 py-4 text-sm text-gray-500">
                  {parseTags(fact.tags).scope || 'unknown'}
                </td>
                <td className="px-6 py-4 text-sm text-gray-500">
                  {new Date(fact.created_at).toLocaleDateString()}
                </td>
              </tr>
            ))}
            {!approvals?.length && (
              <tr>
                <td colSpan={3} className="px-6 py-8 text-center text-gray-500">
                  No approvals recorded yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}


export default App;
