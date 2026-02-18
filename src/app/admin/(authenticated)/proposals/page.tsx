'use client';

import { getProposals, searchProposals, getProposalsByCampaign, deleteProposal, getAllProposalsByCampaign } from '@/actions/proposal-actions';
import { getCampaignsWithCounts } from '@/actions/campaign-actions';
import { batchSyncProposalsWithCRM } from '@/actions/document-actions';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Eye, FileText, Loader2, RefreshCw, LayoutList, Search, X, ChevronDown, ChevronUp, Trash2, SortAsc, Calendar, LinkIcon, Check, Download } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function ProposalsPage() {
    const [campaigns, setCampaigns] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [expandedCampaignId, setExpandedCampaignId] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [isSearching, setIsSearching] = useState(false);
    const [searchResults, setSearchResults] = useState<any[]>([]);

    // Sub-state for expanded campaign
    const [campaignProposals, setCampaignProposals] = useState<any[]>([]);
    const [campLoading, setCampLoading] = useState(false);
    const [sortBy, setSortBy] = useState<'createdAt' | 'nomeCompleto'>('createdAt');
    const [filterStatus, setFilterStatus] = useState<string>('all');
    const [page, setPage] = useState(1);
    const [markers, setMarkers] = useState<string[]>([]);
    const [isBatchSyncing, setIsBatchSyncing] = useState<string | null>(null);
    const PAGE_SIZE = 50;

    const fetchCampaigns = async () => {
        setLoading(true);
        const campsRes = await getCampaignsWithCounts();
        setCampaigns(campsRes);
        setLoading(false);
    };

    useEffect(() => {
        fetchCampaigns();
    }, []);

    const fetchProposalsForCampaign = async (campaignId: string, marker?: string, currentSort = sortBy, currentStatus = filterStatus) => {
        setCampLoading(true);
        const propsRes = await getProposalsByCampaign(campaignId, PAGE_SIZE, marker, currentSort, currentStatus);
        setCampaignProposals(propsRes);
        setCampLoading(false);
    };

    const toggleExpand = (campaignId: string) => {
        if (expandedCampaignId === campaignId) {
            setExpandedCampaignId(null);
            setCampaignProposals([]);
            setPage(1);
            setMarkers([]);
        } else {
            setExpandedCampaignId(campaignId);
            setCampaignProposals([]);
            setPage(1);
            setMarkers([]);
            fetchProposalsForCampaign(campaignId);
        }
    };

    const handleSortChange = (newSort: 'createdAt' | 'nomeCompleto') => {
        if (!expandedCampaignId || newSort === sortBy) return;
        setSortBy(newSort);
        setPage(1);
        setMarkers([]);
        fetchProposalsForCampaign(expandedCampaignId, undefined, newSort, filterStatus);
    };

    const handleStatusChange = (newStatus: string) => {
        if (!expandedCampaignId || newStatus === filterStatus) return;
        setFilterStatus(newStatus);
        setPage(1);
        setMarkers([]);
        fetchProposalsForCampaign(expandedCampaignId, undefined, sortBy, newStatus);
    };

    const handleNextPage = () => {
        if (!expandedCampaignId || campaignProposals.length < PAGE_SIZE) return;
        const lastId = campaignProposals[campaignProposals.length - 1].id;
        setMarkers([...markers, lastId]);
        setPage(page + 1);
        fetchProposalsForCampaign(expandedCampaignId, lastId, sortBy, filterStatus);
    };

    const handlePrevPage = () => {
        if (!expandedCampaignId || page === 1) return;
        const newMarkers = [...markers];
        newMarkers.pop();
        const prevMarker = newMarkers.length > 0 ? newMarkers[newMarkers.length - 1] : undefined;
        setMarkers(newMarkers);
        setPage(page - 1);
        fetchProposalsForCampaign(expandedCampaignId, prevMarker, sortBy, filterStatus);
    };

    const handleSearch = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        if (!searchTerm.trim()) {
            handleClearSearch();
            return;
        }
        setLoading(true);
        setIsSearching(true);
        setExpandedCampaignId(null);
        const results = await searchProposals(searchTerm);
        setSearchResults(results);
        setLoading(false);
    };

    const handleClearSearch = () => {
        setSearchTerm('');
        setIsSearching(false);
        setSearchResults([]);
        fetchCampaigns();
    };

    const handleDelete = async (proposalId: string) => {
        if (!confirm("Tem certeza que deseja excluir esta proposta? Esta ação não pode ser desfeita.")) return;

        setCampLoading(true);
        const result = await deleteProposal(proposalId);
        if (result.success) {
            // Refresh counts and current view
            await fetchCampaigns();
            if (expandedCampaignId) {
                await fetchProposalsForCampaign(expandedCampaignId);
            }
            if (isSearching) {
                const results = await searchProposals(searchTerm);
                setSearchResults(results);
            }
        } else {
            alert(result.message || "Erro ao excluir proposta.");
        }
        setCampLoading(false);
    };

    const handleExportCSV = async (campaignId: string, campaignName: string) => {
        try {
            setCampLoading(true);
            const data = await getAllProposalsByCampaign(campaignId, filterStatus);
            if (!data || data.length === 0) {
                alert("Nenhuma proposta encontrada para exportar.");
                setCampLoading(false);
                return;
            }

            // Define columns
            const headers = [
                "Data", "Nome Completo", "CPF", "Status", "Telefone", "Email",
                "Cargo/Categoria", "Cidade", "Estado", "CEP", "Logradouro", "Numero", "Bairro"
            ];

            // Map rows
            const rows = data.map((p: any) => [
                new Date(p.createdAt).toLocaleDateString('pt-BR'),
                p.nomeCompleto,
                p.cpf,
                p.status,
                p.telefone,
                p.email,
                p.cargo || p.categoriaFuncao,
                p.cidade,
                p.estado,
                p.cep,
                `${p.logradouroTipo} ${p.logradouroNome}`,
                p.numero,
                p.bairro
            ]);

            // Combine into CSV string
            const csvContent = [
                headers.join(","),
                ...rows.map((row: any[]) => row.map((val: any) => `"${String(val || "").replace(/"/g, '""')}"`).join(","))
            ].join("\n");

            // Create download link
            const blob = new Blob([`\uFEFF${csvContent}`], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.setAttribute("href", url);
            link.setAttribute("download", `propostas_${campaignName.toLowerCase().replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.csv`);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        } catch (error) {
            console.error("Export error:", error);
            alert("Erro ao exportar CSV.");
        } finally {
            setCampLoading(false);
        }
    };

    const handleBatchSync = async (campaignId: string) => {
        if (!confirm("Isso enviará todas as propostas pendentes desta campanha para o CRM. Deseja continuar?")) return;

        setIsBatchSyncing(campaignId);
        try {
            const result = await batchSyncProposalsWithCRM(campaignId);
            if (result.success) {
                const fails = result.failCount || 0;
                alert(result.message + (fails > 0 ? `\n${fails} falha(s). Verifique os logs.` : ""));
            } else {
                alert(result.message || "Erro ao processar lote.");
            }

            // Refresh counts and current view
            await fetchCampaigns();
            if (expandedCampaignId === campaignId) {
                await fetchProposalsForCampaign(campaignId);
            }
        } catch (error) {
            console.error("Error in handleBatchSync:", error);
            alert("Ocorreu um erro ao processar o lote.");
        } finally {
            setIsBatchSyncing(null);
        }
    };

    return (
        <div className="space-y-8">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold text-[#002B49]">Propostas por Formulário</h1>
                    <p className="text-gray-500">Gerencie as adesões organizadas por formulário.</p>
                </div>
                <div className="flex flex-col md:flex-row gap-4 items-start md:items-center">
                    <form onSubmit={handleSearch} className="relative w-full md:w-80">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                        <input
                            type="text"
                            placeholder="Buscar por Nome ou CPF..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-10 pr-10 py-2 border rounded-xl focus:ring-2 focus:ring-[#002B49] focus:outline-none text-sm"
                        />
                        {searchTerm && (
                            <button
                                type="button"
                                onClick={handleClearSearch}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-red-500"
                            >
                                <X size={16} />
                            </button>
                        )}
                    </form>
                    <button
                        onClick={() => isSearching ? handleSearch() : fetchCampaigns()}
                        className="flex items-center gap-2 px-4 py-2 bg-white border rounded-lg hover:bg-gray-50 text-sm font-bold text-[#002B49]"
                    >
                        <RefreshCw size={16} /> {isSearching ? 'Refazer Busca' : 'Atualizar'}
                    </button>
                </div>
            </div>

            {loading ? (
                <div className="flex justify-center p-12">
                    <Loader2 className="animate-spin text-[#002B49]" size={48} />
                </div>
            ) : isSearching ? (
                /* SEARCH RESULTS VIEW */
                <div className="bg-white rounded-2xl shadow-sm border overflow-hidden">
                    <div className="bg-blue-50 px-6 py-4 border-b flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <Search className="text-[#002B49]" size={20} />
                            <h3 className="font-bold text-[#002B49]">Resultados da Busca</h3>
                            <span className="text-xs bg-white px-2 py-1 rounded-full text-gray-700 font-bold border">
                                {searchResults.length}
                            </span>
                        </div>
                        <button onClick={handleClearSearch} className="text-sm text-blue-600 font-bold underline">Voltar</button>
                    </div>
                    <ProposalsTable proposals={searchResults} onDelete={handleDelete} />
                    {searchResults.length === 0 && (
                        <div className="p-12 text-center text-gray-500 italic">Nenhum resultado encontrado.</div>
                    )}
                </div>
            ) : (
                /* CAMPAIGNS LIST VIEW */
                <div className="space-y-4">
                    {campaigns.map((camp) => (
                        <div key={camp.id} className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                            {/* Campaign Header Row */}
                            <div
                                onClick={() => toggleExpand(camp.id)}
                                className={`px-6 py-4 flex items-center justify-between cursor-pointer hover:bg-gray-50 transition-colors ${expandedCampaignId === camp.id ? 'bg-gray-50 border-b' : ''}`}
                            >
                                <div className="flex items-center gap-4">
                                    <div className={`p-2 rounded-lg ${expandedCampaignId === camp.id ? 'bg-[#002B49] text-white' : 'bg-gray-100 text-[#002B49]'}`}>
                                        <LayoutList size={22} />
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-lg text-[#002B49]">{camp.name}</h3>
                                        <p className="text-sm text-gray-500">{camp.slug}</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-6">
                                    <div className="text-right">
                                        <div className="text-sm text-gray-500 uppercase tracking-wider font-bold">Propostas</div>
                                        <div className="text-2xl font-black text-[#002B49]">{camp.proposalCount}</div>
                                    </div>
                                    {expandedCampaignId === camp.id ? <ChevronUp className="text-gray-400" /> : <ChevronDown className="text-gray-400" />}
                                </div>
                            </div>

                            {/* Expanded Section */}
                            <AnimatePresence>
                                {expandedCampaignId === camp.id && (
                                    <motion.div
                                        initial={{ height: 0, opacity: 0 }}
                                        animate={{ height: 'auto', opacity: 1 }}
                                        exit={{ height: 0, opacity: 0 }}
                                        className="overflow-hidden"
                                    >
                                        <div className="p-6 bg-white border-t space-y-4">
                                            {/* Sorting Controls */}
                                            <div className="flex flex-col sm:flex-row justify-between items-end gap-4 mb-2">
                                                <div className="flex flex-wrap gap-4 items-center">
                                                    <div className="flex flex-col gap-1">
                                                        <span className="text-[10px] font-bold text-gray-400 uppercase ml-1">Ordenar por</span>
                                                        <div className="flex gap-2">
                                                            <button
                                                                onClick={() => handleSortChange('createdAt')}
                                                                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${sortBy === 'createdAt'
                                                                    ? 'bg-[#002B49] text-white border-[#002B49]'
                                                                    : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'
                                                                    }`}
                                                            >
                                                                <Calendar size={14} /> DATA
                                                            </button>
                                                            <button
                                                                onClick={() => handleSortChange('nomeCompleto')}
                                                                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${sortBy === 'nomeCompleto'
                                                                    ? 'bg-[#002B49] text-white border-[#002B49]'
                                                                    : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'
                                                                    }`}
                                                            >
                                                                <SortAsc size={14} /> NOME
                                                            </button>
                                                        </div>
                                                    </div>

                                                    <div className="flex flex-col gap-1">
                                                        <span className="text-[10px] font-bold text-gray-400 uppercase ml-1">Filtrar por Status</span>
                                                        <select
                                                            value={filterStatus}
                                                            onChange={(e) => handleStatusChange(e.target.value)}
                                                            className="px-3 py-1.5 rounded-lg text-xs font-bold border border-gray-200 bg-white text-[#002B49] focus:outline-none focus:ring-2 focus:ring-[#002B49]"
                                                        >
                                                            <option value="all">TODOS OS STATUS</option>
                                                            <option value="pending_documents">PENDENTE DOCS</option>
                                                            <option value="documents_received">DOCS RECEBIDOS</option>
                                                            <option value="completed">CONCLUÍDA (CRM)</option>
                                                        </select>
                                                    </div>
                                                </div>

                                                <div className="flex gap-2">
                                                    <button
                                                        onClick={() => handleBatchSync(camp.id)}
                                                        disabled={isBatchSyncing === camp.id}
                                                        className="flex items-center justify-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all border bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100 disabled:opacity-50"
                                                    >
                                                        {isBatchSyncing === camp.id ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                                                        SINCRONIZAR CRM
                                                    </button>
                                                    <button
                                                        onClick={() => handleExportCSV(camp.id, camp.name)}
                                                        disabled={campLoading}
                                                        className="flex items-center justify-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all border bg-green-50 text-green-700 border-green-200 hover:bg-green-100 disabled:opacity-50"
                                                    >
                                                        <Download size={14} /> EXPORTAR CSV
                                                    </button>
                                                </div>
                                            </div>

                                            {campLoading ? (
                                                <div className="flex justify-center py-12">
                                                    <Loader2 className="animate-spin text-[#002B49]" size={32} />
                                                </div>
                                            ) : (
                                                <>
                                                    <ProposalsTable proposals={campaignProposals} onDelete={handleDelete} />

                                                    {/* PAGINATION WITHIN EXPANDED VIEW */}
                                                    <div className="flex items-center justify-between mt-4">
                                                        <div className="text-sm text-gray-500 font-medium">
                                                            Página <span className="font-bold text-[#002B49]">{page}</span>
                                                        </div>
                                                        <div className="flex gap-2">
                                                            <button
                                                                onClick={handlePrevPage}
                                                                disabled={page === 1 || campLoading}
                                                                className="px-4 py-2 border rounded-lg text-xs font-bold hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                                                            >
                                                                ANTERIOR
                                                            </button>
                                                            <button
                                                                onClick={handleNextPage}
                                                                disabled={campaignProposals.length < PAGE_SIZE || campLoading}
                                                                className="px-4 py-2 bg-[#002B49] text-white rounded-lg text-xs font-bold hover:bg-[#001f35] disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                                                            >
                                                                PRÓXIMO
                                                            </button>
                                                        </div>
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

// Helper component for copying link
function CopyButton({ uploadToken }: { uploadToken: string }) {
    const [copied, setCopied] = useState(false);

    const handleCopy = async () => {
        const url = `${window.location.origin}/upload/${uploadToken}`;
        try {
            await navigator.clipboard.writeText(url);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (err) {
            console.error('Failed to copy: ', err);
        }
    };

    return (
        <button
            onClick={handleCopy}
            className={`inline-flex items-center justify-center w-7 h-7 rounded-full transition-colors border ${copied ? 'bg-green-100 text-green-600 border-green-200' : 'bg-gray-50 hover:bg-[#002B49] hover:text-white'}`}
            title="Copiar Link de Documentos"
        >
            {copied ? <Check size={14} /> : <LinkIcon size={14} />}
        </button>
    );
}

// Sub-component for the Proposals Table to keep main component cleaner
function ProposalsTable({ proposals, onDelete }: { proposals: any[], onDelete: (id: string) => void }) {
    if (proposals.length === 0) return null;

    return (
        <div className="overflow-x-auto">
            <table className="w-full text-left">
                <thead className="text-gray-500 text-xs uppercase tracking-wider border-b bg-gray-50/50">
                    <tr>
                        <th className="p-4 font-bold">Data</th>
                        <th className="p-4 font-bold">Nome</th>
                        <th className="p-4 font-bold">CPF</th>
                        <th className="p-4 font-bold">Status</th>
                        <th className="p-4 font-bold text-right">Ações</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                    {proposals.map((p: any) => (
                        <tr key={p.id} className="hover:bg-blue-50 transition-colors">
                            <td className="p-4 text-xs text-gray-500">
                                {new Date(p.createdAt).toLocaleDateString('pt-BR')} <br />
                                <span className="text-[10px]">{new Date(p.createdAt).toLocaleTimeString('pt-BR')}</span>
                            </td>
                            <td className="p-4 font-bold text-[#002B49] text-sm">{p.nomeCompleto}</td>
                            <td className="p-4 text-gray-600 font-mono text-xs">{p.cpf}</td>
                            <td className="p-4">
                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${p.status === 'completed' ? 'bg-green-100 text-green-800' :
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
                            <td className="p-4 text-right flex justify-end gap-2">
                                <Link href={`/admin/proposals/${p.id}`} className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-gray-50 hover:bg-[#002B49] hover:text-white transition-colors border" title="Ver Detalhes">
                                    <Eye size={14} />
                                </Link>
                                <CopyButton uploadToken={p.uploadToken} />
                                <button
                                    onClick={() => onDelete(p.id)}
                                    className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-gray-50 hover:bg-red-600 hover:text-white transition-colors border text-red-600"
                                    title="Excluir"
                                >
                                    <Trash2 size={14} />
                                </button>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
