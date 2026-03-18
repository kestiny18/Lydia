import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Brain, Check, ChevronDown, Copy, MessageSquare, RotateCcw, Send } from 'lucide-react';
import { api } from '../lib/api';
import { useWebSocket } from '../lib/useWebSocket';
import type { WsMessage } from '../types';
import { Panel } from './ui/Panel';
import { FeedbackState } from './ui/FeedbackState';

type ChatMessage = {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    createdAt: string;
    thinking?: string;
    thinkingCollapsed?: boolean;
    status?: 'streaming' | 'complete' | 'error';
};

interface ChatWorkspaceProps {
    seedMessage?: string;
    seedToken?: number;
}

interface PersistedChatState {
    sessionId: string | null;
    input: string;
    messages: ChatMessage[];
}

interface SoulProfile {
    userDisplayName?: string;
    assistantDisplayName?: string;
    updatedAt?: string;
}

const STORAGE_KEY = 'lydia.dashboard.chat.workspace';

function createId(prefix: string) {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function isSessionNotFoundError(error: unknown): boolean {
    return error instanceof Error && error.message.trim().toLowerCase() === 'session not found';
}

function containsCjk(text: string): boolean {
    return /[\u3400-\u9fff]/.test(text);
}

function formatMessageTime(isoString: string): string {
    const date = new Date(isoString);
    if (Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat('zh-CN', {
        hour: '2-digit',
        minute: '2-digit',
    }).format(date);
}

function mergeErrorContent(existingContent: string, errorMessage: string): string {
    const trimmedExisting = existingContent.trim();
    const trimmedError = errorMessage.trim();
    if (!trimmedExisting) return `执行失败：${trimmedError}`;
    if (trimmedExisting.includes(trimmedError)) return trimmedExisting;
    return `${trimmedExisting}\n\n执行失败：${trimmedError}`;
}

function loadPersistedState(): PersistedChatState {
    if (typeof window === 'undefined') {
        return { sessionId: null, input: '', messages: [] };
    }

    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw) return { sessionId: null, input: '', messages: [] };
        const parsed = JSON.parse(raw) as Partial<PersistedChatState>;
        return {
            sessionId: typeof parsed.sessionId === 'string' ? parsed.sessionId : null,
            input: typeof parsed.input === 'string' ? parsed.input : '',
            messages: Array.isArray(parsed.messages)
                ? parsed.messages.map((message) => ({
                      id: typeof message?.id === 'string' ? message.id : createId('msg'),
                      role: message?.role === 'assistant' ? 'assistant' : 'user',
                      content: typeof message?.content === 'string' ? message.content : '',
                      createdAt:
                          typeof message?.createdAt === 'string' && message.createdAt
                              ? message.createdAt
                              : new Date().toISOString(),
                      thinking: typeof message?.thinking === 'string' ? message.thinking : undefined,
                      thinkingCollapsed:
                          typeof message?.thinkingCollapsed === 'boolean' ? message.thinkingCollapsed : true,
                      status: message?.status === 'streaming' || message?.status === 'error' ? message.status : 'complete',
                  }))
                : [],
        };
    } catch {
        return { sessionId: null, input: '', messages: [] };
    }
}

export function ChatWorkspace({ seedMessage, seedToken }: ChatWorkspaceProps) {
    const persisted = useMemo(() => loadPersistedState(), []);
    const [sessionId, setSessionId] = useState<string | null>(persisted.sessionId);
    const [input, setInput] = useState(persisted.input);
    const [messages, setMessages] = useState<ChatMessage[]>(persisted.messages);
    const [isSending, setIsSending] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [pendingAssistantId, setPendingAssistantId] = useState<string | null>(null);
    const [soul, setSoul] = useState<SoulProfile | null>(null);
    const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
    const messagesRef = useRef<HTMLDivElement>(null);
    const pendingAssistantIdRef = useRef<string | null>(null);
    const sessionIdRef = useRef<string | null>(persisted.sessionId);

    useEffect(() => {
        pendingAssistantIdRef.current = pendingAssistantId;
    }, [pendingAssistantId]);

    useEffect(() => {
        sessionIdRef.current = sessionId;
    }, [sessionId]);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        window.localStorage.setItem(
            STORAGE_KEY,
            JSON.stringify({
                sessionId,
                input,
                messages,
            } satisfies PersistedChatState)
        );
    }, [input, messages, sessionId]);

    useEffect(() => {
        if (!seedMessage || !seedToken) return;
        setInput(seedMessage);
    }, [seedMessage, seedToken]);

    useEffect(() => {
        api.getSoul().then(setSoul).catch(() => {});
    }, []);

    useEffect(() => {
        if (!messagesRef.current) return;
        messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
    }, [messages, isSending]);

    useEffect(() => {
        if (!copiedMessageId) return;
        const timer = window.setTimeout(() => setCopiedMessageId(null), 1800);
        return () => window.clearTimeout(timer);
    }, [copiedMessageId]);

    const updateMessage = useCallback((messageId: string, updater: (message: ChatMessage) => ChatMessage) => {
        setMessages((prev) => prev.map((message) => (message.id === messageId ? updater(message) : message)));
    }, []);

    const ensureSession = useCallback(async () => {
        if (sessionId) return sessionId;
        const created = await api.startChatSession();
        sessionIdRef.current = created.sessionId;
        setSessionId(created.sessionId);
        return created.sessionId;
    }, [sessionId]);

    const resetSession = useCallback(() => {
        sessionIdRef.current = null;
        setSessionId(null);
    }, []);

    const handleWsMessage = useCallback((message: WsMessage) => {
        const targetSessionId = message.data?.sessionId;
        const assistantId = pendingAssistantIdRef.current;
        if (!assistantId || !targetSessionId || targetSessionId !== sessionIdRef.current) return;

        if (message.type === 'chat:stream:text') {
            updateMessage(assistantId, (entry) => ({
                ...entry,
                content: `${entry.content}${message.data?.text || ''}`,
                status: 'streaming',
            }));
            return;
        }

        if (message.type === 'chat:stream:thinking' || message.type === 'chat:thinking') {
            const delta = typeof message.data?.thinking === 'string' ? message.data.thinking : '';
            if (!delta) return;
            updateMessage(assistantId, (entry) => ({
                ...entry,
                thinking: `${entry.thinking || ''}${delta}`,
                thinkingCollapsed: entry.thinkingCollapsed ?? true,
                status: entry.status ?? 'streaming',
            }));
            return;
        }

        if (message.type === 'chat:message') {
            const text = typeof message.data?.text === 'string' ? message.data.text : '';
            if (!text) return;
            updateMessage(assistantId, (entry) => ({
                ...entry,
                content: entry.content || text,
                status: 'streaming',
            }));
        }
    }, [updateMessage]);

    const { status: wsStatus } = useWebSocket({ onMessage: handleWsMessage });

    const toggleThinking = useCallback((messageId: string) => {
        updateMessage(messageId, (message) => ({
            ...message,
            thinkingCollapsed: !(message.thinkingCollapsed ?? true),
        }));
    }, [updateMessage]);

    const handleCopyMessage = useCallback(async (message: ChatMessage) => {
        const payload = message.content.trim();
        if (!payload) return;
        try {
            await navigator.clipboard.writeText(payload);
            setCopiedMessageId(message.id);
        } catch {
            setCopiedMessageId(null);
        }
    }, []);

    const startFresh = useCallback(() => {
        resetSession();
        setMessages([]);
        setError(null);
        setInput('');
    }, [resetSession]);

    const submit = useCallback(async () => {
        const text = input.trim();
        if (!text || isSending) return;

        const now = new Date().toISOString();
        const userMessage: ChatMessage = {
            id: createId('user'),
            role: 'user',
            content: text,
            createdAt: now,
            status: 'complete',
        };
        const assistantMessage: ChatMessage = {
            id: createId('assistant'),
            role: 'assistant',
            content: '',
            createdAt: now,
            thinking: '',
            thinkingCollapsed: true,
            status: 'streaming',
        };

        setError(null);
        setIsSending(true);
        setInput('');
        setPendingAssistantId(assistantMessage.id);
        setMessages((prev) => [...prev, userMessage, assistantMessage]);

        try {
            let activeSessionId = await ensureSession();
            let result;
            try {
                result = await api.sendChatMessage(activeSessionId, text);
            } catch (err) {
                if (!isSessionNotFoundError(err)) throw err;
                resetSession();
                activeSessionId = await api.startChatSession().then((created) => {
                    sessionIdRef.current = created.sessionId;
                    setSessionId(created.sessionId);
                    return created.sessionId;
                });
                result = await api.sendChatMessage(activeSessionId, text);
            }

            updateMessage(assistantMessage.id, (message) => ({
                ...message,
                content: message.content || result.response || '',
                status: 'complete',
            }));
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to send chat message';
            setError(message);
            updateMessage(assistantMessage.id, (entry) => ({
                ...entry,
                content: mergeErrorContent(entry.content, message),
                status: 'error',
            }));
        } finally {
            api.getSoul().then(setSoul).catch(() => {});
            setIsSending(false);
            setPendingAssistantId(null);
        }
    }, [ensureSession, input, isSending, resetSession, updateMessage]);

    const getDisplayName = useCallback((message: ChatMessage) => {
        if (message.role === 'assistant') {
            return soul?.assistantDisplayName || 'Lydia';
        }
        return soul?.userDisplayName || (containsCjk(message.content) ? '老板' : 'Boss');
    }, [soul]);

    return (
        <div className="h-full px-7 py-5 overflow-hidden">
            <Panel
                title="聊天"
                subtitle="用于快速干预的直接对话窗口。名字、会话和思考过程会在这里持续保留。"
                className="h-full flex flex-col"
                contentClassName="flex-1 flex flex-col min-h-0"
                actions={
                    <div className="flex items-center gap-2">
                        <div className="rounded-2xl border border-[color:var(--line)] bg-white px-3 py-2 text-xs text-[color:var(--text-strong)]">
                            Main Session
                        </div>
                        <button
                            type="button"
                            onClick={startFresh}
                            className="h-10 w-10 rounded-xl border border-[color:var(--line)] bg-white text-[color:var(--text-muted)] grid place-items-center hover:border-[color:var(--line-strong)]"
                            title="Start fresh"
                        >
                            <RotateCcw size={15} />
                        </button>
                        <div className="rounded-2xl border border-[color:var(--line)] bg-white px-3 py-2 text-xs text-[color:var(--text-muted)]">
                            {wsStatus === 'connected' ? 'Live' : 'Offline'}
                        </div>
                    </div>
                }
            >
                <div
                    ref={messagesRef}
                    className="flex-1 min-h-0 overflow-y-auto pr-2"
                    style={{ scrollbarGutter: 'stable' }}
                >
                    {messages.length === 0 ? (
                        <div className="mx-auto max-w-5xl py-8">
                            <FeedbackState
                                type="empty"
                                title="No messages yet"
                                message="Start with a short request. Lydia will create a new live session automatically."
                            />
                        </div>
                    ) : (
                        <div className="mx-auto max-w-5xl space-y-5 pb-6">
                            {messages.map((message) => {
                                const canCopy = message.content.trim().length > 0;
                                const copied = copiedMessageId === message.id;
                                return (
                                    <div
                                        key={message.id}
                                        className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                                    >
                                        <div
                                            tabIndex={0}
                                            className={`group relative w-full max-w-[78%] rounded-[28px] border px-5 py-4 text-sm leading-relaxed shadow-[0_10px_30px_rgba(15,23,42,0.04)] focus:outline-none focus:ring-2 focus:ring-[color:var(--ring)] ${
                                                message.role === 'user'
                                                    ? 'bg-[#f4f7ff] border-[#cfdcff]'
                                                    : 'bg-white border-[color:var(--line)]'
                                            }`}
                                        >
                                            <button
                                                type="button"
                                                onClick={() => void handleCopyMessage(message)}
                                                disabled={!canCopy}
                                                className={`absolute top-4 ${message.role === 'user' ? 'left-4' : 'right-4'} inline-flex h-8 items-center gap-1 rounded-full border border-[color:var(--line)] bg-white/95 px-2.5 text-[11px] font-medium text-[color:var(--text-muted)] shadow-sm transition-opacity hover:border-[color:var(--line-strong)] hover:text-[color:var(--text-strong)] focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-[color:var(--ring)] disabled:cursor-not-allowed disabled:opacity-0 ${canCopy ? 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100' : 'opacity-0'}`}
                                                title="Copy message"
                                            >
                                                {copied ? <Check size={13} /> : <Copy size={13} />}
                                                <span>{copied ? 'Copied' : 'Copy'}</span>
                                            </button>

                                            <div className={`mb-3 flex items-center gap-3 text-[11px] text-[color:var(--text-muted)] ${message.role === 'user' ? 'justify-end pr-14' : 'justify-between pr-14'}`}>
                                                <span className="font-semibold uppercase tracking-[0.14em]">
                                                    {getDisplayName(message)}
                                                </span>
                                                <span>{formatMessageTime(message.createdAt)}</span>
                                            </div>

                                            {message.thinking && (
                                                <div className="mb-3 rounded-2xl border border-[color:var(--line)] bg-[color:var(--surface-subtle)]">
                                                    <button
                                                        type="button"
                                                        onClick={() => toggleThinking(message.id)}
                                                        className="w-full px-4 py-3 flex items-center justify-between text-left text-xs text-[color:var(--text-muted)]"
                                                    >
                                                        <span className="inline-flex items-center gap-1.5">
                                                            <Brain size={12} />
                                                            Thought Process
                                                        </span>
                                                        <ChevronDown
                                                            size={14}
                                                            className={`transition-transform ${message.thinkingCollapsed ? '' : 'rotate-180'}`}
                                                        />
                                                    </button>
                                                    {!message.thinkingCollapsed && (
                                                        <div className="px-4 pb-4 text-xs leading-6 text-[color:var(--text-muted)] whitespace-pre-wrap border-t border-[color:var(--line)]">
                                                            {message.thinking}
                                                        </div>
                                                    )}
                                                </div>
                                            )}

                                            <div className="text-[color:var(--text-strong)] whitespace-pre-wrap min-h-[1.25rem]">
                                                {message.content}
                                                {message.status === 'streaming' && <span className="animate-pulse text-[color:var(--accent)]">...</span>}
                                            </div>
                                            {message.status === 'error' && (
                                                <div className="mt-3 text-xs font-medium text-red-600">
                                                    Failed
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {error && (
                    <div className="mt-4 mx-auto w-full max-w-5xl">
                        <FeedbackState type="error" title="Chat request failed" message={error} />
                    </div>
                )}

                <div className="pt-5 mt-5 border-t border-[color:var(--line)] shrink-0">
                    <div className="mx-auto max-w-5xl flex items-end gap-3">
                        <div className="relative flex-1">
                            <MessageSquare size={14} className="absolute left-4 top-4 text-[color:var(--text-muted)]" />
                            <textarea
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                rows={3}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault();
                                        submit();
                                    }
                                }}
                                className="w-full rounded-[26px] border border-[color:var(--line)] bg-white pl-10 pr-4 py-4 text-sm focus:outline-none focus:ring-2 focus:ring-[color:var(--ring)] resize-none shadow-[0_16px_40px_rgba(15,23,42,0.06)]"
                                placeholder="Message Lydia here..."
                            />
                            <div className="mt-2 pl-1 text-[11px] text-[color:var(--text-muted)]">
                                Enter to send, Shift+Enter for line breaks
                            </div>
                        </div>
                        <button
                            onClick={submit}
                            disabled={isSending || !input.trim()}
                            className="h-12 px-6 rounded-2xl bg-[#df3b31] text-white text-sm font-semibold hover:brightness-95 disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_16px_30px_rgba(223,59,49,0.24)]"
                        >
                            <span className="inline-flex items-center gap-1.5">
                                <Send size={14} />
                                Send
                            </span>
                        </button>
                    </div>
                </div>
            </Panel>
        </div>
    );
}
