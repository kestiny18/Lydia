import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';

const statusStyles: Record<string, string> = {
    pending_human: 'bg-yellow-100 text-yellow-800',
    approved: 'bg-green-100 text-green-800',
    rejected: 'bg-red-100 text-red-800',
    invalid: 'bg-gray-100 text-gray-600'
};

export function EvolutionHistory() {
    const { data: proposals, isLoading, error } = useQuery({
        queryKey: ['strategy-proposals'],
        queryFn: () => api.getProposals(200)
    });

    const parseEvaluation = (raw?: string | null) => {
        if (!raw) return null;
        try {
            return JSON.parse(raw);
        } catch {
            return null;
        }
    };

    const sorted = (proposals || []).slice().sort((a, b) => b.created_at - a.created_at);

    return (
        <div className="max-w-5xl mx-auto">
            <h2 className="text-2xl font-bold mb-6">Evolution History</h2>

            {isLoading && <div className="text-gray-500">Loading...</div>}
            {error && <div className="text-red-500">Failed to load history.</div>}
            {!isLoading && sorted.length === 0 && (
                <div className="text-gray-500">No strategy proposals yet.</div>
            )}

            <div className="space-y-4">
                {sorted.map((proposal) => {
                    const evaluation = parseEvaluation(proposal.evaluation_json);
                    const filename = proposal.strategy_path.split(/[\\/]/).pop();
                    const statusClass = statusStyles[proposal.status] || 'bg-gray-100 text-gray-600';
                    return (
                        <div key={proposal.id} className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
                            <div className="flex items-start justify-between">
                                <div>
                                    <div className="text-sm text-gray-500">Proposal #{proposal.id}</div>
                                    <div className="text-lg font-semibold">{filename}</div>
                                </div>
                                <span className={`text-xs px-2 py-1 rounded ${statusClass}`}>
                                    {proposal.status}
                                </span>
                            </div>
                            <div className="mt-2 text-xs text-gray-500">
                                Created: {new Date(proposal.created_at).toLocaleString()}
                                {proposal.decided_at && (
                                    <span> | Decided: {new Date(proposal.decided_at).toLocaleString()}</span>
                                )}
                            </div>
                            {evaluation?.description && (
                                <div className="mt-3 text-sm">
                                    <span className="font-semibold">Change:</span> {evaluation.description}
                                </div>
                            )}
                            {evaluation?.analysis && (
                                <div className="mt-2 text-sm text-gray-700">
                                    <span className="font-semibold">Analysis:</span> {evaluation.analysis}
                                </div>
                            )}
                            {evaluation?.validation && (
                                <div className="mt-2 text-sm text-gray-600">
                                    Validation: {evaluation.validation.status}
                                    {evaluation.validation.reason ? ` — ${evaluation.validation.reason}` : ''}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
