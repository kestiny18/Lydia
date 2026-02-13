import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
    Database, History, ShieldCheck, GitBranch, Settings2, Plug,
} from 'lucide-react';
import { StrategyReview } from './StrategyReview';
import { EvolutionHistory } from './EvolutionHistory';
import { api } from '../lib/api';

type SettingsTab = 'system' | 'memory' | 'strategy' | 'evolution' | 'replay' | 'approvals' | 'mcp';

interface SettingsLayoutProps {
    mode?: 'all' | 'memory' | 'control';
}

export function SettingsLayout({ mode = 'all' }: SettingsLayoutProps) {
    const initialTab: SettingsTab = mode === 'memory' ? 'memory' : 'system';
    const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab);

    const allTabs: Array<{ key: SettingsTab; label: string; icon: React.ReactNode }> = [
        { key: 'system', label: 'System', icon: <Settings2 size={16} /> },
        { key: 'memory', label: 'Memory Bank', icon: <Database size={16} /> },
        { key: 'strategy', label: 'Strategy', icon: <ShieldCheck size={16} /> },
        { key: 'evolution', label: 'Evolution', icon: <GitBranch size={16} /> },
        { key: 'replay', label: 'Replay Studio', icon: <History size={16} /> },
        { key: 'approvals', label: 'Approvals', icon: <ShieldCheck size={16} /> },
        { key: 'mcp', label: 'MCP Health', icon: <Plug size={16} /> },
    ];

    const tabs = allTabs.filter((tab) => {
        if (mode === 'memory') return tab.key === 'memory' || tab.key === 'replay';
        if (mode === 'control') return tab.key !== 'memory' && tab.key !== 'replay';
        return true;
    });

    return (
        <div className="flex h-full">
            {/* Settings Sidebar */}
            <div className="w-56 shrink-0 border-r border-gray-200 p-3">
                <div className="text-xs font-medium text-gray-400 uppercase tracking-wide px-3 py-2">
                    Settings & Extensions
                </div>
                <nav className="space-y-0.5">
                    {tabs.map((tab) => (
                        <button
                            key={tab.key}
                            onClick={() => setActiveTab(tab.key)}
                            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors ${
                                activeTab === tab.key
                                    ? 'bg-gray-100 text-gray-900 font-medium'
                                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-800'
                            }`}
                        >
                            {tab.icon}
                            {tab.label}
                        </button>
                    ))}
                </nav>
            </div>

            {/* Settings Content */}
            <div className="flex-1 overflow-auto p-6">
                {activeTab === 'system' && <SystemView />}
                {activeTab === 'memory' && <MemoryView />}
                {activeTab === 'strategy' && <StrategyReview />}
                {activeTab === 'evolution' && <EvolutionHistory />}
                {activeTab === 'replay' && <ReplayView />}
                {activeTab === 'approvals' && <ApprovalsView />}
                {activeTab === 'mcp' && <McpHealthView />}
            </div>
        </div>
    );
}

// ─── System View ────────────────────────────────────────────────────

function SystemView() {
    const { data: status } = useQuery({
        queryKey: ['status'],
        queryFn: () => fetch('/api/status').then(res => res.json())
    });

    const { data: setupStatus } = useQuery({
        queryKey: ['setup'],
        queryFn: () => fetch('/api/setup').then(res => res.json())
    });

    return (
        <div className="max-w-3xl">
            <h2 className="text-xl font-bold mb-6">System Overview</h2>

            {setupStatus && !setupStatus.ready && (
                <div className="mb-6 text-sm text-yellow-700 bg-yellow-50 border border-yellow-200 rounded-lg px-4 py-3">
                    Setup incomplete: run <code className="bg-yellow-100 px-1 rounded">lydia init</code>
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <div className="bg-white p-4 rounded-lg border border-gray-200">
                    <div className="text-xs text-gray-500 mb-1">Memory DB</div>
                    <div className="text-lg font-bold text-gray-900">Connected</div>
                </div>
                <div className="bg-white p-4 rounded-lg border border-gray-200">
                    <div className="text-xs text-gray-500 mb-1">Agent Status</div>
                    <div className="text-lg font-bold text-gray-900">Idle</div>
                </div>
                <div className="bg-white p-4 rounded-lg border border-gray-200">
                    <div className="text-xs text-gray-500 mb-1">Version</div>
                    <div className="text-lg font-bold text-gray-900">v{status?.version || '0.0.0'}</div>
                </div>
            </div>

            <div className="bg-white rounded-lg border border-gray-200 p-4">
                <h3 className="text-sm font-semibold mb-3">Configuration</h3>
                <pre className="bg-gray-50 p-3 rounded text-xs overflow-x-auto">
                    {JSON.stringify(status, null, 2)}
                </pre>
            </div>
        </div>
    );
}

// ─── Memory View ────────────────────────────────────────────────────

function MemoryView() {
    const { data: facts } = useQuery({
        queryKey: ['facts'],
        queryFn: () => fetch('/api/memory/facts').then(res => res.json())
    });

    return (
        <div className="max-w-3xl">
            <h2 className="text-xl font-bold mb-6">Memory Bank</h2>
            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                <table className="w-full text-left">
                    <thead className="bg-gray-50 border-b border-gray-200 text-xs uppercase text-gray-500 font-medium">
                        <tr>
                            <th className="px-4 py-3">Content</th>
                            <th className="px-4 py-3 w-32">Tags</th>
                            <th className="px-4 py-3 w-36">Created</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {facts?.map((fact: any) => (
                            <tr key={fact.id} className="hover:bg-gray-50">
                                <td className="px-4 py-3 text-sm">{fact.content}</td>
                                <td className="px-4 py-3">
                                    <div className="flex gap-1 flex-wrap">
                                        {fact.tags?.map((tag: string) => (
                                            <span key={tag} className="px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded-full text-[10px]">
                                                {tag}
                                            </span>
                                        ))}
                                    </div>
                                </td>
                                <td className="px-4 py-3 text-xs text-gray-500">
                                    {new Date(fact.created_at).toLocaleDateString()}
                                </td>
                            </tr>
                        ))}
                        {!facts?.length && (
                            <tr>
                                <td colSpan={3} className="px-4 py-8 text-center text-gray-400 text-sm">
                                    No memories found yet.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

// ─── Replay View ────────────────────────────────────────────────────

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
        if (!args) return '\u2014';
        try { return JSON.stringify(args, null, 2); } catch { return String(args); }
    };

    return (
        <div className="max-w-4xl">
            <h2 className="text-xl font-bold mb-6">Replay Studio</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                    <div className="px-4 py-3 border-b border-gray-100 font-semibold text-sm">Episodes</div>
                    <ul className="divide-y divide-gray-100 max-h-96 overflow-y-auto">
                        {episodes?.map((e: any) => (
                            <li key={e.id}>
                                <button
                                    onClick={() => setSelectedId(e.id)}
                                    className={`w-full text-left px-4 py-3 hover:bg-gray-50 ${selectedId === e.id ? 'bg-blue-50' : ''}`}
                                >
                                    <div className="text-sm font-medium truncate">{e.input}</div>
                                    <div className="text-xs text-gray-500">
                                        #{e.id} &middot; {new Date(e.created_at).toLocaleString()}
                                    </div>
                                </button>
                            </li>
                        ))}
                        {!episodes?.length && (
                            <li className="px-4 py-6 text-center text-gray-400 text-sm">No episodes yet.</li>
                        )}
                    </ul>
                </div>

                <div className="bg-white rounded-lg border border-gray-200 p-4">
                    <div className="font-semibold text-sm mb-3">Details</div>
                    {!episodeDetail && (
                        <div className="text-gray-400 text-sm">Select an episode to view traces.</div>
                    )}
                    {episodeDetail?.episode && (
                        <div className="space-y-3">
                            <div>
                                <div className="text-xs text-gray-500">Input</div>
                                <div className="text-sm font-medium">{episodeDetail.episode.input}</div>
                            </div>
                            <div>
                                <div className="text-xs text-gray-500">Result</div>
                                <div className="text-sm">{episodeDetail.episode.result || '\u2014'}</div>
                            </div>
                            {episodeDetail.summary && (
                                <div className="flex gap-2 text-xs">
                                    <span className="px-2 py-1 rounded bg-green-100 text-green-700">
                                        success: {episodeDetail.summary.success}
                                    </span>
                                    <span className="px-2 py-1 rounded bg-red-100 text-red-700">
                                        failed: {episodeDetail.summary.failed}
                                    </span>
                                </div>
                            )}
                            <div className="space-y-2">
                                {(episodeDetail.traces || []).map((t: any, index: number) => (
                                    <div key={t.id || index} className="border border-gray-100 rounded p-2 text-xs">
                                        <div className="flex items-center justify-between">
                                            <div className="font-semibold">Step {t.step_index + 1}</div>
                                            <span className={`px-1.5 py-0.5 rounded text-[10px] ${
                                                t.status === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                                            }`}>
                                                {t.status}
                                            </span>
                                        </div>
                                        <div className="mt-1 text-gray-500">Tool: <span className="font-mono">{t.tool_name}</span></div>
                                        <button
                                            onClick={() => setExpandedStep(expandedStep === index ? null : index)}
                                            className="mt-1 text-blue-500 hover:underline"
                                        >
                                            {expandedStep === index ? 'Hide' : 'Show details'}
                                        </button>
                                        {expandedStep === index && (
                                            <div className="mt-2 space-y-1">
                                                <div className="text-gray-400">Args</div>
                                                <pre className="bg-gray-50 p-2 rounded overflow-auto max-h-24">{formatArgs(t.args)}</pre>
                                                <div className="text-gray-400">Output</div>
                                                <pre className="bg-gray-50 p-2 rounded overflow-auto max-h-24">{formatArgs(t.output)}</pre>
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

// ─── Approvals View ─────────────────────────────────────────────────

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
                result[parts[0]] = parts.slice(1).join(':');
            }
        });
        return result;
    };

    return (
        <div className="max-w-3xl">
            <h2 className="text-xl font-bold mb-6">Risk Approvals</h2>
            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                <table className="w-full text-left">
                    <thead className="bg-gray-50 border-b border-gray-200 text-xs uppercase text-gray-500 font-medium">
                        <tr>
                            <th className="px-4 py-3">Content</th>
                            <th className="px-4 py-3 w-32">Scope</th>
                            <th className="px-4 py-3 w-36">Created</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {approvals?.map((fact: any) => (
                            <tr key={fact.id} className="hover:bg-gray-50">
                                <td className="px-4 py-3">
                                    <div className="text-sm font-medium">{fact.content}</div>
                                    <div className="text-xs text-gray-400 mt-0.5">
                                        {(() => {
                                            const tags = parseTags(fact.tags);
                                            return [
                                                tags.tool && `tool: ${tags.tool}`,
                                                tags.reason && `reason: ${tags.reason}`,
                                            ].filter(Boolean).join(' \u00B7 ');
                                        })()}
                                    </div>
                                </td>
                                <td className="px-4 py-3 text-xs text-gray-500">
                                    {parseTags(fact.tags).scope || 'unknown'}
                                </td>
                                <td className="px-4 py-3 text-xs text-gray-500">
                                    {new Date(fact.created_at).toLocaleDateString()}
                                </td>
                            </tr>
                        ))}
                        {!approvals?.length && (
                            <tr>
                                <td colSpan={3} className="px-4 py-8 text-center text-gray-400 text-sm">
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

function McpHealthView() {
    const { data, isLoading, error, refetch, isFetching } = useQuery({
        queryKey: ['mcp-health'],
        queryFn: () => api.getMcpHealth({ timeoutMs: 15000, retries: 0 }),
    });

    return (
        <div className="max-w-4xl">
            <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold">MCP Health</h2>
                <button
                    onClick={() => refetch()}
                    disabled={isFetching}
                    className="px-3 py-1.5 text-sm rounded-md border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-50"
                >
                    {isFetching ? 'Checking...' : 'Re-check'}
                </button>
            </div>

            {isLoading && (
                <div className="text-sm text-gray-500">Checking MCP servers...</div>
            )}

            {error && (
                <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
                    {(error as Error).message}
                </div>
            )}

            {!isLoading && !error && (
                <div className="space-y-3">
                    <div className={`text-sm px-3 py-2 rounded border ${data?.ok ? 'text-green-700 bg-green-50 border-green-200' : 'text-red-700 bg-red-50 border-red-200'}`}>
                        {data?.ok ? 'All configured MCP servers are reachable.' : 'Some MCP servers failed health check.'}
                    </div>
                    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                        <table className="w-full text-left">
                            <thead className="bg-gray-50 border-b border-gray-200 text-xs uppercase text-gray-500 font-medium">
                                <tr>
                                    <th className="px-4 py-3">Server</th>
                                    <th className="px-4 py-3 w-24">Status</th>
                                    <th className="px-4 py-3 w-28">Attempts</th>
                                    <th className="px-4 py-3 w-28">Duration</th>
                                    <th className="px-4 py-3">Tools / Error</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {(data?.results || []).map((r: any) => (
                                    <tr key={r.id}>
                                        <td className="px-4 py-3 text-sm font-mono">{r.id}</td>
                                        <td className="px-4 py-3 text-xs">
                                            <span className={`px-2 py-0.5 rounded ${r.ok ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                                {r.ok ? 'ok' : 'failed'}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-xs text-gray-600">{r.attempts}</td>
                                        <td className="px-4 py-3 text-xs text-gray-600">{r.durationMs}ms</td>
                                        <td className="px-4 py-3 text-xs text-gray-600">
                                            {r.ok
                                                ? (r.tools?.length ? r.tools.join(', ') : '(no tools)')
                                                : (r.error || 'unknown error')}
                                        </td>
                                    </tr>
                                ))}
                                {!data?.results?.length && (
                                    <tr>
                                        <td colSpan={5} className="px-4 py-8 text-center text-gray-400 text-sm">
                                            No configured external MCP servers.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}
