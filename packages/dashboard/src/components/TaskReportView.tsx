import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { CheckCircle2, XCircle, ChevronDown, ChevronRight, Clock, RotateCcw, Loader2, AlertCircle } from 'lucide-react';
import type { TaskDetail } from '../types';

interface TaskReportViewProps {
    taskId: string;
    onResumeTask?: (taskId: string) => void;
}

export function TaskReportView({ taskId, onResumeTask }: TaskReportViewProps) {
    const { data: detail, isLoading, error } = useQuery({
        queryKey: ['task-detail', taskId],
        queryFn: () => api.getTaskDetail(taskId),
        retry: 1,
    });

    // Check if this task has a checkpoint (resumable)
    const { data: resumableData } = useQuery({
        queryKey: ['resumable-tasks'],
        queryFn: () => api.getResumableTasks(),
        staleTime: 5000,
    });

    const isResumable = resumableData?.items?.some((item) => item.taskId === taskId);
    const checkpointInfo = resumableData?.items?.find((item) => item.taskId === taskId);

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-64 text-gray-400">
                <Loader2 size={20} className="animate-spin mr-2" />
                Loading task details...
            </div>
        );
    }

    if (error || !detail) {
        // This might be a resumable-only task (no report yet)
        if (isResumable && checkpointInfo) {
            return (
                <div className="space-y-4">
                    <div className="flex items-center gap-3 mb-4">
                        <AlertCircle size={20} className="text-amber-500" />
                        <h2 className="text-lg font-semibold text-gray-800">Interrupted Task</h2>
                    </div>
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                        <p className="text-sm text-amber-800 font-medium mb-1">
                            This task was interrupted and can be resumed.
                        </p>
                        <p className="text-xs text-amber-600">
                            Stopped at iteration {checkpointInfo.iteration} &middot; Last checkpoint: {new Date(checkpointInfo.updatedAt).toLocaleString()}
                        </p>
                        <p className="text-sm text-gray-700 mt-2">{checkpointInfo.input}</p>
                    </div>
                    {onResumeTask && (
                        <button
                            onClick={() => onResumeTask(taskId)}
                            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
                        >
                            <RotateCcw size={14} />
                            Resume Task
                        </button>
                    )}
                </div>
            );
        }

        return (
            <div className="flex items-center justify-center h-64 text-gray-400">
                <XCircle size={16} className="mr-2" />
                {error ? String((error as any).message || error) : 'Task not found'}
            </div>
        );
    }

    const isSuccess = detail.status === 'completed';
    const report = detail.report;

    return (
        <div className="space-y-5 max-w-3xl">
            {/* Header */}
            <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                    {isSuccess ? (
                        <CheckCircle2 size={20} className="text-green-500 mt-0.5 shrink-0" />
                    ) : (
                        <XCircle size={20} className="text-red-400 mt-0.5 shrink-0" />
                    )}
                    <div>
                        <h2 className="text-lg font-semibold text-gray-800 leading-tight">
                            {report?.intentSummary || detail.input || 'Task'}
                        </h2>
                        <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                            <span className={isSuccess ? 'text-green-600' : 'text-red-500'}>
                                {isSuccess ? 'Completed' : 'Failed'}
                            </span>
                            <span>&middot;</span>
                            <span>{new Date(detail.createdAt).toLocaleString()}</span>
                            {detail.duration != null && (
                                <>
                                    <span>&middot;</span>
                                    <span className="flex items-center gap-1">
                                        <Clock size={10} />
                                        {formatDuration(detail.duration)}
                                    </span>
                                </>
                            )}
                        </div>
                    </div>
                </div>
                {/* Resume button for tasks with checkpoint */}
                {isResumable && onResumeTask && (
                    <button
                        onClick={() => onResumeTask(taskId)}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-md text-xs font-medium hover:bg-blue-700 transition-colors shrink-0"
                    >
                        <RotateCcw size={12} />
                        Resume
                    </button>
                )}
            </div>

            {/* Summary */}
            {report?.summary && (
                <div className="bg-gray-50 rounded-lg p-4">
                    <p className="text-sm text-gray-700">{report.summary}</p>
                </div>
            )}

            {/* Outputs */}
            {report?.outputs && report.outputs.length > 0 && (
                <div>
                    <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Outputs</h3>
                    <ul className="space-y-1.5">
                        {report.outputs.map((output: string, i: number) => (
                            <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                                <span className="text-gray-400 mt-0.5">&rarr;</span>
                                <span>{output}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {/* Steps */}
            {report?.steps && report.steps.length > 0 && (
                <div>
                    <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Steps</h3>
                    <div className="space-y-1">
                        {report.steps.map((step: any, i: number) => (
                            <div key={i} className="flex items-center gap-2 text-sm">
                                {step.status === 'completed' ? (
                                    <CheckCircle2 size={12} className="text-green-500 shrink-0" />
                                ) : (
                                    <XCircle size={12} className="text-red-400 shrink-0" />
                                )}
                                <span className="text-gray-700">{step.stepId}</span>
                                <span className="text-gray-400 text-xs">({step.status})</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Follow-ups */}
            {report?.followUps && report.followUps.length > 0 && (
                <div>
                    <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Follow-ups</h3>
                    <ul className="space-y-1">
                        {report.followUps.map((item: string, i: number) => (
                            <li key={i} className="flex items-start gap-2 text-sm text-gray-600">
                                <span className="text-gray-400">&bull;</span>
                                <span>{item}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {/* Tool Traces */}
            {detail.traces && detail.traces.length > 0 && (
                <div>
                    <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                        Tool Traces ({detail.traces.length})
                    </h3>
                    <div className="space-y-1">
                        {detail.traces.map((trace: any, i: number) => (
                            <TraceRow key={i} trace={trace} />
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

function TraceRow({ trace }: { trace: any }) {
    const [expanded, setExpanded] = useState(false);
    const isSuccess = trace.status === 'success';

    return (
        <div className="border border-gray-100 rounded-md">
            <button
                onClick={() => setExpanded(!expanded)}
                className="flex items-center gap-2 w-full px-3 py-1.5 text-left text-sm hover:bg-gray-50 transition-colors"
            >
                {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                {isSuccess ? (
                    <CheckCircle2 size={12} className="text-green-500" />
                ) : (
                    <XCircle size={12} className="text-red-400" />
                )}
                <span className="font-medium text-gray-700">{trace.tool_name}</span>
                <span className="text-xs text-gray-400 ml-auto">{trace.duration}ms</span>
            </button>
            {expanded && (
                <div className="px-3 pb-2 space-y-1">
                    {trace.tool_args && (
                        <div>
                            <span className="text-[10px] font-semibold text-gray-400 uppercase">Args</span>
                            <pre className="text-xs text-gray-600 bg-gray-50 rounded p-2 overflow-x-auto max-h-32">
                                {formatJson(trace.tool_args)}
                            </pre>
                        </div>
                    )}
                    {trace.tool_output && (
                        <div>
                            <span className="text-[10px] font-semibold text-gray-400 uppercase">Output</span>
                            <pre className="text-xs text-gray-600 bg-gray-50 rounded p-2 overflow-x-auto max-h-40">
                                {truncate(typeof trace.tool_output === 'string' ? trace.tool_output : JSON.stringify(trace.tool_output, null, 2), 2000)}
                            </pre>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

function formatJson(str: string): string {
    try {
        return JSON.stringify(JSON.parse(str), null, 2);
    } catch {
        return str;
    }
}

function truncate(str: string, max: number): string {
    if (str.length <= max) return str;
    return str.substring(0, max) + `\n... (${str.length - max} more chars)`;
}

function formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainSeconds = seconds % 60;
    return `${minutes}m ${remainSeconds}s`;
}
