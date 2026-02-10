'use client';

import { getProposalById, resendInitialNotification } from '@/actions/proposal-actions';
import { syncProposalWithCRM, resendFinalNotification } from '@/actions/document-actions';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ChevronLeft, FileText, Download, Calendar, User, IdCard, Phone, MapPin, Briefcase, Mail, Send, CheckCircle2, AlertCircle, Loader2, Bell, History, RotateCw, LinkIcon, Check } from 'lucide-react';
import { motion } from 'framer-motion';

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
                    <div className={`mt-6 p-4 rounded-xl flex items-center gap-3 animate-in fade-in slide-in-from-top-4 duration-500 ${syncResult.success ? 'bg-green-500/20 border border-green-500/30 text-green-400' : 'bg-red-500/20 border border-red-500/30 text-red-00'}`}>
                        {syncResult.success ? <CheckCircle2 size={24} /> : <AlertCircle size={24} />}
                        <div>
                            <p className="font-bold">{syncResult.success ? 'Sucesso!' : 'Ocorreu um erro'}</p>
                            <p className="text-sm opacity-80">{syncResult.success ? 'A proposta foi enviada com sucesso para o CRM.' : syncResult.message}</p>
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
                        {proposal.documents.map((doc: any) => (
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
                                <a
                                    href={doc.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center justify-center gap-2 bg-[#002B49] text-white py-3 rounded-xl text-xs font-bold hover:bg-[#001b2e] transition-colors"
                                >
                                    <Download size={14} /> VISUALIZAR ARQUIVO
                                </a>
                                <p className="text-[9px] text-center text-gray-400">Enviado em: {new Date(doc.uploadedAt).toLocaleString('pt-BR')}</p>
                            </motion.div>
                        ))}
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
