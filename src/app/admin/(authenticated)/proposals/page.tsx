'use client';

import { getProposals } from '@/actions/proposal-actions';
import { getCampaigns } from '@/actions/campaign-actions';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Eye, FileText, Loader2, RefreshCw, LayoutList } from 'lucide-react';

export default function ProposalsPage() {
    const [proposals, setProposals] = useState<any[]>([]);
    const [campaigns, setCampaigns] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchData = async () => {
        setLoading(true);
        const [propsRes, campsRes] = await Promise.all([
            getProposals(),
            getCampaigns()
        ]);
        setProposals(propsRes);
        setCampaigns(campsRes);
        setLoading(false);
    };

    useEffect(() => {
        fetchData();
    }, []);

    // Grouping Logic
    const groupedProposals = proposals.reduce((acc, proposal) => {
        const campaignId = proposal.campaignId || 'uncategorized';
        if (!acc[campaignId]) acc[campaignId] = [];
        acc[campaignId].push(proposal);
        return acc;
    }, {} as Record<string, any[]>);

    // Helper to get campaign name
    const getCampaignName = (id: string) => {
        if (id === 'uncategorized') return 'Sem Campanha Vinculada';
        const camp = campaigns.find(c => c.id === id);
        return camp ? camp.name : 'Campanha Desconhecida / Removida';
    };

    return (
        <div className="space-y-8">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold text-[#002B49]">Propostas por Campanha</h1>
                    <p className="text-gray-500">Gerencie as fichas de adesão organizadas por origem.</p>
                </div>
                <button
                    onClick={fetchData}
                    className="flex items-center gap-2 px-4 py-2 bg-white border rounded-lg hover:bg-gray-50 text-sm font-bold text-[#002B49]"
                >
                    <RefreshCw size={16} /> Atualizar
                </button>
            </div>

            {loading ? (
                <div className="flex justify-center p-12">
                    <Loader2 className="animate-spin text-[#002B49]" size={48} />
                </div>
            ) : Object.keys(groupedProposals).length === 0 ? (
                <div className="text-center p-12 bg-white rounded-2xl shadow-sm border">
                    <FileText className="mx-auto text-gray-300 mb-4" size={48} />
                    <h3 className="text-lg font-bold text-gray-700">Nenhuma proposta encontrada</h3>
                    <p className="text-gray-500">As novas adesões aparecerão aqui.</p>
                </div>
            ) : (
                <div className="space-y-8">
                    {/* Iterate over campaigns (prioritize active/known ones) or just keys */}
                    {Object.keys(groupedProposals).map(campaignId => (
                        <div key={campaignId} className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                            <div className="bg-gray-50 px-6 py-4 border-b flex items-center gap-3">
                                <LayoutList className="text-[#002B49]" size={20} />
                                <h3 className="font-bold text-lg text-[#002B49]">{getCampaignName(campaignId)}</h3>
                                <span className="text-xs bg-gray-200 px-2 py-1 rounded-full text-gray-700 font-bold">
                                    {groupedProposals[campaignId].length}
                                </span>
                            </div>
                            <table className="w-full text-left">
                                <thead className="text-gray-500 text-sm uppercase tracking-wider border-b bg-white">
                                    <tr>
                                        <th className="p-4 font-bold">Data</th>
                                        <th className="p-4 font-bold">Nome</th>
                                        <th className="p-4 font-bold">CPF</th>
                                        <th className="p-4 font-bold">Status</th>
                                        <th className="p-4 font-bold text-right">Ações</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {groupedProposals[campaignId].map((p: any) => (
                                        <tr key={p.id} className="hover:bg-blue-50 transition-colors">
                                            <td className="p-4 text-sm text-gray-500">
                                                {new Date(p.createdAt).toLocaleDateString('pt-BR')} <br />
                                                <span className="text-xs">{new Date(p.createdAt).toLocaleTimeString('pt-BR')}</span>
                                            </td>
                                            <td className="p-4 font-bold text-[#002B49]">{p.nomeCompleto}</td>
                                            <td className="p-4 text-gray-600 font-mono text-sm">{p.cpf}</td>
                                            <td className="p-4">
                                                <span className={`px-3 py-1 rounded-full text-xs font-bold ${p.status === 'completed' ? 'bg-green-100 text-green-800' :
                                                    p.status === 'pending_documents' ? 'bg-yellow-100 text-yellow-800' :
                                                        p.status === 'documents_received' ? 'bg-blue-100 text-blue-800' :
                                                            'bg-gray-100 text-gray-800'
                                                    }`}>
                                                    {p.status === 'completed' ? 'Concluído' :
                                                        p.status === 'pending_documents' ? 'Aguardando Docs' :
                                                            p.status === 'documents_received' ? 'Docs Recebidos' :
                                                                p.status}
                                                </span>
                                            </td>
                                            <td className="p-4 text-right">
                                                <Link href={`/admin/proposals/${p.id}`} className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-gray-100 hover:bg-[#002B49] hover:text-white transition-colors">
                                                    <Eye size={16} />
                                                </Link>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
