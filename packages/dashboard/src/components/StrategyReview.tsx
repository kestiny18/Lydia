import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { StrategyProposal } from '../types';
import { Check, X, FileText, AlertTriangle } from 'lucide-react';

export function StrategyReview() {
    const [proposals, setProposals] = useState<StrategyProposal[]>([]);
    const [selectedId, setSelectedId] = useState<number | null>(null);
    const [content, setContent] = useState<string | null>(null);
    const [activeContent, setActiveContent] = useState<string | null>(null);
    const [activePath, setActivePath] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const buildDiff = (left: string, right: string) => {
        const leftLines = left.split('\n');
        const rightLines = right.split('\n');
        const rows = leftLines.length + 1;
        const cols = rightLines.length + 1;
        const dp = Array.from({ length: rows }, () => Array(cols).fill(0));

        for (let i = rows - 2; i >= 0; i--) {
            for (let j = cols - 2; j >= 0; j--) {
                if (leftLines[i] === rightLines[j]) {
                    dp[i][j] = dp[i + 1][j + 1] + 1;
                } else {
                    dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
                }
            }
        }

        const diff: Array<{ type: 'same' | 'add' | 'del'; text: string }> = [];
        let i = 0;
        let j = 0;
        while (i < leftLines.length && j < rightLines.length) {
            if (leftLines[i] === rightLines[j]) {
                diff.push({ type: 'same', text: leftLines[i] });
                i += 1;
                j += 1;
            } else if (dp[i + 1][j] >= dp[i][j + 1]) {
                diff.push({ type: 'del', text: leftLines[i] });
                i += 1;
            } else {
                diff.push({ type: 'add', text: rightLines[j] });
                j += 1;
            }
        }
        while (i < leftLines.length) {
            diff.push({ type: 'del', text: leftLines[i] });
            i += 1;
        }
        while (j < rightLines.length) {
            diff.push({ type: 'add', text: rightLines[j] });
            j += 1;
        }
        return diff;
    };

    const parseEvaluation = (raw?: string | null) => {
        if (!raw) return null;
        try {
            return JSON.parse(raw);
        } catch {
            return null;
        }
    };

    useEffect(() => {
        loadProposals();
    }, []);

    useEffect(() => {
        if (selectedId) {
            loadContent(selectedId);
            loadActive();
        } else {
            setContent(null);
            setActiveContent(null);
            setActivePath(null);
        }
    }, [selectedId]);

    const loadProposals = async () => {
        try {
            setLoading(true);
            const data = await api.getProposals();
            setProposals(data);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const loadContent = async (id: number) => {
        const proposal = proposals.find(p => p.id === id);
        if (!proposal) return;
        try {
            const text = await api.getStrategyContent(proposal.strategy_path);
            setContent(text);
        } catch (err: any) {
            console.error(err);
            setContent('Failed to load content: ' + err.message);
        }
    };

    const loadActive = async () => {
        try {
            const active = await api.getActiveStrategy();
            setActiveContent(active.content);
            setActivePath(active.path);
        } catch (err: any) {
            console.error(err);
            setActiveContent(null);
            setActivePath(null);
        }
    };

    const diffLines = useMemo(() => {
        if (!activeContent || !content) return null;
        return buildDiff(activeContent, content);
    }, [activeContent, content]);

    const handleApprove = async (id: number) => {
        if (!confirm('Are you sure you want to approve this strategy?')) return;
        try {
            await api.approveProposal(id);
            loadProposals();
            setSelectedId(null);
        } catch (err: any) {
            alert('Error: ' + err.message);
        }
    };

    const handleReject = async (id: number) => {
        const reason = prompt('Enter rejection reason:');
        if (reason === null) return;
        try {
            await api.rejectProposal(id, reason);
            loadProposals();
            setSelectedId(null);
        } catch (err: any) {
            alert('Error: ' + err.message);
        }
    };

    return (
        <div className="flex h-full">
            {/* Sidebar List */}
            <div className="w-1/3 border-r border-gray-200 p-4 overflow-y-auto">
                <h2 className="text-lg font-bold mb-4">Strategy Proposals</h2>
                {loading && <div>Loading...</div>}
                {error && <div className="text-red-500">{error}</div>}
                {proposals.length === 0 && !loading && <div className="text-gray-500">No proposals found.</div>}

                <div className="space-y-2">
                    {proposals.map(p => (
                        <div
                            key={p.id}
                            onClick={() => setSelectedId(p.id)}
                            className={`p-3 rounded cursor-pointer border ${selectedId === p.id ? 'bg-blue-50 border-blue-500' : 'bg-white border-gray-200 hover:bg-gray-50'}`}
                        >
                            <div className="flex justify-between items-start">
                                <span className="font-semibold">#{p.id}</span>
                                <span className={`text-xs px-2 py-1 rounded ${p.status === 'pending_human' ? 'bg-yellow-100 text-yellow-800' :
                                        p.status === 'approved' ? 'bg-green-100 text-green-800' :
                                            'bg-red-100 text-red-800'
                                    }`}>
                                    {p.status}
                                </span>
                            </div>
                            <div className="text-xs text-gray-500 mt-1 truncate" title={p.strategy_path}>
                                {p.strategy_path.split(/[\\/]/).pop()}
                            </div>
                            <div className="text-xs text-gray-400 mt-1">
                                {new Date(p.created_at).toLocaleString()}
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Main Content */}
            <div className="w-2/3 p-4 overflow-y-auto bg-gray-50">
                {selectedId ? (
                    <div>
                        {(() => {
                            const proposal = proposals.find(p => p.id === selectedId);
                            const evaluation = parseEvaluation(proposal?.evaluation_json);
                            return (
                                <>
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="text-lg font-bold">Proposal Details</h2>
                            <div className="space-x-2">
                                <button
                                    onClick={() => handleApprove(selectedId)}
                                    className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 flex items-center gap-2"
                                >
                                    <Check size={16} /> Approve
                                </button>
                                <button
                                    onClick={() => handleReject(selectedId)}
                                    className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 flex items-center gap-2"
                                >
                                    <X size={16} /> Reject
                                </button>
                            </div>
                        </div>

                        <div className="bg-white p-4 rounded shadow">
                            <h3 className="font-semibold mb-2 flex items-center gap-2">
                                <FileText size={16} /> Strategy Content
                            </h3>
                            <pre className="bg-gray-900 text-gray-100 p-4 rounded overflow-x-auto text-sm font-mono">
                                {content || 'Loading content...'}
                            </pre>
                        </div>

                        <div className="mt-4 bg-white p-4 rounded shadow">
                            <h3 className="font-semibold mb-2 flex items-center gap-2">
                                <FileText size={16} /> Diff (Active vs Proposal)
                            </h3>
                            {activePath && (
                                <div className="text-xs text-gray-500 mb-2">
                                    Active: {activePath.split(/[\\/]/).pop()}
                                </div>
                            )}
                            {!diffLines && (
                                <p className="text-gray-500">Select a proposal to compare with the active strategy.</p>
                            )}
                            {diffLines && (
                                <pre className="bg-gray-900 text-gray-100 p-4 rounded overflow-x-auto text-xs font-mono space-y-1">
                                    {diffLines.map((line, index) => (
                                        <div
                                            key={`${line.type}-${index}`}
                                            className={
                                                line.type === 'add'
                                                    ? 'text-green-400'
                                                    : line.type === 'del'
                                                        ? 'text-red-400'
                                                        : 'text-gray-300'
                                            }
                                        >
                                            {line.type === 'add' ? '+ ' : line.type === 'del' ? '- ' : '  '}
                                            {line.text}
                                        </div>
                                    ))}
                                </pre>
                            )}
                        </div>

                        <div className="mt-4 bg-white p-4 rounded shadow">
                            <h3 className="font-semibold mb-2 flex items-center gap-2">
                                <AlertTriangle size={16} /> Evaluation Metrics
                            </h3>
                            {!proposal && (
                                <p className="text-gray-500">No proposal selected.</p>
                            )}
                            {proposal && !evaluation && (
                                <p className="text-gray-500">No evaluation data available.</p>
                            )}
                            {proposal && evaluation && (
                                <div className="text-sm text-gray-700 space-y-2">
                                    {evaluation.validation && (
                                        <div>
                                            <div className="font-semibold">Validation</div>
                                            <div>Status: {evaluation.validation.status}</div>
                                            {evaluation.validation.reason && <div>Reason: {evaluation.validation.reason}</div>}
                                        </div>
                                    )}
                                    {evaluation.analysis && (
                                        <div>
                                            <div className="font-semibold">Analysis</div>
                                            <div>{evaluation.analysis}</div>
                                        </div>
                                    )}
                                    {evaluation.description && (
                                        <div>
                                            <div className="font-semibold">Change</div>
                                            <div>{evaluation.description}</div>
                                        </div>
                                    )}
                                    {evaluation.review?.findings && (
                                        <div>
                                            <div className="font-semibold">Review Findings</div>
                                            <div>Findings: {evaluation.review.findings.length}</div>
                                            <div>Suggested confirmations: {(evaluation.review.suggestedConfirmations || []).join(', ') || 'None'}</div>
                                        </div>
                                    )}
                                    {evaluation.replay && (
                                        <div>
                                            <div className="font-semibold">Replay</div>
                                            <div>Episodes: {evaluation.replay.episodes}</div>
                                            <div>Drift episodes: {evaluation.replay.drift_episodes}</div>
                                            <div>Drift steps: {evaluation.replay.drift_steps}</div>
                                        </div>
                                    )}
                                    {evaluation.delta && (
                                        <div>
                                            <div className="font-semibold">Delta</div>
                                            <div>Success rate: {evaluation.delta.success_rate}</div>
                                            <div>Confirm required: {evaluation.delta.confirm_required}</div>
                                            <div>Avg duration ms: {evaluation.delta.avg_duration_ms}</div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                                </>
                            );
                        })()}
                    </div>
                ) : (
                    <div className="flex items-center justify-center h-full text-gray-400">
                        Select a proposal to view details
                    </div>
                )}
            </div>
        </div>
    );
}
