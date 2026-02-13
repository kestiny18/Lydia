interface StatusPillProps {
    tone: 'running' | 'success' | 'danger' | 'warning' | 'neutral';
    label: string;
}

const toneClass: Record<StatusPillProps['tone'], string> = {
    running: 'bg-[color:var(--info-soft)] text-[color:var(--info)]',
    success: 'bg-[color:var(--success-soft)] text-[color:var(--success)]',
    danger: 'bg-[color:var(--danger-soft)] text-[color:var(--danger)]',
    warning: 'bg-[color:var(--warning-soft)] text-[color:var(--warning)]',
    neutral: 'bg-[color:var(--surface-subtle)] text-[color:var(--text-muted)]',
};

export function StatusPill({ tone, label }: StatusPillProps) {
    return (
        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${toneClass[tone]}`}>
            {label}
        </span>
    );
}

