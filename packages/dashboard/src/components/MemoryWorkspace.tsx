import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { Database, History, FileText } from 'lucide-react';
import { api } from '../lib/api';
import { Panel } from './ui/Panel';
import { SettingsLayout } from './SettingsLayout';

export function MemoryWorkspace() {
    const { data: facts } = useQuery({
        queryKey: ['memory-facts-summary'],
        queryFn: () => api.getFacts(200),
    });
    const { data: episodes } = useQuery({
        queryKey: ['memory-episodes-summary'],
        queryFn: () => api.getEpisodes(200),
    });
    const { data: reports } = useQuery({
        queryKey: ['memory-reports-summary'],
        queryFn: () => api.getTaskReports(200),
    });

    return (
        <div className="h-full p-6 space-y-4 overflow-auto">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <StatCard title="Facts" value={facts?.length ?? 0} icon={<Database size={14} />} />
                <StatCard title="Episodes" value={episodes?.length ?? 0} icon={<History size={14} />} />
                <StatCard title="Reports" value={reports?.length ?? 0} icon={<FileText size={14} />} />
            </div>
            <Panel title="Memory Explorer" subtitle="Inspect facts and replay history in one place.">
                <div className="h-[calc(100vh-240px)]">
                    <SettingsLayout mode="memory" />
                </div>
            </Panel>
        </div>
    );
}

function StatCard({ title, value, icon }: { title: string; value: number; icon: ReactNode }) {
    return (
        <div className="rounded-2xl border border-[color:var(--line)] bg-white px-4 py-3 shadow-[var(--shadow-soft)]">
            <div className="flex items-center justify-between text-[11px] uppercase tracking-wide text-[color:var(--text-muted)]">
                <span>{title}</span>
                {icon}
            </div>
            <div className="mt-2 text-xl font-bold text-[color:var(--text-strong)] tabular-nums">{value}</div>
        </div>
    );
}
