import { TaskInput } from './TaskInput';
import { TaskLiveView } from './TaskLiveView';
import { TaskReportView } from './TaskReportView';
import type { AgentEvent } from '../types';

interface TaskDetailViewProps {
    /** null = new task mode, runId = live/completed task */
    selectedId: string | null;
    /** Whether the selected task is the currently running one */
    isRunning: boolean;
    /** Callbacks for new task submission */
    onSubmitTask: (input: string) => void;
    /** Callback to resume an interrupted task from checkpoint */
    onResumeTask?: (taskId: string) => void;
    /** Callback to move from task workflow to chat workflow with task context */
    onContinueInChat?: (seedText: string) => void;

    // Live task state (passed through from parent)
    activeRunId: string | null;
    activeInput: string;
    activeStartedAt: number;
    streamText: string;
    agentEvents: AgentEvent[];
    activeTools: string[];
    wsStatus: string;
    pendingPrompt: { id: string; prompt: string } | null;
    promptResponse: string;
    onPromptResponseChange: (value: string) => void;
    onPromptSubmit: () => void;
    lastResult: string | null;
    liveError: string | null;
}

export function TaskDetailView({
    selectedId,
    isRunning,
    onSubmitTask,
    onResumeTask,
    onContinueInChat,
    activeRunId,
    activeInput,
    activeStartedAt,
    streamText,
    agentEvents,
    activeTools,
    wsStatus,
    pendingPrompt,
    promptResponse,
    onPromptResponseChange,
    onPromptSubmit,
    lastResult,
    liveError,
}: TaskDetailViewProps) {
    // Mode A: New task (no selection)
    if (selectedId === null) {
        return (
            <div className="h-full">
                <TaskInput onSubmit={onSubmitTask} isRunning={!!activeRunId} />
            </div>
        );
    }

    // Mode B: Running task (selected ID matches active run)
    if (selectedId === activeRunId && activeRunId) {
        return (
            <div className="h-full">
                <TaskLiveView
                    runId={activeRunId}
                    input={activeInput}
                    startedAt={activeStartedAt}
                    streamText={streamText}
                    agentEvents={agentEvents}
                    activeTools={activeTools}
                    isRunning={isRunning}
                    wsStatus={wsStatus}
                    pendingPrompt={pendingPrompt}
                    promptResponse={promptResponse}
                    onPromptResponseChange={onPromptResponseChange}
                    onPromptSubmit={onPromptSubmit}
                    lastResult={lastResult}
                    error={liveError}
                    onContinueInChat={onContinueInChat}
                />
            </div>
        );
    }

    // Mode C: Completed/historical task (or resumable)
    return (
        <div className="h-full overflow-auto">
            <TaskReportView
                taskId={selectedId}
                onResumeTask={onResumeTask}
                onContinueInChat={onContinueInChat}
            />
        </div>
    );
}
