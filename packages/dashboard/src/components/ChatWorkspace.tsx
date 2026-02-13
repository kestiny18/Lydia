import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { MessageSquare, Send } from 'lucide-react';
import { api } from '../lib/api';
import { Panel } from './ui/Panel';
import { FeedbackState } from './ui/FeedbackState';

type ChatMessage = { role: 'user' | 'assistant'; content: string };

export function ChatWorkspace() {
    const [sessionId, setSessionId] = useState<string | null>(null);
    const [input, setInput] = useState('');
    const [messages, setMessages] = useState<ChatMessage[]>([]);

    const sendMutation = useMutation({
        mutationFn: async (text: string) => {
            let sid = sessionId;
            if (!sid) {
                const created = await api.startChatSession();
                sid = created.sessionId;
                setSessionId(sid);
            }
            return api.sendChatMessage(sid, text);
        },
        onMutate: (text) => {
            setMessages((prev) => [...prev, { role: 'user', content: text }]);
        },
        onSuccess: (data) => {
            setMessages((prev) => [...prev, { role: 'assistant', content: data.response || '' }]);
        },
    });

    const submit = async () => {
        const text = input.trim();
        if (!text || sendMutation.isPending) return;
        setInput('');
        await sendMutation.mutateAsync(text);
    };

    return (
        <div className="h-full p-6">
            <Panel
                title="Chat Workspace"
                subtitle="Multi-turn assistant session for exploration and follow-up questions."
                className="h-full flex flex-col"
            >
                <div className="flex-1 min-h-0 overflow-y-auto space-y-3 pr-1">
                    {messages.length === 0 && (
                        <FeedbackState
                            type="empty"
                            title="No messages yet"
                            message="Start with a short request. A chat session will be created automatically."
                        />
                    )}
                    {messages.map((m, i) => (
                        <div
                            key={`${m.role}-${i}`}
                            className={`rounded-xl px-3 py-2 text-sm leading-relaxed ${
                                m.role === 'user'
                                    ? 'bg-[color:var(--surface-accent)] border border-[color:var(--line-strong)]'
                                    : 'bg-[color:var(--surface-subtle)] border border-[color:var(--line)]'
                            }`}
                        >
                            <div className="text-[11px] font-semibold uppercase tracking-wide mb-1 text-[color:var(--text-muted)]">
                                {m.role}
                            </div>
                            <div className="text-[color:var(--text-strong)] whitespace-pre-wrap">{m.content}</div>
                        </div>
                    ))}
                    {sendMutation.isPending && (
                        <FeedbackState type="loading" title="Lydia is thinking..." />
                    )}
                    {sendMutation.isError && (
                        <FeedbackState
                            type="error"
                            title="Chat request failed"
                            message={(sendMutation.error as Error).message}
                        />
                    )}
                </div>

                <div className="pt-4 mt-4 border-t border-[color:var(--line)]">
                    <div className="flex items-end gap-2">
                        <div className="relative flex-1">
                            <MessageSquare size={14} className="absolute left-3 top-3 text-[color:var(--text-muted)]" />
                            <textarea
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                rows={3}
                                onKeyDown={(e) => {
                                    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                                        e.preventDefault();
                                        submit();
                                    }
                                }}
                                className="w-full rounded-xl border border-[color:var(--line)] bg-white pl-8 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[color:var(--ring)]"
                                placeholder="Ask Lydia anything about your task..."
                            />
                        </div>
                        <button
                            onClick={submit}
                            disabled={sendMutation.isPending || !input.trim()}
                            className="h-10 px-4 rounded-xl bg-[color:var(--accent)] text-white text-sm font-medium hover:brightness-95 disabled:opacity-50 disabled:cursor-not-allowed"
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

