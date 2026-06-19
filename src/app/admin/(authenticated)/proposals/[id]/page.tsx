'use client';

import { getProposalById, resendInitialNotification } from '@/actions/proposal-actions';
import { syncProposalWithCRM, resendFinalNotification, deleteProposalDocument } from '@/actions/document-actions';
import { resendClicksignWhatsapp, forceCreateClicksignEnvelope, getClicksignSignedDocumentUrl } from '@/actions/clicksign-actions';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ChevronLeft, FileText, Download, User, Phone, MapPin, Briefcase, Send, CheckCircle2, AlertCircle, Loader2, Bell, RotateCw, LinkIcon, Check, Trash2, AlertTriangle, PenLine, MessageCircle } from 'lucide-react';
import { motion } from 'framer-motion';

function formatBytes(bytes?: number) {
    if (!bytes) return 'Indisponível';
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export default function ProposalDetailPage() {
    const { id } = useParams();
    const router = useRouter();
    const [proposal, setProposal] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [isSyncing, setIsSyncing] = useState(false);
    const [isResending, setIsResending] = useState<string | null>(null);
    const [syncResult, setSyncResult] = useState<{ success: boolean, message: string } | null>(null);
    const [resendResult, setResendResult] = useState<{ success: boolean, message: string } | null>(null);
    const [copied, setCopied] = useState(false);
    const [deletingDocId, setDeletingDocId] = useState<string | null>(null);
    const [isResendingWhatsapp, setIsResendingWhatsapp] = useState(false);
    const [whatsappResendResult, setWhatsappResendResult] = useState<{ success: boolean, message: string } | null>(null);
    const [isGeneratingDoc, setIsGeneratingDoc] = useState(false);
    const [generateDocResult, setGenerateDocResult] = useState<{ success: boolean, message: string } | null>(null);
    const [isDownloadingDoc, setIsDownloadingDoc] = useState(false);

    const handleDeleteDoc = async (docId: string, docType: string, storagePath?: string) => {
        if (!confirm("Tem certeza que deseja excluir permanentemente este documento anexado?")) return;
        setDeletingDocId(docId);
        try {
            const res = await deleteProposalDocument(id as string, docId, docType, storagePath);
            if (res.success) {
                // Refresh proposal data
                const data = await getProposalById(id as string);
                setProposal(data);
            } else {
                alert(res.message || "Erro ao excluir documento");
            }
        } catch (error) {
            console.error("Delete error:", error);
            alert("Erro ao excluir o documento.");
        } finally {
            setDeletingDocId(null);
        }
    };

    const isDuplicateDoc = (doc: any) => {
        if (!doc.hash) return false;
        return proposal?.documents?.some((otherDoc: any) => otherDoc.id !== doc.id && otherDoc.hash === doc.hash);
    };


    useEffect(() => {
        async function fetchProposal() {
            setLoading(true);
            const data = await getProposalById(id as string);
            setProposal(data);
            setLoading(false);
        }
        if (id) fetchProposal();
    }, [id]);

    const handleSyncCRM = async () => {
        setIsSyncing(true);
        setSyncResult(null);
        try {
            const result = await syncProposalWithCRM(id as string);
            setSyncResult(result);
            if (result.success) {
                // Refresh data if status changed or just to be safe
                const data = await getProposalById(id as string);
                setProposal(data);
            }
        } catch (error) {
            setSyncResult({ success: false, message: "Erro ao conectar com o servidor" });
        } finally {
            setIsSyncing(false);
        }
    };

    const handleResendNotification = async (type: 'initial' | 'final') => {
        setIsResending(type);
        setResendResult(null);
        try {
            const result = type === 'initial'
                ? await resendInitialNotification(id as string)
                : await resendFinalNotification(id as string);

            setResendResult({
                success: result.success,
                message: result.message || (result.success ? "Enviado" : "Erro desconhecido")
            });

            if (result.success) {
                // Refresh data to show new log
                const data = await getProposalById(id as string);
                setProposal(data);
            }
        } catch (error) {
            setResendResult({ success: false, message: "Erro ao reenviar notificação" });
        } finally {
            setIsResending(null);
        }
    };

    const handleCopyLink = async () => {
        const url = `${window.location.origin}/upload/${proposal.uploadToken}`;
        try {
            await navigator.clipboard.writeText(url);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (err) {
            console.error('Failed to copy: ', err);
        }
    };

    const handleResendWhatsapp = async () => {
        setIsResendingWhatsapp(true);
        setWhatsappResendResult(null);
        try {
            const result = await resendClicksignWhatsapp(id as string);
            setWhatsappResendResult({ success: result.success, message: result.message || '' });
        } catch (err) {
            setWhatsappResendResult({ success: false, message: 'Erro ao reenviar' });
        } finally {
            setIsResendingWhatsapp(false);
        }
    };

    const handleGenerateDoc = async () => {
        if (!confirm('Isso irá gerar um NOVO documento ClickSign para esta proposta. Se já existir um envelope ativo, ele será descartado. Confirmar?')) return;
        setIsGeneratingDoc(true);
        setGenerateDocResult(null);
        try {
            const result = await forceCreateClicksignEnvelope(id as string);
            setGenerateDocResult({ success: result.success, message: result.message || (result.success ? 'Envelope criado com sucesso!' : 'Falha ao criar envelope') });
            if (result.success) {
                setTimeout(() => window.location.reload(), 1500);
            }
        } catch (err) {
            setGenerateDocResult({ success: false, message: 'Erro ao gerar documento' });
        } finally {
            setIsGeneratingDoc(false);
        }
    };

    const handleDownloadDoc = async () => {
        setIsDownloadingDoc(true);
        try {
            const result = await getClicksignSignedDocumentUrl(id as string);
            if (result.success && result.url) {
                // Open the pre-signed S3 URL directly — browser will download the PDF
                window.open(result.url, '_blank');
            } else {
                alert(result.message || 'Não foi possível obter o link do documento.');
            }
        } catch (err) {
            alert('Erro ao baixar o documento.');
        } finally {
            setIsDownloadingDoc(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#002B49]"></div>
            </div>
        );
    }

    if (!proposal) {
        return (
            <div className="p-8 text-center bg-white rounded-2xl shadow-sm border">
                <FileText className="mx-auto text-gray-300 mb-4" size={48} />
                <h3 className="text-xl font-bold text-gray-700">Proposta não encontrada</h3>
                <button onClick={() => router.back()} className="mt-4 text-[#002B49] font-bold underline">Voltar</button>
            </div>
        );
    }

    const Section = ({ title, icon: Icon, children }: any) => (
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
            <h3 className="text-lg font-bold text-[#002B49] mb-4 flex items-center gap-2 border-b pb-2">
                <Icon size={20} className="text-[#CCFF00] fill-[#002B49]" />
                {title}
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {children}
            </div>
        </div>
    );

    const InfoField = ({ label, value }: { label: string, value: any }) => (
        <div>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">{label}</p>
            <p className="font-bold text-[#002B49]">{value || '-'}</p>
        </div>
    );

    return (
        <div className="space-y-6 max-w-6xl mx-auto">
            <button
                onClick={() => router.back()}
                className="flex items-center gap-2 text-[#002B49] hover:translate-x-[-4px] transition-transform font-bold"
            >
                <ChevronLeft size={20} /> Voltar para a lista
            </button>

            <header className="bg-[#002B49] text-white p-8 rounded-3xl shadow-lg">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                    <div>
                        <h1 className="text-3xl font-black italic text-[#CCFF00] tracking-tighter uppercase">{proposal.nomeCompleto}</h1>
                        <p className="text-gray-400 text-sm">Ficha enviada em: {new Date(proposal.createdAt).toLocaleString('pt-BR')}</p>
                    </div>
                    <div className="flex flex-col items-end gap-3">
                        <div className={`px-4 py-2 rounded-xl text-sm font-black uppercase ${proposal.status === 'completed' ? 'bg-green-500/20 text-green-400 border border-green-500/30' :
                            proposal.status === 'documents_received' ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' :
                                'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30'
                            }`}>
                            {proposal.status === 'completed' ? 'Concluída' :
                                proposal.status === 'documents_received' ? 'Documentos Recebidos' : 'Pendente'}
                        </div>
                        <div className="flex flex-col md:flex-row gap-3">
                            <button
                                onClick={handleCopyLink}
                                className={`flex items-center gap-2 px-6 py-3 rounded-xl font-bold transition-all border ${copied ? 'bg-green-500/20 text-green-400 border-green-500/30' : 'bg-white/10 text-white hover:bg-white/20 border-white/10'}`}
                            >
                                {copied ? <Check size={20} /> : <LinkIcon size={20} />}
                                {copied ? 'COPIADO!' : 'COPIAR LINK DOCS'}
                            </button>
                            <button
                                onClick={handleGenerateDoc}
                                disabled={isGeneratingDoc}
                                className="flex items-center gap-2 bg-purple-500/20 text-purple-300 border border-purple-500/30 px-6 py-3 rounded-xl font-bold hover:bg-purple-500/30 transition-all disabled:opacity-50"
                                title="Gerar documento ClickSign para assinatura"
                            >
                                {isGeneratingDoc ? <Loader2 className="animate-spin" size={20} /> : <PenLine size={20} />}
                                {isGeneratingDoc ? 'GERANDO...' : proposal.clicksignEnvelopeId ? 'REGEN. DOC CLICKSIGN' : 'GERAR DOC CLICKSIGN'}
                            </button>
                            <button
                                onClick={handleSyncCRM}
                                disabled={isSyncing}
                                className="flex items-center gap-2 bg-[#CCFF00] text-[#002B49] px-6 py-3 rounded-xl font-bold hover:shadow-lg hover:translate-y-[-2px] transition-all disabled:opacity-50 disabled:translate-y-0"
                            >
                                {isSyncing ? <Loader2 className="animate-spin" size={20} /> : <Send size={20} />}
                                {isSyncing ? 'SINCRONIZANDO...' : 'SINCRONIZAR CRM'}
                            </button>
                        </div>
                    </div>
                </div>

                {syncResult && (
                    <div className={`mt-4 p-4 rounded-xl flex items-center gap-3 animate-in fade-in slide-in-from-top-4 duration-500 ${syncResult.success ? 'bg-green-500/20 border border-green-500/30 text-green-400' : 'bg-red-500/20 border border-red-500/30 text-red-400'}`}>
                        {syncResult.success ? <CheckCircle2 size={24} /> : <AlertCircle size={24} />}
                        <div>
                            <p className="font-bold">{syncResult.success ? 'Sucesso!' : 'Ocorreu um erro'}</p>
                            <p className="text-sm opacity-80">{syncResult.success ? 'A proposta foi enviada com sucesso para o CRM.' : syncResult.message}</p>
                        </div>
                    </div>
                )}
                {generateDocResult && (
                    <div className={`mt-4 p-4 rounded-xl flex items-center gap-3 animate-in fade-in slide-in-from-top-4 duration-500 ${generateDocResult.success ? 'bg-green-500/20 border border-green-500/30 text-green-400' : 'bg-red-500/20 border border-red-500/30 text-red-400'}`}>
                        {generateDocResult.success ? <CheckCircle2 size={24} /> : <AlertCircle size={24} />}
                        <div>
                            <p className="font-bold">{generateDocResult.success ? 'Documento gerado!' : 'Erro ao gerar'}</p>
                            <p className="text-sm opacity-80">{generateDocResult.message}</p>
                        </div>
                    </div>
                )}
            </header>

            <Section title="Dados Pessoais" icon={User}>
                <InfoField label="Nome Completo" value={proposal.nomeCompleto} />
                <InfoField label="Nome da Mãe" value={proposal.nomeMae} />
                <InfoField label="CPF" value={proposal.cpf} />
                <InfoField label="PIS/NIT" value={proposal.pis} />
                <InfoField label="Identidade (RG)" value={proposal.identidade} />
                <InfoField label="Órgão Exp / UF" value={`${proposal.orgaoExpedidor} / ${proposal.estadoExpedidor}`} />
                <InfoField label="Data Nascimento" value={proposal.dataNascimento} />
                <InfoField label="Naturalidade" value={proposal.naturalidade} />
                <InfoField label="Nacionalidade" value={proposal.nacionalidade} />
                <InfoField label="Sexo" value={proposal.sexo === 'M' ? 'Masculino' : proposal.sexo === 'F' ? 'Feminino' : proposal.sexo} />
                <InfoField label="Cor/Raça" value={proposal.corRaca} />
                <InfoField label="Estado Civil" value={proposal.estadoCivil} />
            </Section>

            <Section title="Endereço" icon={MapPin}>
                <InfoField label="CEP" value={proposal.cep} />
                <InfoField label="Logradouro" value={proposal.logradouro} />
                <InfoField label="Número" value={proposal.numero} />
                <InfoField label="Bairro" value={proposal.bairro} />
                <InfoField label="Complemento" value={proposal.complemento} />
                <InfoField label="Cidade / UF" value={`${proposal.cidade} / ${proposal.uf}`} />
            </Section>

            <Section title="Contatos" icon={Phone}>
                <InfoField label="WhatsApp" value={proposal.telefone} />
                <InfoField label="Email" value={proposal.email} />
            </Section>

            <Section title="Dados Profissionais" icon={Briefcase}>
                <InfoField label="Profissão" value={proposal.profissao} />
                <InfoField label="Renda Mensal" value={proposal.rendaMensal ? `R$ ${proposal.rendaMensal}` : null} />
            </Section>

            {/* ClickSign Signature Section */}
            {proposal.clicksignEnvelopeId && (
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                    <div className="flex justify-between items-start mb-4 border-b pb-2">
                        <h3 className="text-lg font-bold text-[#002B49] flex items-center gap-2">
                            <PenLine size={20} className="text-[#CCFF00] fill-[#002B49]" />
                            Assinatura ClickSign
                        </h3>
                        <span className={`px-3 py-1 rounded-full text-xs font-black uppercase ${
                            proposal.clicksignStatus === 'signed'
                                ? 'bg-green-100 text-green-700'
                                : 'bg-yellow-100 text-yellow-700'
                        }`}>
                            {proposal.clicksignStatus === 'signed' ? '✅ Assinado' : '⏳ Aguardando assinatura'}
                        </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm mb-4">
                        <div>
                            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Envelope ID</p>
                            <p className="font-mono text-xs text-[#002B49] break-all">{proposal.clicksignEnvelopeId}</p>
                        </div>
                        <div>
                            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Signer ID</p>
                            <p className="font-mono text-xs text-[#002B49] break-all">{proposal.clicksignSignerId}</p>
                        </div>
                        <div>
                            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Status ClickSign</p>
                            <p className="font-bold text-[#002B49]">{proposal.clicksignStatus || 'pending'}</p>
                        </div>
                    </div>

                    {/* WhatsApp Signing Info */}
                    {proposal.clicksignStatus !== 'signed' && (
                        <div className="bg-gray-50 rounded-xl border p-4 space-y-3">
                            <div className="flex items-start gap-3">
                                <MessageCircle className="text-green-600 flex-shrink-0 mt-0.5" size={18} />
                                <div>
                                    <p className="text-sm font-bold text-[#002B49]">Link enviado via WhatsApp</p>
                                    <p className="text-xs text-gray-500 mt-1">
                                        O ClickSign gera um link único e temporário por notificação — ele não pode ser acessado diretamente aqui. Use o botão abaixo para reenviar um novo link ao signatário.
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={handleResendWhatsapp}
                                disabled={isResendingWhatsapp}
                                className="w-full flex items-center justify-center gap-2 bg-green-600 text-white px-4 py-3 rounded-xl text-sm font-bold hover:bg-green-700 transition-colors disabled:opacity-50"
                            >
                                {isResendingWhatsapp
                                    ? <Loader2 className="animate-spin" size={16} />
                                    : <MessageCircle size={16} />
                                }
                                REENVIAR LINK DE ASSINATURA VIA WHATSAPP
                            </button>
                            {whatsappResendResult && (
                                <p className={`text-xs font-bold text-center ${
                                    whatsappResendResult.success ? 'text-green-600' : 'text-red-600'
                                }`}>
                                    {whatsappResendResult.success
                                        ? '✅ WhatsApp reenviado! O signatário receberá o link em instantes.'
                                        : `❌ ${whatsappResendResult.message}`
                                    }
                                </p>
                            )}
                        </div>
                    )}

                    {/* Download signed PDF */}
                    <div className="flex items-center gap-3 pt-1">
                        <button
                            onClick={handleDownloadDoc}
                            disabled={isDownloadingDoc}
                            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold border transition-colors disabled:opacity-50 ${
                                proposal.clicksignStatus === 'signed'
                                    ? 'bg-[#002B49] text-white border-[#002B49] hover:bg-[#001f35]'
                                    : 'bg-gray-100 text-gray-500 border-gray-200 hover:bg-gray-200'
                            }`}
                            title={proposal.clicksignStatus === 'signed' ? 'Baixar PDF assinado' : 'Baixar documento original (ainda não assinado)'}
                        >
                            {isDownloadingDoc
                                ? <Loader2 className="animate-spin" size={14} />
                                : <Download size={14} />
                            }
                            {isDownloadingDoc
                                ? 'OBTENDO LINK...'
                                : proposal.clicksignStatus === 'signed'
                                    ? 'BAIXAR PDF ASSINADO'
                                    : 'BAIXAR DOCUMENTO (PENDENTE)'
                            }
                        </button>
                        {proposal.clicksignStatus === 'signed' && (
                            <span className="text-xs text-gray-400">Link gerado pelo ClickSign · expira em ~5 min</span>
                        )}
                    </div>
                </div>
            )}

            {/* Notification Logs Section */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                <header className="flex justify-between items-center mb-6 border-b pb-2">
                    <h3 className="text-lg font-bold text-[#002B49] flex items-center gap-2">
                        <Bell size={20} className="text-[#CCFF00] fill-[#002B49]" />
                        Log de Notificações
                    </h3>
                    <div className="flex gap-2">
                        <button
                            onClick={() => handleResendNotification('initial')}
                            disabled={isResending !== null}
                            className="flex items-center gap-2 bg-gray-100 text-[#002B49] px-4 py-2 rounded-xl text-xs font-bold hover:bg-gray-200 transition-all disabled:opacity-50"
                        >
                            {isResending === 'initial' ? <Loader2 className="animate-spin" size={14} /> : <RotateCw size={14} />}
                            REENVIAR 1ª (INICIAL)
                        </button>
                        <button
                            onClick={() => handleResendNotification('final')}
                            disabled={isResending !== null || proposal.status === 'pending_documents'}
                            className="flex items-center gap-2 bg-gray-100 text-[#002B49] px-4 py-2 rounded-xl text-xs font-bold hover:bg-gray-200 transition-all disabled:opacity-50"
                        >
                            {isResending === 'final' ? <Loader2 className="animate-spin" size={14} /> : <RotateCw size={14} />}
                            REENVIAR 2ª (FINAL)
                        </button>
                    </div>
                </header>

                {resendResult && (
                    <div className={`mb-4 p-3 rounded-xl flex items-center gap-3 text-sm animate-in fade-in slide-in-from-top-2 duration-300 ${resendResult.success ? 'bg-green-50 text-green-700 border border-green-100' : 'bg-red-50 text-red-700 border border-red-100'}`}>
                        {resendResult.success ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                        <p>{resendResult.success ? 'Notificação reenviada com sucesso!' : resendResult.message}</p>
                    </div>
                )}

                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="text-xs font-bold text-gray-400 uppercase tracking-wider border-b">
                                <th className="pb-3 px-2">Tipo</th>
                                <th className="pb-3 px-2">Status</th>
                                <th className="pb-3 px-2">Data/Hora</th>
                                <th className="pb-3 px-2">Detalhes</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {proposal.notifications && proposal.notifications.length > 0 ? (
                                proposal.notifications.map((log: any) => (
                                    <tr key={log.id} className="text-sm">
                                        <td className="py-3 px-2 font-bold text-[#002B49]">
                                            {log.type === 'initial' ? 'Ficha Inicial' : 'Finalização'}
                                        </td>
                                        <td className="py-3 px-2">
                                            <span className={`px-2 py-1 rounded-full text-[10px] font-black uppercase ${log.status === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                                {log.status === 'success' ? 'Sucesso' : 'Falha'}
                                            </span>
                                        </td>
                                        <td className="py-3 px-2 text-gray-500">
                                            {new Date(log.timestamp).toLocaleString('pt-BR')}
                                        </td>
                                        <td className="py-3 px-2 text-xs text-gray-400">
                                            {log.error || log.payload?.numero || '-'}
                                        </td>
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan={4} className="py-8 text-center text-gray-400 italic">
                                        Nenhuma notificação registrada.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 mt-8">
                <h3 className="text-lg font-bold text-[#002B49] mb-6 flex items-center gap-2 border-b pb-2">
                    <FileText size={20} className="text-[#CCFF00] fill-[#002B49]" />
                    Anexos e Documentação
                </h3>

                {proposal.documents && proposal.documents.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {proposal.documents.map((doc: any) => {
                            const isDuplicate = isDuplicateDoc(doc);
                            return (
                                <motion.div
                                    key={doc.id}
                                    whileHover={{ scale: 1.02 }}
                                    className="border rounded-2xl p-4 flex flex-col gap-4 bg-gray-50 hover:bg-white hover:shadow-md transition-all group"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="bg-[#002B49] text-[#CCFF00] p-3 rounded-xl group-hover:scale-110 transition-transform">
                                            <FileText size={24} />
                                        </div>
                                        <div className="flex-1 overflow-hidden">
                                            <p className="text-sm font-bold text-[#002B49] truncate uppercase">{doc.type?.replace('_', ' ')}</p>
                                            <p className="text-[10px] text-gray-400 truncate">{doc.filename}</p>
                                        </div>
                                    </div>

                                    {/* Info: Size & Hash (Duplicate Badge) */}
                                    <div className="flex justify-between items-center text-[10px] font-semibold text-gray-500 bg-white/50 p-2 rounded-lg border">
                                        <span>Tam: <span className="font-bold text-[#002B49]">{formatBytes(doc.size)}</span></span>
                                        {isDuplicate && (
                                            <span className="flex items-center gap-1 text-red-600 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded font-black uppercase text-[8px] animate-pulse">
                                                <AlertTriangle size={10} /> Repetido
                                            </span>
                                        )}
                                    </div>

                                    <div className="flex flex-col gap-2">
                                        <a
                                            href={doc.url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="flex items-center justify-center gap-2 bg-[#002B49] text-white py-3 rounded-xl text-xs font-bold hover:bg-[#001b2e] transition-colors"
                                        >
                                            <Download size={14} /> VISUALIZAR ARQUIVO
                                        </a>
                                        <button
                                            onClick={() => handleDeleteDoc(doc.id, doc.type, doc.path)}
                                            disabled={deletingDocId === doc.id}
                                            className="flex items-center justify-center gap-2 bg-red-50 text-red-600 border border-red-200 py-2.5 rounded-xl text-xs font-bold hover:bg-red-100 hover:text-red-700 transition-colors disabled:opacity-50"
                                        >
                                            {deletingDocId === doc.id ? (
                                                <Loader2 className="animate-spin" size={14} />
                                            ) : (
                                                <Trash2 size={14} />
                                            )}
                                            EXCLUIR ANEXO
                                        </button>
                                    </div>
                                    <p className="text-[9px] text-center text-gray-400">Enviado em: {new Date(doc.uploadedAt).toLocaleString('pt-BR')}</p>
                                </motion.div>
                            );
                        })}
                    </div>
                ) : (
                    <div className="text-center py-12 bg-gray-50 rounded-2xl border-2 border-dashed border-gray-200">
                        <FileText size={48} className="mx-auto text-gray-300 mb-2" />
                        <p className="text-gray-500 font-bold">Nenhum documento anexado até agora.</p>
                        <p className="text-xs text-gray-400">O usuário ainda não finalizou o envio dos documentos.</p>
                    </div>
                )}
            </div>
        </div>
    );
}
