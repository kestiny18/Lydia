import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Database, History, Activity, Terminal } from 'lucide-react';

function App() {
  const [activeTab, setActiveTab] = useState<'overview' | 'memory' | 'replay'>('overview');

  const { data: status } = useQuery({
    queryKey: ['status'],
    queryFn: () => fetch('/api/status').then(res => res.json())
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
        </nav>

        <div className="p-4 border-t border-gray-100 text-xs text-gray-400">
          v{status?.version || '0.0.0'}
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto p-8">
        {activeTab === 'overview' && <OverviewView status={status} />}
        {activeTab === 'memory' && <MemoryView />}
        {activeTab === 'replay' && <ReplayView />}
      </main>
    </div>
  );
}

function NavItem({ icon, label, active, onClick }: any) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
        active
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
  // Mock data for now until we have list endpoint
  const episodes = [
    { id: 1, input: "Check git status", created_at: Date.now() - 1000000 },
  ];

  return (
    <div className="max-w-4xl mx-auto">
      <h2 className="text-2xl font-bold mb-6">Replay Studio</h2>
      <div className="bg-white rounded-lg border border-gray-200 p-6 text-center text-gray-500">
        <History className="mx-auto mb-2 text-gray-300" size={48} />
        <p>Select an episode to replay execution traces.</p>
        <p className="text-xs mt-2">(Coming soon: Full trace visualization)</p>
      </div>
    </div>
  );
}

export default App;
