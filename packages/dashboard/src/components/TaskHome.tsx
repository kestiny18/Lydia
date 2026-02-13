import { useCallback, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useWebSocket } from '../lib/useWebSocket';
import { TaskHistoryList } from './TaskHistoryList';
import { TaskDetailView } from './TaskDetailView';
import type { AgentEvent, WsMessage } from '../types';
import { Panel } from './ui/Panel';

export function TaskHome() {
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const queryClient = useQueryClient();

    // ─── Live task state ────────────────────────────────────────────
    const [activeRunId, setActiveRunId] = useState<string | null>(null);
    const [activeInput, setActiveInput] = useState('');
    const [activeStartedAt, setActiveStartedAt] = useState(0);
    const [isRunning, setIsRunning] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [lastResult, setLastResult] = useState<string | null>(null);
    const [pendingPrompt, setPendingPrompt] = useState<{ id: string; prompt: string } | null>(null);
    const [promptResponse, setPromptResponse] = useState('');

    // Streaming state
    const [streamText, setStreamText] = useState('');
    const [agentEvents, setAgentEvents] = useState<AgentEvent[]>([]);
    const [activeTools, setActiveTools] = useState<string[]>([]);
    const streamTextRef = useRef('');

    // ─── WebSocket handler ──────────────────────────────────────────
    const handleWsMessage = useCallback((msg: WsMessage) => {
        switch (msg.type) {
            case 'connected':
                if (msg.data?.activeRunId) {
                    setActiveRunId(msg.data.activeRunId);
                    setIsRunning(true);
                }
                break;
            case 'task:start':
                setActiveRunId(msg.data?.runId || null);
                setIsRunning(true);
                break;
            case 'task:resume':
                setActiveRunId(msg.data?.runId || null);
                setIsRunning(true);
                setAgentEvents(prev => [...prev, {
                    type: 'resume',
                    data: msg.data,
                    timestamp: msg.timestamp,
                }]);
                break;
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
                queryClient.invalidateQueries({ queryKey: ['task-history'] });
                break;
            case 'task:error':
                setError(msg.data?.error || 'Task failed.');
                setIsRunning(false);
                queryClient.invalidateQueries({ queryKey: ['task-history'] });
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

    // ─── Task submission ────────────────────────────────────────────
    const handleSubmitTask = useCallback(async (input: string) => {
        setError(null);
        setLastResult(null);
        setStreamText('');
        streamTextRef.current = '';
        setAgentEvents([]);
        setActiveTools([]);
        setPendingPrompt(null);
        setPromptResponse('');
        setActiveInput(input);
        setActiveStartedAt(Date.now());

        try {
            const result = await api.runTask(input);
            setActiveRunId(result.runId);
            setIsRunning(true);
            // Auto-select the running task
            setSelectedId(result.runId);
        } catch (err: any) {
            setError(err.message || 'Failed to run task.');
            setIsRunning(false);
        }
    }, []);

    // ─── Task resume ──────────────────────────────────────────────
    const handleResumeTask = useCallback(async (taskId: string) => {
        setError(null);
        setLastResult(null);
        setStreamText('');
        streamTextRef.current = '';
        setAgentEvents([]);
        setActiveTools([]);
        setPendingPrompt(null);
        setPromptResponse('');
        setActiveInput('(resumed)');
        setActiveStartedAt(Date.now());

        try {
            const result = await api.resumeTask(taskId);
            setActiveRunId(result.runId);
            setIsRunning(true);
            setSelectedId(result.runId);
            setActiveInput(`Resumed from iteration ${result.fromIteration}`);
        } catch (err: any) {
            setError(err.message || 'Failed to resume task.');
            setIsRunning(false);
        }
    }, []);

    // ─── Interaction response ───────────────────────────────────────
    const handlePromptSubmit = useCallback(async () => {
        if (!activeRunId || !pendingPrompt) return;
        try {
            await api.respondToTask(activeRunId, promptResponse || 'yes');
            setPendingPrompt(null);
            setPromptResponse('');
        } catch (err: any) {
            setError(err.message || 'Failed to send response.');
        }
    }, [activeRunId, pendingPrompt, promptResponse]);

    // ─── Selection handler ──────────────────────────────────────────
    const handleSelect = useCallback((id: string | null) => {
        setSelectedId(id);
        // When selecting a non-active, completed/failed task that was the live one,
        // we should clear live state so it shows as report
        // (live state is still useful while running)
    }, []);

    return (
        <div className="h-full p-6">
            <div className="h-full grid grid-cols-12 gap-4">
                <div className="col-span-12 lg:col-span-4 xl:col-span-3 min-h-0">
                    <Panel
                        title="Work Queue"
                        subtitle="New, running, and historical tasks."
                        className="h-full flex flex-col"
                    >
                        <div className="h-[calc(100vh-210px)]">
                            <TaskHistoryList
                                selectedId={selectedId}
                                onSelect={handleSelect}
                                activeRunId={activeRunId}
                            />
                        </div>
                    </Panel>
                </div>
                <div className="col-span-12 lg:col-span-8 xl:col-span-9 min-h-0">
                    <Panel
                        title={selectedId ? 'Task Detail' : 'Task Composer'}
                        subtitle={selectedId ? 'Live execution, reports, and traces.' : 'Create and run a new task.'}
                        className="h-full flex flex-col"
                    >
                        <div className="h-[calc(100vh-210px)]">
                            <TaskDetailView
                                selectedId={selectedId}
                                isRunning={isRunning && selectedId === activeRunId}
                                onSubmitTask={handleSubmitTask}
                                onResumeTask={handleResumeTask}
                                activeRunId={activeRunId}
                                activeInput={activeInput}
                                activeStartedAt={activeStartedAt}
                                streamText={streamText}
                                agentEvents={agentEvents}
                                activeTools={activeTools}
                                wsStatus={wsStatus}
                                pendingPrompt={pendingPrompt}
                                promptResponse={promptResponse}
                                onPromptResponseChange={setPromptResponse}
                                onPromptSubmit={handlePromptSubmit}
                                lastResult={lastResult}
                                liveError={error}
                            />
                        </div>
                    </Panel>
                </div>
            </div>
        </div>
    );
}
