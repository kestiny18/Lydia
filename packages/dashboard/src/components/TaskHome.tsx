import { useCallback, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useWebSocket } from '../lib/useWebSocket';
import { TaskHistoryList } from './TaskHistoryList';
import { TaskDetailView } from './TaskDetailView';
import type { AgentEvent, WsMessage } from '../types';
import { Panel } from './ui/Panel';

interface TaskHomeProps {
    onContinueInChat?: (seedText: string) => void;
}

export function TaskHome({ onContinueInChat }: TaskHomeProps) {
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const queryClient = useQueryClient();

    const [activeRunId, setActiveRunId] = useState<string | null>(null);
    const [activeInput, setActiveInput] = useState('');
    const [activeStartedAt, setActiveStartedAt] = useState(0);
    const [isRunning, setIsRunning] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [lastResult, setLastResult] = useState<string | null>(null);
    const [pendingPrompt, setPendingPrompt] = useState<{ id: string; prompt: string } | null>(null);
    const [promptResponse, setPromptResponse] = useState('');

    const [streamText, setStreamText] = useState('');
    const [agentEvents, setAgentEvents] = useState<AgentEvent[]>([]);
    const [activeToolCounts, setActiveToolCounts] = useState<Record<string, number>>({});
    const streamTextRef = useRef('');

    const activeTools = useMemo(
        () => Object.entries(activeToolCounts).filter(([, count]) => count > 0).map(([name]) => name),
        [activeToolCounts]
    );

    const mutateToolCount = useCallback((name: string, delta: number) => {
        setActiveToolCounts((prev) => {
            const next = { ...prev };
            const current = next[name] || 0;
            const updated = Math.max(0, current + delta);
            if (updated === 0) {
                delete next[name];
            } else {
                next[name] = updated;
            }
            return next;
        });
    }, []);

    const refreshTaskQueries = useCallback(() => {
        queryClient.invalidateQueries({ queryKey: ['task-history'] });
        queryClient.invalidateQueries({ queryKey: ['task-detail'] });
        queryClient.invalidateQueries({ queryKey: ['resumable-tasks'] });
        queryClient.invalidateQueries({ queryKey: ['memory-reports-summary'] });
    }, [queryClient]);

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
                setActiveInput(msg.data?.description || activeInput);
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
            case 'tool:start': {
                const toolName = msg.data?.name || 'unknown';
                mutateToolCount(toolName, 1);
                setAgentEvents(prev => [...prev, { type: 'tool:start', data: msg.data, timestamp: msg.timestamp }]);
                break;
            }
            case 'tool:complete': {
                const toolName = msg.data?.name || 'unknown';
                mutateToolCount(toolName, -1);
                setAgentEvents(prev => [...prev, { type: 'tool:complete', data: msg.data, timestamp: msg.timestamp }]);
                break;
            }
            case 'tool:error': {
                const toolName = msg.data?.name || 'unknown';
                mutateToolCount(toolName, -1);
                setAgentEvents(prev => [...prev, { type: 'tool:error', data: msg.data, timestamp: msg.timestamp }]);
                break;
            }
            case 'task:complete':
                setLastResult(msg.data?.result || 'Task completed.');
                setIsRunning(false);
                refreshTaskQueries();
                break;
            case 'task:error':
                setError(msg.data?.error || 'Task failed.');
                setIsRunning(false);
                refreshTaskQueries();
                break;
            case 'interaction_request':
                setPendingPrompt({ id: msg.data?.id, prompt: msg.data?.prompt });
                break;
            case 'retry':
                setAgentEvents(prev => [...prev, { type: 'retry', data: msg.data, timestamp: msg.timestamp }]);
                break;
            default:
                break;
        }
    }, [activeInput, mutateToolCount, refreshTaskQueries]);

    const { status: wsStatus } = useWebSocket({ onMessage: handleWsMessage });

    const resetLiveState = useCallback(() => {
        setError(null);
        setLastResult(null);
        setStreamText('');
        streamTextRef.current = '';
        setAgentEvents([]);
        setActiveToolCounts({});
        setPendingPrompt(null);
        setPromptResponse('');
    }, []);

    const handleSubmitTask = useCallback(async (input: string) => {
        resetLiveState();
        setActiveInput(input);
        setActiveStartedAt(Date.now());

        try {
            const result = await api.runTask(input);
            setActiveRunId(result.runId);
            setIsRunning(true);
            setSelectedId(result.runId);
        } catch (err: any) {
            setError(err.message || 'Failed to run task.');
            setIsRunning(false);
        }
    }, [resetLiveState]);

    const handleResumeTask = useCallback(async (taskId: string) => {
        resetLiveState();
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
    }, [resetLiveState]);

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

    const handleSelect = useCallback((id: string | null) => {
        setSelectedId(id);
    }, []);

    return (
        <div className="h-full p-6">
            <div className="h-full grid grid-cols-12 gap-4">
                <div className="col-span-12 lg:col-span-4 xl:col-span-3 min-h-0">
                    <Panel
                        title="Task Queue"
                        subtitle="Create, run, and inspect tracked tasks."
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
                        subtitle={selectedId ? 'Structured execution, report, and resume flow.' : 'Define what Lydia should execute.'}
                        className="h-full flex flex-col"
                    >
                        <div className="h-[calc(100vh-210px)]">
                            <TaskDetailView
                                selectedId={selectedId}
                                isRunning={isRunning && selectedId === activeRunId}
                                onSubmitTask={handleSubmitTask}
                                onResumeTask={handleResumeTask}
                                onContinueInChat={onContinueInChat}
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
