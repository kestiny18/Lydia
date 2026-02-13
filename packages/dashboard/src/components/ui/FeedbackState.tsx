import { AlertTriangle, Loader2, SearchX } from 'lucide-react';

interface FeedbackStateProps {
    type: 'loading' | 'empty' | 'error';
    title: string;
    message?: string;
}

export function FeedbackState({ type, title, message }: FeedbackStateProps) {
    const icon = type === 'loading'
        ? <Loader2 size={18} className="animate-spin text-[color:var(--accent)]" />
        : type === 'error'
            ? <AlertTriangle size={18} className="text-[color:var(--danger)]" />
            : <SearchX size={18} className="text-[color:var(--text-muted)]" />;

    return (
        <div className="rounded-xl border border-dashed border-[color:var(--line)] px-4 py-6 text-center bg-[color:var(--surface-subtle)]">
            <div className="flex justify-center mb-2">{icon}</div>
            <div className="text-sm font-medium text-[color:var(--text-strong)]">{title}</div>
            {message && <p className="text-xs text-[color:var(--text-muted)] mt-1">{message}</p>}
        </div>
    );
}

