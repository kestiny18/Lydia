import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';

export function TaskReports() {
    const [expandedId, setExpandedId] = useState<number | null>(null);
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
                    const steps = data?.steps || [];
                    const totalSteps = steps.length;
                    const completedSteps = steps.filter((s: any) => s.status === 'completed').length;
                    const failedSteps = steps.filter((s: any) => s.status === 'failed').length;
                    const isExpanded = expandedId === report.id;
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
                            {totalSteps > 0 && (
                                <div className="mt-2 text-xs text-gray-600">
                                    Steps: {completedSteps}/{totalSteps} completed
                                    {failedSteps > 0 ? `, ${failedSteps} failed` : ''}
                                </div>
                            )}
                            {data?.summary && (
                                <div className="mt-3 text-sm text-gray-700">{data.summary}</div>
                            )}
                            <button
                                className="mt-3 text-xs text-blue-600 hover:underline"
                                onClick={() => setExpandedId(isExpanded ? null : report.id)}
                            >
                                {isExpanded ? 'Hide details' : 'View details'}
                            </button>
                            {isExpanded && (
                                <div className="mt-4 space-y-3 text-sm">
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
                            {steps.length > 0 && (
                                <div className="mt-3 text-sm text-gray-700">
                                    <div className="font-semibold">Steps</div>
                                    {steps.map((step: any) => (
                                        <div key={`${report.id}-${step.stepId}`} className="flex items-center justify-between border-b border-gray-100 py-2">
                                            <div className="text-xs text-gray-600">{step.stepId}</div>
                                            <div className={`text-xs px-2 py-0.5 rounded ${step.status === 'completed'
                                                    ? 'bg-green-100 text-green-800'
                                                    : step.status === 'failed'
                                                        ? 'bg-red-100 text-red-800'
                                                        : 'bg-gray-100 text-gray-600'
                                                }`}>
                                                {step.status}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
