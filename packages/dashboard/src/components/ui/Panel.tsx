import type { ReactNode } from 'react';

type Tone = 'default' | 'subtle' | 'accent';

interface PanelProps {
    title?: string;
    subtitle?: string;
    actions?: ReactNode;
    children: ReactNode;
    tone?: Tone;
    className?: string;
}

const toneClass: Record<Tone, string> = {
    default: 'bg-white border border-[color:var(--line)] shadow-[var(--shadow-soft)]',
    subtle: 'bg-[color:var(--surface-subtle)] border border-[color:var(--line)]',
    accent: 'bg-[color:var(--surface-accent)] border border-[color:var(--line-strong)] shadow-[var(--shadow-soft)]',
};

export function Panel({ title, subtitle, actions, children, tone = 'default', className = '' }: PanelProps) {
    return (
        <section className={`rounded-2xl ${toneClass[tone]} ${className}`}>
            {(title || subtitle || actions) && (
                <header className="flex items-start justify-between gap-4 p-4 border-b border-[color:var(--line)]">
                    <div>
                        {title && <h3 className="text-sm font-semibold text-[color:var(--text-strong)]">{title}</h3>}
                        {subtitle && <p className="text-xs text-[color:var(--text-muted)] mt-1">{subtitle}</p>}
                    </div>
                    {actions && <div>{actions}</div>}
                </header>
            )}
            <div className="p-4">{children}</div>
        </section>
    );
}

