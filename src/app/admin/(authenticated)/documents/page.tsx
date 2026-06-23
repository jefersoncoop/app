'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import {
    FileSignature, Upload, Search, CheckCircle2, XCircle,
    Loader2, RefreshCw, Download, MessageCircle, ChevronRight, FileText,
    Users, RotateCw, ClipboardList, Clock3
} from 'lucide-react';
import {
    findProposalsByCpfs,
    batchCreateClicksignEnvelopes,
    batchResendWhatsapp,
    batchSyncClicksignStatus,
    getDocumentDashboardStats,
    type ProposalCpfResult,
    type BatchCreateResult,
    type BatchResendResult,
    type DocumentDashboardStats
} from '@/actions/clicksign-actions';

// ─── Types ───────────────────────────────────────────────────────────────────

type Step = 'upload' | 'review' | 'results';

type RowStatus = 'ready' | 'has_envelope' | 'signed' | 'not_found';

interface ReviewRow extends ProposalCpfResult {
    rowStatus: RowStatus;
    selected: boolean;
}

interface ProcessResult {
    cpf: string;
    nomeCompleto: string | null;
    proposalId: string | null;
    outcome: 'success' | 'skipped' | 'error' | 'resent' | 'resend_failed';
    envelopeId?: string;
    message?: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseCpfsFromCsv(content: string): string[] {
    const lines = content.split(/\r?\n/).filter(l => l.trim());
    const cpfs: string[] = [];
    const cpfRegex = /\d{3}[\.\s]?\d{3}[\.\s]?\d{3}[-\.\s]?\d{2}/g;

    for (const line of lines) {
        const matches = line.match(cpfRegex);
        if (matches) cpfs.push(...matches.map(m => m.trim()));
    }

    // Deduplicate
    return [...new Set(cpfs)];
}

function getRowStatus(row: ProposalCpfResult): RowStatus {
    if (!row.proposalId) return 'not_found';
    if (row.clicksignStatus === 'signed') return 'signed';
    if (row.clicksignEnvelopeId) return 'has_envelope';
    return 'ready';
}

function exportCsv(rows: ProcessResult[], filename: string) {
    const header = 'CPF,Nome,Proposta ID,Resultado,Envelope ID,Mensagem';
    const body = rows.map(r =>
        [r.cpf, r.nomeCompleto || '', r.proposalId || '', r.outcome, r.envelopeId || '', r.message || '']
            .map(v => `"${String(v).replace(/"/g, '""')}"`)
            .join(',')
    ).join('\n');
    const blob = new Blob([`${header}\n${body}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: RowStatus | string }) {
    const map: Record<string, { label: string; cls: string }> = {
        ready:       { label: 'Pronto para gerar', cls: 'bg-blue-100 text-blue-700' },
        has_envelope:{ label: 'Envelope ativo',    cls: 'bg-yellow-100 text-yellow-700' },
        signed:      { label: 'Já assinado',       cls: 'bg-green-100 text-green-700' },
        not_found:   { label: 'CPF não encontrado',cls: 'bg-red-100 text-red-700' },
        success:     { label: 'Gerado ✅',         cls: 'bg-green-100 text-green-700' },
        skipped:     { label: 'Pulado',            cls: 'bg-gray-100 text-gray-500' },
        error:       { label: 'Erro ❌',           cls: 'bg-red-100 text-red-700' },
        resent:      { label: 'Reenviado ✅',      cls: 'bg-green-100 text-green-700' },
        resend_failed:{ label: 'Falha reenvio',    cls: 'bg-red-100 text-red-700' },
    };
    const { label, cls } = map[status] ?? { label: status, cls: 'bg-gray-100 text-gray-500' };
    return <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold ${cls}`}>{label}</span>;
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function DocumentsPage() {
    const [step, setStep] = useState<Step>('upload');
    const [isDragging, setIsDragging] = useState(false);
    const [rawCpfs, setRawCpfs] = useState<string[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [reviewRows, setReviewRows] = useState<ReviewRow[]>([]);
    const [isProcessing, setIsProcessing] = useState(false);
    const [results, setResults] = useState<ProcessResult[]>([]);
    const [isResending, setIsResending] = useState(false);
    const [isSyncing, setIsSyncing] = useState(false);
    const [syncResult, setSyncResult] = useState<{ checked: number; nowSigned: number; stillPending: number; errors: number } | null>(null);
    const [dashboardStats, setDashboardStats] = useState<DocumentDashboardStats | null>(null);
    const [isLoadingDashboard, setIsLoadingDashboard] = useState(true);
    const fileRef = useRef<HTMLInputElement>(null);

    const loadDashboardStats = useCallback(async () => {
        setIsLoadingDashboard(true);
        try {
            const stats = await getDocumentDashboardStats();
            setDashboardStats(stats);
        } catch (error) {
            console.error('Erro ao carregar painel de documentos:', error);
            setDashboardStats(null);
        } finally {
            setIsLoadingDashboard(false);
        }
    }, []);

    useEffect(() => {
        loadDashboardStats();
    }, [loadDashboardStats]);

    // ── CSV Upload ──────────────────────────────────────────────────────────

    const handleFile = useCallback((file: File) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const text = e.target?.result as string;
            const cpfs = parseCpfsFromCsv(text);
            setRawCpfs(cpfs);
        };
        reader.readAsText(file, 'utf-8');
    }, []);

    const onDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        const file = e.dataTransfer.files[0];
        if (file) handleFile(file);
    }, [handleFile]);

    const handleSearch = async () => {
        if (!rawCpfs.length) return;
        setIsSearching(true);
        try {
            const found = await findProposalsByCpfs(rawCpfs);
            const rows: ReviewRow[] = found.map(r => ({
                ...r,
                rowStatus: getRowStatus(r),
                selected: getRowStatus(r) === 'ready' || getRowStatus(r) === 'has_envelope'
            }));
            setReviewRows(rows);
            setStep('review');
        } finally {
            setIsSearching(false);
        }
    };

    // ── Review ──────────────────────────────────────────────────────────────

    const toggleRow = (idx: number) => {
        setReviewRows(prev => prev.map((r, i) => i === idx ? { ...r, selected: !r.selected } : r));
    };

    const toggleAll = () => {
        const eligible = reviewRows.filter(r => r.rowStatus !== 'not_found' && r.rowStatus !== 'signed');
        const allSelected = eligible.every(r => r.selected);
        setReviewRows(prev => prev.map(r =>
            r.rowStatus !== 'not_found' && r.rowStatus !== 'signed' ? { ...r, selected: !allSelected } : r
        ));
    };

    const selectedRows = reviewRows.filter(r => r.selected && r.proposalId);

    const handleProcess = async () => {
        if (!selectedRows.length) return;
        setIsProcessing(true);
        setResults([]);

        const proposalIds = selectedRows.map(r => r.proposalId!);

        const batchResults: BatchCreateResult[] = await batchCreateClicksignEnvelopes(proposalIds);

        const finalResults: ProcessResult[] = batchResults.map(r => ({
            cpf: r.cpf,
            nomeCompleto: r.nomeCompleto,
            proposalId: r.proposalId,
            outcome: r.skipped ? 'skipped' : r.success ? 'success' : 'error',
            envelopeId: r.envelopeId,
            message: r.skipReason || r.message
        }));

        setResults(finalResults);
        setStep('results');
        setIsProcessing(false);
        loadDashboardStats();
    };

    // ── Results / Resend ────────────────────────────────────────────────────

    const handleResendAll = async () => {
        const unsigned = results.filter(r => r.outcome === 'success' && r.proposalId);
        if (!unsigned.length) return;
        setIsResending(true);

        const proposalIds = unsigned.map(r => r.proposalId!);
        const resendResults: BatchResendResult[] = await batchResendWhatsapp(proposalIds);

        setResults(prev => prev.map(r => {
            const resend = resendResults.find(rr => rr.proposalId === r.proposalId);
            if (!resend) return r;
            return { ...r, outcome: resend.success ? 'resent' : 'resend_failed', message: resend.message };
        }));

        setIsResending(false);
    };

    const handleExport = () => {
        exportCsv(results, `documentos-lote-${new Date().toISOString().slice(0, 10)}.csv`);
    };

    const handleSyncStatus = async () => {
        if (!confirm('Isso vai consultar a API do ClickSign para todos os envelopes pendentes e atualizar o status no sistema. Continuar?')) return;
        setIsSyncing(true);
        setSyncResult(null);
        try {
            const res = await batchSyncClicksignStatus();
            setSyncResult(res);
            await loadDashboardStats();
        } finally {
            setIsSyncing(false);
        }
    };

    // ── Summary stats ───────────────────────────────────────────────────────

    const stats = {
        total: results.length,
        success: results.filter(r => r.outcome === 'success' || r.outcome === 'resent').length,
        skipped: results.filter(r => r.outcome === 'skipped').length,
        error: results.filter(r => r.outcome === 'error' || r.outcome === 'resend_failed').length,
        pending: results.filter(r => r.outcome === 'success').length,
        resent: results.filter(r => r.outcome === 'resent').length,
    };

    // ── Render ──────────────────────────────────────────────────────────────

    return (
        <div className="space-y-6 max-w-6xl mx-auto">

            {/* Header */}
            <div className="bg-[#002B49] text-white p-8 rounded-3xl shadow-lg">
                <div className="flex items-center gap-4">
                    <div className="bg-[#CCFF00] p-3 rounded-2xl">
                        <FileSignature size={28} className="text-[#002B49]" />
                    </div>
                    <div>
                        <h1 className="text-3xl font-black italic text-[#CCFF00] tracking-tighter uppercase">
                            Documentos em Lote
                        </h1>
                        <p className="text-gray-400 text-sm mt-1">
                            Gere e envie documentos ClickSign para múltiplas propostas via CSV
                        </p>
                    </div>
                </div>

                {/* Breadcrumb steps */}
                <div className="flex items-center gap-2 mt-6 text-sm font-bold">
                    {(['upload', 'review', 'results'] as Step[]).map((s, i) => {
                        const labels = ['1. Upload CSV', '2. Revisão', '3. Resultados'];
                        const active = s === step;
                        const done = ['upload', 'review', 'results'].indexOf(step) > i;
                        return (
                            <span key={s} className="flex items-center gap-2">
                                <span className={`px-3 py-1 rounded-full text-xs ${active ? 'bg-[#CCFF00] text-[#002B49]' : done ? 'bg-green-500/20 text-green-400' : 'bg-white/10 text-gray-400'}`}>
                                    {done ? '✓ ' : ''}{labels[i]}
                                </span>
                                {i < 2 && <ChevronRight size={14} className="text-gray-500" />}
                            </span>
                        );
                    })}
                </div>
            </div>

            {/* Dashboard */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                    {
                        label: 'Propostas no sistema',
                        value: dashboardStats?.totalProposals,
                        icon: Users,
                        cls: 'bg-white text-[#002B49] border-gray-100',
                        iconCls: 'bg-[#002B49]/10 text-[#002B49]',
                    },
                    {
                        label: 'Documentos criados',
                        value: dashboardStats?.created,
                        icon: FileSignature,
                        cls: 'bg-white text-[#002B49] border-gray-100',
                        iconCls: 'bg-blue-50 text-blue-600',
                    },
                    {
                        label: 'Documentos assinados',
                        value: dashboardStats?.signed,
                        icon: CheckCircle2,
                        cls: 'bg-white text-[#002B49] border-gray-100',
                        iconCls: 'bg-green-50 text-green-600',
                    },
                    {
                        label: 'Aguardando assinatura',
                        value: dashboardStats?.pendingSignature,
                        icon: Clock3,
                        cls: 'bg-white text-[#002B49] border-gray-100',
                        iconCls: 'bg-yellow-50 text-yellow-600',
                    },
                ].map(({ label, value, icon: Icon, cls, iconCls }) => (
                    <div key={label} className={`${cls} rounded-2xl border shadow-sm p-5 flex items-center gap-4`}>
                        <div className={`${iconCls} w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0`}>
                            <Icon size={22} />
                        </div>
                        <div className="min-w-0">
                            <p className="text-3xl font-black tracking-tight">
                                {isLoadingDashboard ? <Loader2 className="animate-spin text-gray-300" size={26} /> : value ?? 0}
                            </p>
                            <p className="text-xs font-bold text-gray-500 mt-1 uppercase tracking-wide">{label}</p>
                        </div>
                    </div>
                ))}
            </div>

            {/* ── STEP 1: Upload CSV ── */}
            {step === 'upload' && (
                <div className="space-y-4">

                    {/* Sync Status Card */}
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                        <div className="flex items-start justify-between gap-4">
                            <div>
                                <h3 className="font-bold text-[#002B49] flex items-center gap-2">
                                    <RefreshCw size={18} className="text-[#002B49]" />
                                    Sincronizar Status de Assinatura
                                </h3>
                                <p className="text-sm text-gray-500 mt-1">
                                    Consulta a API do ClickSign para todos os envelopes pendentes e atualiza automaticamente quem já assinou.
                                    Use isso após envios em lote ou periodicamente para manter o painel atualizado.
                                </p>
                            </div>
                            <button
                                onClick={handleSyncStatus}
                                disabled={isSyncing}
                                className="flex-shrink-0 flex items-center gap-2 bg-[#002B49] text-white px-5 py-2.5 rounded-xl text-sm font-bold hover:bg-[#001f35] transition-colors disabled:opacity-50"
                            >
                                {isSyncing ? <Loader2 className="animate-spin" size={16} /> : <RefreshCw size={16} />}
                                {isSyncing ? 'Sincronizando...' : 'Sincronizar Agora'}
                            </button>
                        </div>

                        {/* Sync Result */}
                        {syncResult && (
                            <div className="mt-4 grid grid-cols-4 gap-3">
                                {[
                                    { label: 'Verificados', value: syncResult.checked, cls: 'bg-gray-50 text-gray-700 border' },
                                    { label: 'Agora Assinados', value: syncResult.nowSigned, cls: 'bg-green-50 text-green-700 border border-green-200' },
                                    { label: 'Ainda Pendentes', value: syncResult.stillPending, cls: 'bg-yellow-50 text-yellow-700 border border-yellow-200' },
                                    { label: 'Erros', value: syncResult.errors, cls: 'bg-red-50 text-red-700 border border-red-200' },
                                ].map(({ label, value, cls }) => (
                                    <div key={label} className={`${cls} rounded-xl p-3 text-center`}>
                                        <p className="text-2xl font-black">{value}</p>
                                        <p className="text-xs font-bold mt-0.5">{label}</p>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* CSV Upload Card */}
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 space-y-6">
                    <h2 className="text-lg font-bold text-[#002B49] flex items-center gap-2">
                        <Upload size={20} className="text-[#CCFF00]" />
                        Upload do arquivo CSV
                    </h2>

                    {/* Drop zone */}
                    <div
                        onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
                        onDragLeave={() => setIsDragging(false)}
                        onDrop={onDrop}
                        onClick={() => fileRef.current?.click()}
                        className={`border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition-all ${isDragging ? 'border-[#002B49] bg-[#002B49]/5' : 'border-gray-200 hover:border-[#002B49]/40 hover:bg-gray-50'}`}
                    >
                        <input
                            ref={fileRef}
                            type="file"
                            accept=".csv,.txt"
                            className="hidden"
                            onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])}
                        />
                        <Upload size={40} className="mx-auto text-gray-300 mb-4" />
                        <p className="font-bold text-gray-600">Arraste o CSV aqui ou clique para selecionar</p>
                        <p className="text-sm text-gray-400 mt-2">O arquivo deve conter CPFs — um por linha ou em colunas</p>
                    </div>

                    {/* Preview */}
                    {rawCpfs.length > 0 && (
                        <div className="bg-gray-50 rounded-xl border p-4 space-y-3">
                            <div className="flex items-center justify-between">
                                <p className="font-bold text-[#002B49] flex items-center gap-2">
                                    <FileText size={16} />
                                    {rawCpfs.length} CPF{rawCpfs.length !== 1 ? 's' : ''} encontrado{rawCpfs.length !== 1 ? 's' : ''}
                                </p>
                                <button
                                    onClick={() => setRawCpfs([])}
                                    className="text-xs text-red-500 hover:underline"
                                >
                                    Limpar
                                </button>
                            </div>
                            <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
                                {rawCpfs.slice(0, 50).map(cpf => (
                                    <span key={cpf} className="text-xs font-mono bg-white border rounded px-2 py-1 text-[#002B49]">{cpf}</span>
                                ))}
                                {rawCpfs.length > 50 && (
                                    <span className="text-xs text-gray-400 self-center">+{rawCpfs.length - 50} mais...</span>
                                )}
                            </div>
                        </div>
                    )}

                    <button
                        onClick={handleSearch}
                        disabled={!rawCpfs.length || isSearching}
                        className="flex items-center gap-2 bg-[#002B49] text-white px-8 py-3 rounded-xl font-bold hover:bg-[#001f35] transition-colors disabled:opacity-50"
                    >
                        {isSearching ? <Loader2 className="animate-spin" size={18} /> : <Search size={18} />}
                        {isSearching ? 'Buscando propostas...' : 'Buscar Propostas'}
                    </button>
                    </div>
                </div>
            )}

            {/* ── STEP 2: Review ── */}
            {step === 'review' && (
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                    <div className="p-6 border-b bg-gray-50 flex items-center justify-between">
                        <h2 className="text-lg font-bold text-[#002B49] flex items-center gap-2">
                            <ClipboardList size={20} className="text-[#CCFF00]" />
                            Revisão — {reviewRows.length} CPFs
                        </h2>
                        <div className="flex gap-3">
                            <button
                                onClick={() => { setStep('upload'); setReviewRows([]); }}
                                className="text-sm text-gray-500 hover:text-gray-700 font-bold"
                            >
                                ← Voltar
                            </button>
                            <button
                                onClick={handleProcess}
                                disabled={!selectedRows.length || isProcessing}
                                className="flex items-center gap-2 bg-[#002B49] text-white px-6 py-2.5 rounded-xl text-sm font-bold hover:bg-[#001f35] transition-colors disabled:opacity-50"
                            >
                                {isProcessing ? <Loader2 className="animate-spin" size={16} /> : <FileSignature size={16} />}
                                {isProcessing ? 'Processando...' : `Gerar para ${selectedRows.length} selecionados`}
                            </button>
                        </div>
                    </div>

                    {/* Summary cards */}
                    <div className="grid grid-cols-4 gap-px bg-gray-100">
                        {[
                            { label: 'Prontos', count: reviewRows.filter(r => r.rowStatus === 'ready').length, color: 'text-blue-600' },
                            { label: 'Com envelope', count: reviewRows.filter(r => r.rowStatus === 'has_envelope').length, color: 'text-yellow-600' },
                            { label: 'Já assinados', count: reviewRows.filter(r => r.rowStatus === 'signed').length, color: 'text-green-600' },
                            { label: 'Não encontrados', count: reviewRows.filter(r => r.rowStatus === 'not_found').length, color: 'text-red-600' },
                        ].map(({ label, count, color }) => (
                            <div key={label} className="bg-white p-4 text-center">
                                <p className={`text-2xl font-black ${color}`}>{count}</p>
                                <p className="text-xs text-gray-500 font-bold mt-1">{label}</p>
                            </div>
                        ))}
                    </div>

                    {/* Table */}
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-gray-50 border-b">
                                <tr>
                                    <th className="px-4 py-3 text-left">
                                        <input
                                            type="checkbox"
                                            className="rounded"
                                            onChange={toggleAll}
                                            checked={reviewRows.filter(r => r.rowStatus !== 'not_found' && r.rowStatus !== 'signed').every(r => r.selected)}
                                        />
                                    </th>
                                    <th className="px-4 py-3 text-left font-bold text-gray-500 uppercase text-xs tracking-wider">CPF</th>
                                    <th className="px-4 py-3 text-left font-bold text-gray-500 uppercase text-xs tracking-wider">Nome</th>
                                    <th className="px-4 py-3 text-left font-bold text-gray-500 uppercase text-xs tracking-wider">Campanha</th>
                                    <th className="px-4 py-3 text-left font-bold text-gray-500 uppercase text-xs tracking-wider">Status</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {reviewRows.map((row, idx) => (
                                    <tr
                                        key={row.cpf}
                                        className={`hover:bg-gray-50 transition-colors ${row.rowStatus === 'not_found' ? 'opacity-40' : ''}`}
                                    >
                                        <td className="px-4 py-3">
                                            <input
                                                type="checkbox"
                                                className="rounded"
                                                checked={row.selected}
                                                disabled={row.rowStatus === 'not_found' || row.rowStatus === 'signed'}
                                                onChange={() => toggleRow(idx)}
                                            />
                                        </td>
                                        <td className="px-4 py-3 font-mono text-xs text-[#002B49]">{row.cpf}</td>
                                        <td className="px-4 py-3 font-bold text-[#002B49]">{row.nomeCompleto || '—'}</td>
                                        <td className="px-4 py-3 text-gray-500">{row.campaignName || '—'}</td>
                                        <td className="px-4 py-3"><StatusBadge status={row.rowStatus} /></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* ── STEP 3: Results ── */}
            {step === 'results' && (
                <div className="space-y-4">

                    {/* Summary cards */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        {[
                            { label: 'Total', value: stats.total, icon: Users, color: 'bg-[#002B49] text-white' },
                            { label: 'Gerados', value: stats.success, icon: CheckCircle2, color: 'bg-green-500 text-white' },
                            { label: 'Pulados', value: stats.skipped, icon: RotateCw, color: 'bg-gray-400 text-white' },
                            { label: 'Erros', value: stats.error, icon: XCircle, color: 'bg-red-500 text-white' },
                        ].map(({ label, value, icon: Icon, color }) => (
                            <div key={label} className={`${color} rounded-2xl p-5 flex items-center gap-4 shadow-sm`}>
                                <Icon size={28} className="opacity-80" />
                                <div>
                                    <p className="text-3xl font-black">{value}</p>
                                    <p className="text-sm font-bold opacity-80">{label}</p>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Action bar */}
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex flex-wrap items-center gap-3">
                        <button
                            onClick={handleResendAll}
                            disabled={isResending || stats.pending === 0}
                            className="flex items-center gap-2 bg-green-600 text-white px-5 py-2.5 rounded-xl text-sm font-bold hover:bg-green-700 transition-colors disabled:opacity-40"
                        >
                            {isResending ? <Loader2 className="animate-spin" size={16} /> : <MessageCircle size={16} />}
                            {isResending ? 'Reenviando...' : `Reenviar WhatsApp (${stats.pending} pendentes)`}
                        </button>
                        <button
                            onClick={handleExport}
                            className="flex items-center gap-2 border border-[#002B49] text-[#002B49] px-5 py-2.5 rounded-xl text-sm font-bold hover:bg-[#002B49]/5 transition-colors"
                        >
                            <Download size={16} />
                            Exportar CSV de Resultado
                        </button>
                        <button
                            onClick={() => { setStep('upload'); setRawCpfs([]); setReviewRows([]); setResults([]); }}
                            className="flex items-center gap-2 text-gray-500 hover:text-gray-700 px-5 py-2.5 rounded-xl text-sm font-bold hover:bg-gray-100 transition-colors"
                        >
                            <RefreshCw size={16} />
                            Novo lote
                        </button>
                    </div>

                    {/* Results table */}
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                        <div className="p-5 border-b bg-gray-50">
                            <h3 className="font-bold text-[#002B49] flex items-center gap-2">
                                <FileSignature size={18} />
                                Relatório detalhado
                            </h3>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead className="bg-gray-50 border-b">
                                    <tr>
                                        <th className="px-4 py-3 text-left font-bold text-gray-500 uppercase text-xs tracking-wider">CPF</th>
                                        <th className="px-4 py-3 text-left font-bold text-gray-500 uppercase text-xs tracking-wider">Nome</th>
                                        <th className="px-4 py-3 text-left font-bold text-gray-500 uppercase text-xs tracking-wider">Resultado</th>
                                        <th className="px-4 py-3 text-left font-bold text-gray-500 uppercase text-xs tracking-wider">Envelope ID</th>
                                        <th className="px-4 py-3 text-left font-bold text-gray-500 uppercase text-xs tracking-wider">Detalhe</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50">
                                    {results.map((r, idx) => (
                                        <tr key={idx} className="hover:bg-gray-50 transition-colors">
                                            <td className="px-4 py-3 font-mono text-xs text-[#002B49]">{r.cpf}</td>
                                            <td className="px-4 py-3 font-bold text-[#002B49]">{r.nomeCompleto || '—'}</td>
                                            <td className="px-4 py-3"><StatusBadge status={r.outcome} /></td>
                                            <td className="px-4 py-3 font-mono text-xs text-gray-400 truncate max-w-[180px]">{r.envelopeId || '—'}</td>
                                            <td className="px-4 py-3 text-xs text-gray-500">{r.message || '—'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* Processing overlay */}
            {isProcessing && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
                    <div className="bg-white rounded-3xl p-10 max-w-md w-full mx-4 text-center shadow-2xl">
                        <Loader2 size={48} className="animate-spin text-[#002B49] mx-auto mb-4" />
                        <h3 className="text-xl font-black text-[#002B49] mb-2">Gerando documentos...</h3>
                        <p className="text-gray-500 text-sm">Processando sequencialmente para respeitar os limites da API ClickSign.</p>
                        <p className="text-gray-400 text-xs mt-2">Não feche esta janela.</p>
                    </div>
                </div>
            )}
        </div>
    );
}
