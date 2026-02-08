import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { TaskReports } from './TaskReports';

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
        if (structured) {
            setInput(structured);
        }
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
