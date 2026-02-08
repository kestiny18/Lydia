import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';

export function TaskReports() {
    const { data: reports, isLoading, error } = useQuery({
        queryKey: ['task-reports'],
        queryFn: () => api.getTaskReports(50)
    });

    const parseReport = (raw?: string | null) => {
        if (!raw) return null;
        try {
            return JSON.parse(raw);
        } catch {
            return null;
        }
    };

    return (
        <div className="max-w-5xl mx-auto">
            <h2 className="text-2xl font-bold mb-6">Task Reports</h2>

            {isLoading && <div className="text-gray-500">Loading...</div>}
            {error && <div className="text-red-500">Failed to load reports.</div>}
            {!isLoading && (!reports || reports.length === 0) && (
                <div className="text-gray-500">No task reports yet.</div>
            )}

            <div className="space-y-4">
                {(reports || []).map((report) => {
                    const data = parseReport(report.report_json);
                    return (
                        <div key={report.id} className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
                            <div className="flex items-start justify-between">
                                <div>
                                    <div className="text-sm text-gray-500">Task {report.task_id}</div>
                                    <div className="text-lg font-semibold">{data?.intentSummary || 'Task Report'}</div>
                                </div>
                                <span className={`text-xs px-2 py-1 rounded ${data?.success ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                                    {data?.success ? 'success' : 'failed'}
                                </span>
                            </div>
                            <div className="mt-2 text-xs text-gray-500">
                                {new Date(report.created_at).toLocaleString()}
                            </div>
                            {data?.summary && (
                                <div className="mt-3 text-sm text-gray-700">{data.summary}</div>
                            )}
                            {(data?.outputs || []).length > 0 && (
                                <div className="mt-3 text-sm">
                                    <div className="font-semibold">Outputs</div>
                                    {data.outputs.map((out: string, idx: number) => (
                                        <div key={`${report.id}-out-${idx}`} className="text-gray-700">
                                            - {out}
                                        </div>
                                    ))}
                                </div>
                            )}
                            {(data?.followUps || []).length > 0 && (
                                <div className="mt-3 text-sm text-gray-600">
                                    <div className="font-semibold">Follow-ups</div>
                                    {data.followUps.map((item: string, idx: number) => (
                                        <div key={`${report.id}-fu-${idx}`}>
                                            - {item}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
