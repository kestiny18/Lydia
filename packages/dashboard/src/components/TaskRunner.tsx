import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { TaskReports } from './TaskReports';

export function TaskRunner() {
    const [input, setInput] = useState('');
    const [isRunning, setIsRunning] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [warning, setWarning] = useState<string | null>(null);
    const [lastResult, setLastResult] = useState<string | null>(null);
    const queryClient = useQueryClient();

    const handleRun = async () => {
        const trimmed = input.trim();
        if (!trimmed) return;
        setIsRunning(true);
        setError(null);
        setWarning(null);
        setLastResult(null);
        try {
            const result = await api.runTask(trimmed);
            setLastResult(result.task?.result || 'Task completed.');
            if (result.warning) setWarning(result.warning);
            await queryClient.invalidateQueries({ queryKey: ['task-reports'] });
        } catch (err: any) {
            setError(err.message || 'Failed to run task.');
        } finally {
            setIsRunning(false);
        }
    };

    return (
        <div className="max-w-5xl mx-auto space-y-6">
            <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
                <div className="text-lg font-semibold mb-2">Run a Task</div>
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

            <TaskReports />
        </div>
    );
}

