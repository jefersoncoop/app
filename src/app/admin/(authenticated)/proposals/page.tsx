'use client';

import { getProposals, searchProposals, getProposalsByCampaign, deleteProposal, getAllProposalsByCampaign, batchImportProposals } from '@/actions/proposal-actions';
import { getCampaignsWithCounts } from '@/actions/campaign-actions';
import { batchSyncProposalsWithCRM } from '@/actions/document-actions';
import {
    createWhatsappResendJobByCampaign,
    processWhatsappResendJob,
    type WhatsappResendJobProgress
} from '@/actions/clicksign-actions';
import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { Eye, Loader2, RefreshCw, LayoutList, Search, X, ChevronDown, ChevronUp, Trash2, SortAsc, Calendar, LinkIcon, Check, Download, Upload, FileSpreadsheet, MessageCircle, FileSignature, CheckCircle2, Clock3 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import Papa from 'papaparse';

const CSV_TEMPLATE_HEADERS = [
    "nomeCompleto", "cpf", "email", "telefone", "dataNascimento",
    "nomeMae", "pis", "sexo", "corRaca", "estadoCivil",
    "nacionalidade", "naturalidadeEstado", "naturalidadeMunicipio",
    "cep", "estado", "cidade", "logradouroTipo", "logradouroNome",
    "numero", "bairro", "escolaridade", "categoriaFuncao",
    "tamanhoCamisa", "criterioLocalidade", "criterioExperiencia", "criterioDisponibilidade", "clicksignStatus"
];

const PROPOSAL_STATUS_META: Record<string, { label: string; className: string }> = {
    pending_documents: { label: 'Aguardando Docs', className: 'bg-yellow-100 text-yellow-800' },
    documents_received: { label: 'Docs Recebidos', className: 'bg-blue-100 text-blue-800' },
    signature_requested: { label: 'Aguardando Assinatura', className: 'bg-purple-100 text-purple-800' },
    signed: { label: 'Assinado', className: 'bg-emerald-100 text-emerald-800' },
    crm_syncing: { label: 'Sincronizando CRM', className: 'bg-indigo-100 text-indigo-800' },
    crm_sync_failed: { label: 'Erro CRM', className: 'bg-red-100 text-red-800' },
    completed: { label: 'Concluído', className: 'bg-green-100 text-green-800' },
};

function getProposalStatusMeta(status?: string) {
    return PROPOSAL_STATUS_META[status || ''] || { label: status || 'Pendente', className: 'bg-gray-100 text-gray-800' };
}

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
    const [isBatchResending, setIsBatchResending] = useState<string | null>(null);
    const [resendJobProgress, setResendJobProgress] = useState<Record<string, WhatsappResendJobProgress>>({});
    const PAGE_SIZE = 50;

    const fileInputRef = useRef<HTMLInputElement>(null);
    const [importing, setImporting] = useState(false);
    const [importResults, setImportResults] = useState<{ success: number; fail: number; errors: string[] } | null>(null);

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
                "Cargo/Categoria", "Escola Selecionada", "Cidade", "Estado", "CEP", "Logradouro", "Numero", "Bairro", "tamanhoCamisa", "Link", "Status Plugsign"
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
                p.escolaSelecionada,
                p.cidade,
                p.estado,
                p.cep,
                `${p.logradouroTipo} ${p.logradouroNome}`,
                p.numero,
                p.bairro,
                p.tamanhoCamisa,
                p.uploadToken, p.clicksignStatus
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

    const handleBatchResend = async (campaignId: string, campaignName: string) => {
        if (!confirm(`Isso vai criar um lote e reenviar o link de assinatura em blocos para os pendentes da campanha "${campaignName}". Continuar?`)) return;

        setIsBatchResending(campaignId);
        try {
            let progress = await createWhatsappResendJobByCampaign(campaignId, campaignName);
            setResendJobProgress(prev => ({ ...prev, [campaignId]: progress }));

            while (progress.status === 'queued' || progress.status === 'processing') {
                progress = await processWhatsappResendJob(progress.jobId, 8);
                setResendJobProgress(prev => ({ ...prev, [campaignId]: progress }));
            }

            alert(
                `✅ Reenvio concluído para "${campaignName}"\n` +
                `Enviados: ${progress.sent}\n` +
                `Pulados: ${progress.skipped}\n` +
                `Erros: ${progress.errors}\n` +
                `Processados: ${progress.processed}/${progress.total}`
            );
        } catch (error) {
            console.error("Error in handleBatchResend:", error);
            alert('Erro ao reenviar notificações.');
        } finally {
            setIsBatchResending(null);
        }
    };

    const handleDownloadTemplate = () => {
        const csvContent = CSV_TEMPLATE_HEADERS.join(",");
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", "template_importacao_propostas.csv");
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const handleImportClick = () => {
        fileInputRef.current?.click();
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !expandedCampaignId) return;

        setImporting(true);
        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            complete: async (results) => {
                const proposals = results.data.map((row: any) => ({
                    ...row,
                    campaignId: expandedCampaignId,
                    aceiteConcordancia: true,
                    aceiteLGPD: true,
                    aceiteTermoAdessao: true,
                    status: 'pending_documents'
                }));

                if (proposals.length === 0) {
                    alert("Arquivo vazio ou sem dados válidos.");
                    setImporting(false);
                    return;
                }

                if (!confirm(`Deseja importar ${proposals.length} propostas para esta campanha?`)) {
                    setImporting(false);
                    if (fileInputRef.current) fileInputRef.current.value = '';
                    return;
                }

                const res = await batchImportProposals(proposals);
                if (res.success) {
                    const resOk = res as { success: boolean; successCount: number; failCount: number; errors: string[] };
                    setImportResults({
                        success: resOk.successCount || 0,
                        fail: resOk.failCount || 0,
                        errors: resOk.errors || []
                    });
                    // Refresh view
                    await fetchCampaigns();
                    await fetchProposalsForCampaign(expandedCampaignId);
                } else {
                    alert(res.message || "Erro ao importar arquivo.");
                }
                setImporting(false);
                if (fileInputRef.current) fileInputRef.current.value = '';
            },
            error: (error) => {
                console.error("CSV Parse Error:", error);
                alert("Erro ao ler arquivo CSV.");
                setImporting(false);
            }
        });
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
                            className="w-full pl-10 pr-10 py-2 border rounded-xl focus:ring-2 focus:ring-[#002B49] focus:outline-none text-sm text-[#002B49]"
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
                                <div className="flex items-center gap-4">
                                    <div className="hidden md:grid grid-cols-4 gap-2">
                                        {[
                                            { label: 'Propostas', value: camp.proposalCount, icon: LayoutList, cls: 'text-[#002B49]' },
                                            { label: 'Docs criados', value: camp.documentCount || 0, icon: FileSignature, cls: 'text-blue-600' },
                                            { label: 'Assinados', value: camp.signedDocumentCount || 0, icon: CheckCircle2, cls: 'text-green-600' },
                                            { label: 'Pendentes', value: camp.pendingSignatureCount || 0, icon: Clock3, cls: 'text-yellow-600' },
                                        ].map(({ label, value, icon: Icon, cls }) => (
                                            <div key={label} className="min-w-24 rounded-xl border border-gray-100 bg-white px-3 py-2 text-right shadow-sm">
                                                <div className="flex items-center justify-end gap-1 text-[10px] text-gray-400 uppercase font-bold">
                                                    <Icon size={12} className={cls} />
                                                    {label}
                                                </div>
                                                <div className={`text-2xl font-black ${cls}`}>{value}</div>
                                            </div>
                                        ))}
                                    </div>
                                    <div className="md:hidden text-right">
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
                                                            <option value="signature_requested">AGUARDANDO ASSINATURA</option>
                                                            <option value="signed">ASSINADO</option>
                                                            <option value="crm_syncing">SINCRONIZANDO CRM</option>
                                                            <option value="crm_sync_failed">ERRO CRM</option>
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
                                                        onClick={() => handleBatchResend(camp.id, camp.name)}
                                                        disabled={!!isBatchResending}
                                                        className="flex items-center justify-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all border bg-green-50 text-green-700 border-green-200 hover:bg-green-100 disabled:opacity-50"
                                                        title="Reenviar WhatsApp de assinatura para todos os pendentes desta campanha"
                                                    >
                                                        {isBatchResending === camp.id ? <Loader2 size={14} className="animate-spin" /> : <MessageCircle size={14} />}
                                                        REENVIAR WHATSAPP
                                                    </button>
                                                    <button
                                                        onClick={() => handleExportCSV(camp.id, camp.name)}
                                                        disabled={campLoading}
                                                        className="flex items-center justify-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all border bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100 disabled:opacity-50"
                                                    >
                                                        <Download size={14} /> EXPORTAR CSV
                                                    </button>
                                                    <button
                                                        onClick={handleImportClick}
                                                        disabled={importing || campLoading}
                                                        className="flex items-center justify-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all border bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100 disabled:opacity-50"
                                                    >
                                                        {importing ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                                                        IMPORTAR CSV
                                                    </button>
                                                    <button
                                                        onClick={handleDownloadTemplate}
                                                        className="flex items-center justify-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all border bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100"
                                                        title="Baixar Template CSV"
                                                    >
                                                        <FileSpreadsheet size={14} /> TEMPLATE
                                                    </button>
                                                    <input
                                                        type="file"
                                                        ref={fileInputRef}
                                                        onChange={handleFileChange}
                                                        accept=".csv"
                                                        className="hidden"
                                                    />
                                                </div>
                                                {resendJobProgress[camp.id] && (
                                                    <div className="mt-3 rounded-lg border border-green-100 bg-green-50 px-3 py-2 text-xs font-bold text-green-800">
                                                        Reenvio WhatsApp: {resendJobProgress[camp.id].processed}/{resendJobProgress[camp.id].total}
                                                        {' '}| Enviados: {resendJobProgress[camp.id].sent}
                                                        {' '}| Pulados: {resendJobProgress[camp.id].skipped}
                                                        {' '}| Erros: {resendJobProgress[camp.id].errors}
                                                    </div>
                                                )}
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

            {/* IMPORT RESULTS MODAL */}
            <AnimatePresence>
                {importResults && (
                    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="bg-white rounded-2xl shadow-xl border max-w-lg w-full overflow-hidden"
                        >
                            <div className="p-6 border-b flex justify-between items-center">
                                <h3 className="font-bold text-lg text-[#002B49]">Resultado da Importação</h3>
                                <button onClick={() => setImportResults(null)} className="text-gray-400 hover:text-gray-600">
                                    <X size={20} />
                                </button>
                            </div>
                            <div className="p-6 space-y-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="bg-green-50 border border-green-100 p-4 rounded-xl text-center">
                                        <div className="text-2xl font-black text-green-600">{importResults.success}</div>
                                        <div className="text-xs font-bold text-green-800 uppercase">Sucesso</div>
                                    </div>
                                    <div className="bg-red-50 border border-red-100 p-4 rounded-xl text-center">
                                        <div className="text-2xl font-black text-red-600">{importResults.fail}</div>
                                        <div className="text-xs font-bold text-red-800 uppercase">Falhas</div>
                                    </div>
                                </div>

                                {importResults.errors.length > 0 && (
                                    <div className="space-y-2">
                                        <p className="text-xs font-bold text-gray-400 uppercase">Erros Encontrados:</p>
                                        <div className="max-h-40 overflow-y-auto bg-gray-50 rounded-lg p-3 text-xs font-mono text-red-600 space-y-1 border">
                                            {importResults.errors.map((err, i) => (
                                                <div key={i}>• {err}</div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                            <div className="p-6 bg-gray-50 border-t flex justify-end">
                                <button
                                    onClick={() => setImportResults(null)}
                                    className="px-6 py-2 bg-[#002B49] text-white rounded-xl font-bold hover:bg-[#001f35] transition-colors"
                                >
                                    FECHAR
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
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
                        <th className="p-4 font-bold">Documento</th>
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
                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${getProposalStatusMeta(p.status).className}`}>
                                    {getProposalStatusMeta(p.status).label}
                                </span>
                            </td>
                            <td className="p-4">
                                {p.clicksignStatus === 'signed' ? (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-green-100 text-green-700">
                                        ✅ Assinado
                                    </span>
                                ) : p.clicksignEnvelopeId ? (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-yellow-100 text-yellow-700">
                                        ⏳ Pendente
                                    </span>
                                ) : (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-gray-100 text-gray-400">
                                        — Sem doc.
                                    </span>
                                )}
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
