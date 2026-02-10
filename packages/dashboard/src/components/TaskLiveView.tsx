import { useEffect, useRef, useState } from 'react';
import { Loader2, Clock, Wrench, AlertCircle, MessageSquare } from 'lucide-react';
import type { AgentEvent } from '../types';

interface TaskLiveViewProps {
    runId: string;
    input: string;
    startedAt: number;
    streamText: string;
    agentEvents: AgentEvent[];
    activeTools: string[];
    isRunning: boolean;
    wsStatus: string;
    pendingPrompt: { id: string; prompt: string } | null;
    promptResponse: string;
    onPromptResponseChange: (value: string) => void;
    onPromptSubmit: () => void;
    lastResult: string | null;
    error: string | null;
}

export function TaskLiveView({
    runId,
    input,
    startedAt,
    streamText,
    agentEvents,
    activeTools,
    isRunning,
    wsStatus,
    pendingPrompt,
    promptResponse,
    onPromptResponseChange,
    onPromptSubmit,
    lastResult,
    error,
}: TaskLiveViewProps) {
    const outputRef = useRef<HTMLDivElement>(null);
    const elapsed = useElapsed(startedAt, isRunning);

    // Auto-scroll output
    useEffect(() => {
        if (outputRef.current) {
            outputRef.current.scrollTop = outputRef.current.scrollHeight;
        }
    }, [streamText, agentEvents.length]);

    return (
        <div className="flex flex-col h-full">
            {/* Status Bar */}
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-gray-100">
                <div className="flex-1 min-w-0">
                    <h2 className="text-sm font-semibold text-gray-900 truncate">{input}</h2>
                    <div className="flex items-center gap-3 mt-1">
                        <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${
                            isRunning ? 'text-blue-600' : error ? 'text-red-600' : 'text-green-600'
                        }`}>
                            {isRunning ? (
                                <>
                                    <Loader2 size={12} className="animate-spin" />
                                    {pendingPrompt ? 'Waiting for input' : 'Running'}
                                </>
                            ) : error ? (
                                <>
                                    <AlertCircle size={12} />
                                    Failed
                                </>
                            ) : (
                                'Completed'
                            )}
                        </span>
                        <span className="flex items-center gap-1 text-xs text-gray-400">
                            <Clock size={12} />
                            {formatDuration(elapsed)}
                        </span>
                        {activeTools.length > 0 && (
                            <span className="flex items-center gap-1 text-xs text-blue-500">
                                <Wrench size={12} />
                                {activeTools[0]}
                            </span>
                        )}
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {wsStatus === 'connected' && (
                        <span className="flex items-center gap-1 text-xs text-green-500">
                            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                            Live
                        </span>
                    )}
                </div>
            </div>

            {/* Streaming Output */}
            {(streamText || lastResult) && (
                <div
                    ref={outputRef}
                    className="flex-1 min-h-0 bg-gray-50 rounded-lg p-3 mb-3 text-sm whitespace-pre-wrap font-mono overflow-y-auto leading-relaxed"
                >
                    {streamText || lastResult}
                    {isRunning && !pendingPrompt && <span className="animate-pulse text-blue-500">▌</span>}
                </div>
            )}

            {/* Error */}
            {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-3 text-sm text-red-700">
                    <div className="flex items-center gap-2 font-medium mb-1">
                        <AlertCircle size={14} />
                        Task Failed
                    </div>
                    {error}
                </div>
            )}

            {/* Interaction Prompt */}
            {pendingPrompt && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-3">
                    <div className="flex items-center gap-2 text-sm font-medium text-amber-800 mb-2">
                        <MessageSquare size={14} />
                        Confirmation Required
                    </div>
                    <p className="text-sm text-amber-700 whitespace-pre-wrap mb-3">{pendingPrompt.prompt}</p>
                    <div className="flex items-center gap-2">
                        <input
                            value={promptResponse}
                            onChange={(e) => onPromptResponseChange(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    e.preventDefault();
                                    onPromptSubmit();
                                }
                            }}
                            className="flex-1 border border-amber-200 rounded-md p-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-300"
                            placeholder="Type your response (yes/no/always)..."
                            autoFocus
                        />
                        <button
                            onClick={onPromptSubmit}
                            className="px-4 py-2 rounded-md text-white text-sm bg-amber-600 hover:bg-amber-700 transition-colors"
                        >
                            Send
                        </button>
                    </div>
                </div>
            )}

            {/* Event Timeline */}
            {agentEvents.length > 0 && (
                <div className="border-t border-gray-100 pt-3">
                    <div className="text-xs font-medium text-gray-500 mb-2">Event Log</div>
                    <div className="space-y-0.5 max-h-40 overflow-y-auto">
                        {agentEvents.slice(-30).map((evt, i) => (
                            <div key={i} className="flex items-start gap-2 text-xs text-gray-500 py-0.5">
                                <span className="text-gray-300 shrink-0 tabular-nums">
                                    {new Date(evt.timestamp).toLocaleTimeString()}
                                </span>
                                {evt.type === 'tool:start' && (
                                    <span className="text-blue-600">&#9881; {evt.data?.name}</span>
                                )}
                                {evt.type === 'tool:complete' && (
                                    <span className="text-green-600">&#10003; {evt.data?.name} ({evt.data?.duration}ms)</span>
                                )}
                                {evt.type === 'tool:error' && (
                                    <span className="text-red-600">&#10007; {evt.data?.name}: {evt.data?.error}</span>
                                )}
                                {evt.type === 'message' && (
                                    <span className="text-gray-600 truncate">{evt.data?.text?.substring(0, 80)}</span>
                                )}
                                {evt.type === 'thinking' && (
                                    <span className="text-gray-400 italic">thinking...</span>
                                )}
                                {evt.type === 'retry' && (
                                    <span className="text-yellow-600">&#8635; Retry {evt.data?.attempt}/{evt.data?.maxRetries}</span>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

function formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainSeconds = seconds % 60;
    return `${minutes}m ${remainSeconds}s`;
}

function useElapsed(startedAt: number, isRunning: boolean): number {
    const [elapsed, setElapsed] = useState(Date.now() - startedAt);

    useEffect(() => {
        if (!isRunning) {
            setElapsed(Date.now() - startedAt);
            return;
        }
        const interval = setInterval(() => {
            setElapsed(Date.now() - startedAt);
        }, 1000);
        return () => clearInterval(interval);
    }, [startedAt, isRunning]);

    return elapsed;
}

