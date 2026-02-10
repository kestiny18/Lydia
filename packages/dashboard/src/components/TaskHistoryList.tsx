import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Search, Plus, Loader2, CheckCircle2, XCircle, Clock } from 'lucide-react';
import type { TaskHistoryItem, TaskStatus } from '../types';

interface TaskHistoryListProps {
    selectedId: string | null;
    onSelect: (id: string | null) => void;
    /** Externally tracked active run ID (from WebSocket) */
    activeRunId?: string | null;
}

export function TaskHistoryList({ selectedId, onSelect, activeRunId }: TaskHistoryListProps) {
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState<string>('');

    const { data, isLoading } = useQuery({
        queryKey: ['task-history', search, statusFilter],
        queryFn: () => api.getTaskHistory({
            limit: 50,
            search: search || undefined,
            status: statusFilter || undefined,
        }),
        refetchInterval: activeRunId ? 3000 : 10000, // faster polling when task running
    });

    const items = data?.items ?? [];
    const serverActiveRunId = data?.activeRunId ?? activeRunId;

    return (
        <div className="flex flex-col h-full">
            {/* New Task Button */}
            <button
                onClick={() => onSelect(null)}
                className={`flex items-center gap-2 w-full px-3 py-2.5 mb-3 rounded-lg text-sm font-medium transition-colors ${
                    selectedId === null
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'bg-gray-50 text-gray-700 hover:bg-gray-100 border border-gray-200'
                }`}
            >
                <Plus size={16} />
                New Task
            </button>

            {/* Search & Filter */}
            <div className="flex items-center gap-2 mb-3">
                <div className="relative flex-1">
                    <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="w-full pl-8 pr-3 py-1.5 text-xs border border-gray-200 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-200"
                        placeholder="Search tasks..."
                    />
                </div>
                <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="text-xs border border-gray-200 rounded-md px-2 py-1.5 bg-white text-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-200"
                >
                    <option value="">All</option>
                    <option value="running">Running</option>
                    <option value="completed">Completed</option>
                    <option value="failed">Failed</option>
                </select>
            </div>

            {/* Task List */}
            <div className="flex-1 overflow-y-auto -mx-1 px-1 space-y-1">
                {isLoading && items.length === 0 && (
                    <div className="flex items-center justify-center py-8 text-gray-400">
                        <Loader2 size={16} className="animate-spin mr-2" />
                        <span className="text-xs">Loading...</span>
                    </div>
                )}

                {!isLoading && items.length === 0 && (
                    <div className="text-center py-8 text-gray-400">
                        <p className="text-sm">No tasks yet</p>
                        <p className="text-xs mt-1">Create a new task to get started</p>
                    </div>
                )}

                {items.map((item) => (
                    <TaskHistoryCard
                        key={item.id}
                        item={item}
                        isSelected={selectedId === item.id}
                        isActive={item.id === serverActiveRunId}
                        onClick={() => onSelect(item.id)}
                    />
                ))}
            </div>
        </div>
    );
}

function TaskHistoryCard({
    item,
    isSelected,
    isActive,
    onClick,
}: {
    item: TaskHistoryItem;
    isSelected: boolean;
    isActive: boolean;
    onClick: () => void;
}) {
    return (
        <button
            onClick={onClick}
            className={`w-full text-left rounded-lg p-2.5 transition-colors ${
                isSelected
                    ? 'bg-blue-50 border border-blue-200'
                    : 'hover:bg-gray-50 border border-transparent'
            }`}
        >
            <div className="flex items-start gap-2">
                <StatusIcon status={item.status} isActive={isActive} />
                <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-800 truncate leading-tight">
                        {item.input || item.summary || 'Untitled Task'}
                    </div>
                    {item.summary && item.summary !== item.input && (
                        <div className="text-xs text-gray-500 truncate mt-0.5">
                            {item.summary}
                        </div>
                    )}
                    <div className="flex items-center gap-2 mt-1">
                        <span className="text-[10px] text-gray-400">
                            {formatRelativeTime(item.createdAt)}
                        </span>
                        {item.duration != null && (
                            <span className="flex items-center gap-0.5 text-[10px] text-gray-400">
                                <Clock size={10} />
                                {formatShortDuration(item.duration)}
                            </span>
                        )}
                    </div>
                </div>
            </div>
        </button>
    );
}

function StatusIcon({ status, isActive }: { status: TaskStatus; isActive: boolean }) {
    if (status === 'running' || isActive) {
        return (
            <div className="mt-0.5 shrink-0">
                <Loader2 size={14} className="text-blue-500 animate-spin" />
            </div>
        );
    }
    if (status === 'completed') {
        return (
            <div className="mt-0.5 shrink-0">
                <CheckCircle2 size={14} className="text-green-500" />
            </div>
        );
    }
    return (
        <div className="mt-0.5 shrink-0">
            <XCircle size={14} className="text-red-400" />
        </div>
    );
}

function formatRelativeTime(timestamp: number): string {
    const now = Date.now();
    const diff = now - timestamp;
    if (diff < 60000) return 'just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;
    return new Date(timestamp).toLocaleDateString();
}

function formatShortDuration(ms: number): string {
    if (ms < 1000) return '<1s';
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    return `${minutes}m`;
}
