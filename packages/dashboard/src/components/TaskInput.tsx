import { useMemo, useState } from 'react';
import { Plus, Sparkles, X } from 'lucide-react';

interface TaskInputProps {
    onSubmit: (input: string) => void;
    isRunning: boolean;
}

export function TaskInput({ onSubmit, isRunning }: TaskInputProps) {
    const [input, setInput] = useState('');
    const [showStructured, setShowStructured] = useState(false);
    const [goal, setGoal] = useState('');
    const [constraints, setConstraints] = useState('');
    const [successCriteria, setSuccessCriteria] = useState('');

    const templates = useMemo(() => ([
        { label: 'Summarize Repo', text: 'Summarize the current repository structure and key files.' },
        { label: 'Run Tests', text: 'Run the test suite and report any failures.' },
        { label: 'Explain Changes', text: 'Explain the recent changes in this repo.' },
        { label: 'Plan Tasks', text: 'Create a step-by-step plan to complete this task.' },
    ]), []);

    const buildStructuredPrompt = () => {
        const sections: string[] = [];
        if (goal.trim()) {
            sections.push(`Goal: ${goal.trim()}`);
        }
        const constraintList = constraints.split(/\n|;/).map(i => i.trim()).filter(Boolean);
        if (constraintList.length > 0) {
            sections.push(`Constraints:\n- ${constraintList.join('\n- ')}`);
        }
        const successList = successCriteria.split(/\n|;/).map(i => i.trim()).filter(Boolean);
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
        setShowStructured(false);
    };

    const handleSubmit = () => {
        const trimmed = input.trim();
        if (!trimmed || isRunning) return;
        onSubmit(trimmed);
        setInput('');
        setGoal('');
        setConstraints('');
        setSuccessCriteria('');
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            handleSubmit();
        }
    };

    return (
        <div className="flex flex-col h-full">
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
                <div>
                    <h2 className="text-lg font-semibold text-gray-900">New Task</h2>
                    <p className="text-xs text-gray-500 mt-0.5">Describe what you want Lydia to do</p>
                </div>
                <button
                    onClick={() => setShowStructured(!showStructured)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
                >
                    <Sparkles size={14} />
                    Structured Prompt
                </button>
            </div>

            {/* Templates */}
            <div className="flex flex-wrap gap-2 mb-3">
                {templates.map(template => (
                    <button
                        key={template.label}
                        onClick={() => setInput(template.text)}
                        className="px-3 py-1 rounded-full text-xs border border-gray-200 bg-gray-50 hover:bg-gray-100 text-gray-600 transition-colors"
                    >
                        {template.label}
                    </button>
                ))}
            </div>

            {/* Structured Prompt Assistant */}
            {showStructured && (
                <div className="bg-gray-50 rounded-lg border border-gray-200 p-4 mb-3">
                    <div className="flex items-center justify-between mb-3">
                        <span className="text-sm font-medium text-gray-700">Structured Prompt</span>
                        <button onClick={() => setShowStructured(false)} className="text-gray-400 hover:text-gray-600">
                            <X size={14} />
                        </button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div>
                            <label className="text-xs text-gray-500 mb-1 block">Goal</label>
                            <input
                                value={goal}
                                onChange={(e) => setGoal(e.target.value)}
                                className="w-full border border-gray-200 rounded-md p-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-200"
                                placeholder="What should be achieved?"
                            />
                        </div>
                        <div>
                            <label className="text-xs text-gray-500 mb-1 block">Constraints</label>
                            <textarea
                                value={constraints}
                                onChange={(e) => setConstraints(e.target.value)}
                                rows={2}
                                className="w-full border border-gray-200 rounded-md p-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-200"
                                placeholder="One per line or semicolons"
                            />
                        </div>
                        <div>
                            <label className="text-xs text-gray-500 mb-1 block">Success Criteria</label>
                            <textarea
                                value={successCriteria}
                                onChange={(e) => setSuccessCriteria(e.target.value)}
                                rows={2}
                                className="w-full border border-gray-200 rounded-md p-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-200"
                                placeholder="What does success look like?"
                            />
                        </div>
                    </div>
                    <button
                        onClick={applyStructuredPrompt}
                        className="mt-3 px-3 py-1.5 rounded text-xs text-white bg-blue-600 hover:bg-blue-700 transition-colors"
                    >
                        Apply to Input
                    </button>
                </div>
            )}

            {/* Main Input */}
            <div className="flex-1 flex flex-col">
                <textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    rows={6}
                    className="flex-1 min-h-[120px] w-full border border-gray-200 rounded-lg p-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 resize-none"
                    placeholder="Describe what you want Lydia to do..."
                />
                <div className="flex items-center justify-between mt-3">
                    <span className="text-xs text-gray-400">
                        {navigator.platform.includes('Mac') ? '⌘' : 'Ctrl'}+Enter to submit
                    </span>
                    <button
                        onClick={handleSubmit}
                        disabled={isRunning || !input.trim()}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-medium transition-colors ${
                            isRunning || !input.trim()
                                ? 'bg-gray-300 cursor-not-allowed'
                                : 'bg-blue-600 hover:bg-blue-700 shadow-sm'
                        }`}
                    >
                        <Plus size={16} />
                        {isRunning ? 'Running...' : 'Run Task'}
                    </button>
                </div>
            </div>
        </div>
    );
}
