import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useWebSocket } from '../lib/useWebSocket';
import type { WsMessage } from '../types';
import { TaskReports } from './TaskReports';

interface AgentEvent {
    type: string;
    data?: any;
    timestamp: number;
}

export function TaskRunner() {
    const [input, setInput] = useState('');
    const [isRunning, setIsRunning] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [warning, setWarning] = useState<string | null>(null);
    const [lastResult, setLastResult] = useState<string | null>(null);
    const [runId, setRunId] = useState<string | null>(null);
    const [pendingPrompt, setPendingPrompt] = useState<{ id: string; prompt: string } | null>(null);
    const [promptResponse, setPromptResponse] = useState('');
    const [history, setHistory] = useState<Array<{ input: string; timestamp: number }>>([]);
    const [goal, setGoal] = useState('');
    const [constraints, setConstraints] = useState('');
    const [successCriteria, setSuccessCriteria] = useState('');
    const queryClient = useQueryClient();

    // Real-time streaming state (P2-4)
    const [streamText, setStreamText] = useState('');
    const [agentEvents, setAgentEvents] = useState<AgentEvent[]>([]);
    const [activeTools, setActiveTools] = useState<string[]>([]);
    const streamTextRef = useRef('');

    // WebSocket handler
    const handleWsMessage = useCallback((msg: WsMessage) => {
        switch (msg.type) {
            case 'stream:text':
                streamTextRef.current += msg.data?.text || '';
                setStreamText(streamTextRef.current);
                break;
            case 'stream:thinking':
                setAgentEvents(prev => [...prev, { type: 'thinking', data: msg.data, timestamp: msg.timestamp }]);
                break;
            case 'message':
                setAgentEvents(prev => [...prev, { type: 'message', data: msg.data, timestamp: msg.timestamp }]);
                break;
            case 'tool:start':
                setActiveTools(prev => [...prev, msg.data?.name || 'unknown']);
                setAgentEvents(prev => [...prev, { type: 'tool:start', data: msg.data, timestamp: msg.timestamp }]);
                break;
            case 'tool:complete':
                setActiveTools(prev => prev.filter((_, i) => i !== 0));
                setAgentEvents(prev => [...prev, { type: 'tool:complete', data: msg.data, timestamp: msg.timestamp }]);
                break;
            case 'tool:error':
                setActiveTools(prev => prev.filter((_, i) => i !== 0));
                setAgentEvents(prev => [...prev, { type: 'tool:error', data: msg.data, timestamp: msg.timestamp }]);
                break;
            case 'task:complete':
                setLastResult(msg.data?.result || 'Task completed.');
                setIsRunning(false);
                queryClient.invalidateQueries({ queryKey: ['task-reports'] });
                break;
            case 'task:error':
                setError(msg.data?.error || 'Task failed.');
                setIsRunning(false);
                queryClient.invalidateQueries({ queryKey: ['task-reports'] });
                break;
            case 'interaction_request':
                setPendingPrompt({ id: msg.data?.id, prompt: msg.data?.prompt });
                break;
            case 'retry':
                setAgentEvents(prev => [...prev, { type: 'retry', data: msg.data, timestamp: msg.timestamp }]);
                break;
        }
    }, [queryClient]);

    const { status: wsStatus } = useWebSocket({ onMessage: handleWsMessage });

    const templates = useMemo(() => ([
        { label: 'Summarize Repo', text: 'Summarize the current repository structure and key files.' },
        { label: 'Run Tests', text: 'Run the test suite and report any failures.' },
        { label: 'Explain Changes', text: 'Explain the recent changes in this repo.' },
        { label: 'Plan Tasks', text: 'Create a step-by-step plan to complete this task.' }
    ]), []);

    const loadHistory = () => {
        try {
            const raw = localStorage.getItem('lydia.taskHistory');
            if (!raw) return;
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
                setHistory(parsed.slice(0, 10));
            }
        } catch {
            // ignore storage errors
        }
    };

    const saveHistory = (entry: string) => {
        const trimmed = entry.trim();
        if (!trimmed) return;
        const existing = history.filter(item => item.input !== trimmed);
        const updated = [{ input: trimmed, timestamp: Date.now() }, ...existing].slice(0, 10);
        setHistory(updated);
        try {
            localStorage.setItem('lydia.taskHistory', JSON.stringify(updated));
        } catch {
            // ignore storage errors
        }
    };

    const buildStructuredPrompt = () => {
        const sections: string[] = [];
        if (goal.trim()) {
            sections.push(`Goal: ${goal.trim()}`);
        }
        const constraintList = constraints
            .split(/\n|;/)
            .map(item => item.trim())
            .filter(Boolean);
        if (constraintList.length > 0) {
            sections.push(`Constraints:\n- ${constraintList.join('\n- ')}`);
        }
        const successList = successCriteria
            .split(/\n|;/)
            .map(item => item.trim())
            .filter(Boolean);
        if (successList.length > 0) {
            sections.push(`Success Criteria:\n- ${successList.join('\n- ')}`);
        }
        return sections.join('\n');
    };

    const applyStructuredPrompt = () => {
        const structured = buildStructuredPrompt();
        if (!structured) return;
        setInput((current) => {
            const trimmed = current.trim();
            if (!trimmed) return structured;
            const separator = current.endsWith('\n') ? '\n' : '\n\n';
            return `${current}${separator}${structured}`;
        });
    };

    const clearStructuredPrompt = () => {
        setGoal('');
        setConstraints('');
        setSuccessCriteria('');
    };

    const handleRun = async () => {
        const trimmed = input.trim();
        if (!trimmed) return;
        setIsRunning(true);
        setError(null);
        setWarning(null);
        setLastResult(null);
        setRunId(null);
        setPendingPrompt(null);
        setPromptResponse('');
        setStreamText('');
        streamTextRef.current = '';
        setAgentEvents([]);
        setActiveTools([]);
        saveHistory(trimmed);
        try {
            const result = await api.runTask(trimmed);
            setRunId(result.runId);
        } catch (err: any) {
            setError(err.message || 'Failed to run task.');
            setIsRunning(false);
        } finally {
            // keep running state until task finishes
        }
    };

    const handlePromptSubmit = async () => {
        if (!runId || !pendingPrompt) return;
        try {
            await api.respondToTask(runId, promptResponse || 'yes');
            setPendingPrompt(null);
            setPromptResponse('');
        } catch (err: any) {
            setError(err.message || 'Failed to send response.');
        }
    };

    useEffect(() => {
        loadHistory();
    }, []);

    useEffect(() => {
        if (!runId) return;
        let cancelled = false;
        const poll = async () => {
            try {
                const status = await api.getTaskStatus(runId);
                if (cancelled) return;
                if (status.pendingPrompt) {
                    setPendingPrompt(status.pendingPrompt);
                }
                if (status.status === 'completed') {
                    setLastResult(status.result || 'Task completed.');
                    setIsRunning(false);
                    await queryClient.invalidateQueries({ queryKey: ['task-reports'] });
                    return;
                }
                if (status.status === 'failed') {
                    setError(status.error || status.result || 'Task failed.');
                    setIsRunning(false);
                    await queryClient.invalidateQueries({ queryKey: ['task-reports'] });
                    return;
                }
                setTimeout(poll, 1500);
            } catch (err: any) {
                if (cancelled) return;
                setError(err.message || 'Failed to fetch task status.');
                setIsRunning(false);
            }
        };
        poll();
        return () => {
            cancelled = true;
        };
    }, [runId, queryClient]);

    return (
        <div className="max-w-5xl mx-auto space-y-6">
            <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
                <div className="text-lg font-semibold mb-2">Run a Task</div>
                <div className="text-xs text-gray-500 mb-3">Pick a template or write your own task.</div>
                <div className="flex flex-wrap gap-2 mb-3">
                    {templates.map(template => (
                        <button
                            key={template.label}
                            onClick={() => setInput(template.text)}
                            className="px-3 py-1 rounded-full text-xs border border-gray-200 bg-gray-50 hover:bg-gray-100 text-gray-700"
                        >
                            {template.label}
                        </button>
                    ))}
                </div>
                <textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    rows={4}
                    className="w-full border border-gray-200 rounded-md p-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
                    placeholder="Describe what you want Lydia to do..."
                />
                <div className="flex items-center gap-3 mt-3">
                    <button
                        onClick={handleRun}
                        disabled={isRunning || !input.trim()}
                        className={`px-4 py-2 rounded text-white text-sm ${isRunning || !input.trim() ? 'bg-gray-400' : 'bg-blue-600 hover:bg-blue-700'}`}
                    >
                        {isRunning ? 'Running...' : 'Run Task'}
                    </button>
                    {lastResult && <div className="text-sm text-gray-600">{lastResult}</div>}
                </div>
                {warning && <div className="mt-3 text-sm text-yellow-700 bg-yellow-50 border border-yellow-200 rounded p-2">{warning}</div>}
                {error && <div className="mt-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded p-2">{error}</div>}
            </div>

            <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
                <div className="text-sm font-semibold mb-2">Structured Prompt Assistant</div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div>
                        <div className="text-xs text-gray-500 mb-1">Goal</div>
                        <input
                            value={goal}
                            onChange={(e) => setGoal(e.target.value)}
                            className="w-full border border-gray-200 rounded-md p-2 text-sm"
                            placeholder="What should be achieved?"
                        />
                    </div>
                    <div>
                        <div className="text-xs text-gray-500 mb-1">Constraints</div>
                        <textarea
                            value={constraints}
                            onChange={(e) => setConstraints(e.target.value)}
                            rows={3}
                            className="w-full border border-gray-200 rounded-md p-2 text-sm"
                            placeholder="One per line or separated by semicolons"
                        />
                    </div>
                    <div>
                        <div className="text-xs text-gray-500 mb-1">Success Criteria</div>
                        <textarea
                            value={successCriteria}
                            onChange={(e) => setSuccessCriteria(e.target.value)}
                            rows={3}
                            className="w-full border border-gray-200 rounded-md p-2 text-sm"
                            placeholder="What does success look like?"
                        />
                    </div>
                </div>
                <div className="flex items-center gap-2 mt-3">
                    <button
                        onClick={applyStructuredPrompt}
                        className="px-3 py-2 rounded text-white text-sm bg-blue-600 hover:bg-blue-700"
                    >
                        Apply to Input
                    </button>
                    <button
                        onClick={clearStructuredPrompt}
                        className="px-3 py-2 rounded text-sm text-gray-700 border border-gray-200 hover:bg-gray-50"
                    >
                        Clear
                    </button>
                </div>
            </div>

            {history.length > 0 && (
                <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
                    <div className="text-sm font-semibold mb-2">Recent Tasks</div>
                    <div className="space-y-2">
                        {history.map((item) => (
                            <button
                                key={`${item.input}-${item.timestamp}`}
                                onClick={() => setInput(item.input)}
                                className="w-full text-left text-sm text-gray-700 hover:text-gray-900"
                            >
                                {item.input}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* Real-time Agent Output (P2-4 WebSocket) */}
            {(isRunning || streamText || agentEvents.length > 0) && (
                <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
                    <div className="flex items-center justify-between mb-2">
                        <div className="text-sm font-semibold">
                            {isRunning ? 'Agent Output' : 'Last Run Output'}
                        </div>
                        <div className="flex items-center gap-2">
                            {wsStatus === 'connected' && (
                                <span className="text-xs text-green-600 flex items-center gap-1">
                                    <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
                                    Live
                                </span>
                            )}
                            {wsStatus !== 'connected' && wsStatus !== 'connecting' && (
                                <span className="text-xs text-gray-400">Polling</span>
                            )}
                            {activeTools.length > 0 && (
                                <span className="text-xs text-blue-600">
                                    Running: {activeTools[0]}
                                </span>
                            )}
                        </div>
                    </div>

                    {/* Streamed text */}
                    {streamText && (
                        <div className="bg-gray-50 rounded p-3 mb-2 text-sm whitespace-pre-wrap font-mono max-h-64 overflow-y-auto">
                            {streamText}
                            {isRunning && <span className="animate-pulse">▌</span>}
                        </div>
                    )}

                    {/* Event log */}
                    {agentEvents.length > 0 && (
                        <div className="space-y-1 max-h-48 overflow-y-auto">
                            {agentEvents.slice(-20).map((evt, i) => (
                                <div key={i} className="text-xs text-gray-500 flex items-start gap-2">
                                    <span className="text-gray-300 shrink-0">
                                        {new Date(evt.timestamp).toLocaleTimeString()}
                                    </span>
                                    {evt.type === 'tool:start' && (
                                        <span className="text-blue-600">⚙ {evt.data?.name}</span>
                                    )}
                                    {evt.type === 'tool:complete' && (
                                        <span className="text-green-600">✓ {evt.data?.name} ({evt.data?.duration}ms)</span>
                                    )}
                                    {evt.type === 'tool:error' && (
                                        <span className="text-red-600">✗ {evt.data?.name}: {evt.data?.error}</span>
                                    )}
                                    {evt.type === 'message' && (
                                        <span className="text-gray-700">{evt.data?.text?.substring(0, 100)}</span>
                                    )}
                                    {evt.type === 'thinking' && (
                                        <span className="text-gray-400 italic">thinking...</span>
                                    )}
                                    {evt.type === 'retry' && (
                                        <span className="text-yellow-600">⟳ Retry {evt.data?.attempt}/{evt.data?.maxRetries}</span>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {pendingPrompt && (
                <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
                    <div className="text-sm text-gray-500 mb-2">Confirmation Required</div>
                    <div className="text-sm text-gray-800 whitespace-pre-wrap">{pendingPrompt.prompt}</div>
                    <div className="flex items-center gap-3 mt-3">
                        <input
                            value={promptResponse}
                            onChange={(e) => setPromptResponse(e.target.value)}
                            className="flex-1 border border-gray-200 rounded-md p-2 text-sm"
                            placeholder="Type your response (yes/no/always)..."
                        />
                        <button
                            onClick={handlePromptSubmit}
                            className="px-3 py-2 rounded text-white text-sm bg-blue-600 hover:bg-blue-700"
                        >
                            Send
                        </button>
                    </div>
                </div>
            )}

            <TaskReports />
        </div>
    );
}
