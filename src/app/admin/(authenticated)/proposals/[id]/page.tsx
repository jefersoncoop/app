'use client';

import { getProposalById } from '@/actions/proposal-actions';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ChevronLeft, FileText, Download, Calendar, User, IdentificationCard, Phone, MapPin, Briefcase, Mail } from 'lucide-react';
import { motion } from 'framer-motion';

export default function ProposalDetailPage() {
    const { id } = useParams();
    const router = useRouter();
    const [proposal, setProposal] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function fetchProposal() {
            setLoading(true);
            const data = await getProposalById(id as string);
            setProposal(data);
            setLoading(false);
        }
        if (id) fetchProposal();
    }, [id]);

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
                {children}Section
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

            <header className="flex justify-between items-center bg-[#002B49] text-white p-8 rounded-3xl shadow-lg">
                <div>
                    <h1 className="text-3xl font-black italic text-[#CCFF00] tracking-tighter uppercase">{proposal.nomeCompleto}</h1>
                    <p className="text-gray-400 text-sm">Ficha enviada em: {new Date(proposal.createdAt).toLocaleString('pt-BR')}</p>
                </div>
                <div className={`px-4 py-2 rounded-xl text-sm font-black uppercase ${proposal.status === 'completed' ? 'bg-green-500/20 text-green-400 border border-green-500/30' :
                        proposal.status === 'documents_received' ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' :
                            'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30'
                    }`}>
                    {proposal.status === 'completed' ? 'Concluída' :
                        proposal.status === 'documents_received' ? 'Documentos Recebidos' : 'Pendente'}
                </div>
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
