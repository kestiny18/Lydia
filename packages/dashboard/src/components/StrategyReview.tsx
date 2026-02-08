import React, { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { StrategyProposal } from '../types';
import { Check, X, FileText, AlertTriangle } from 'lucide-react';

export function StrategyReview() {
    const [proposals, setProposals] = useState<StrategyProposal[]>([]);
    const [selectedId, setSelectedId] = useState<number | null>(null);
    const [content, setContent] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        loadProposals();
    }, []);

    useEffect(() => {
        if (selectedId) {
            loadContent(selectedId);
        } else {
            setContent(null);
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

                        {/* Placeholder for Diff/Evaluation metrics */}
                        <div className="mt-4 bg-white p-4 rounded shadow text-gray-500">
                            <h3 className="font-semibold mb-2 flex items-center gap-2">
                                <AlertTriangle size={16} /> Evaluation Metrics
                            </h3>
                            <p>Metrics visualization coming soon...</p>
                        </div>

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
