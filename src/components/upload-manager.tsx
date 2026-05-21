'use client';

import React, { useState, useEffect } from 'react';
import UploadZone from './upload-interface';
import { finalizeUploads, getProposalDocuments } from '@/actions/document-actions';
import { CheckCircle, Send, Loader2, AlertCircle, HardDrive } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface UploadManagerProps {
    proposalId: string;
    userName: string;
    formType?: string;
}

export default function UploadManager({ proposalId, userName, formType = 'coopedu' }: UploadManagerProps) {
    const [uploadedDocs, setUploadedDocs] = useState<Set<string>>(new Set());
    const [uploadedDocsDetails, setUploadedDocsDetails] = useState<Record<string, { filename: string, hash: string, size: number, url: string, path?: string, id: string }>>({});
    const [loadingExisting, setLoadingExisting] = useState(true);
    const [isFinalizing, setIsFinalizing] = useState(false);
    const [isFinished, setIsFinished] = useState(false);

    const REQUIRED_DOCS = [
        { id: 'identidade_frente', label: 'Documento de Identidade com CPF *', desc: 'Frente do documento' },
        { id: 'identidade_verso', label: 'Documento de Identidade com CPF/Verso *', desc: 'Verso do documento' },
        { id: 'comprovante_pis', label: 'Comprovante do número PIS/PASEP/NIT *', desc: 'Extrato ou print do app' },
        { id: 'comprovante_residencia', label: 'Comprovante de Residência *', desc: 'Conta de luz, água ou telefone recente' },
    ];

    const OPTIONAL_DOCS = [
        { id: 'cnh', label: 'CNH', desc: 'Carteira Nacional de Habilitação' },
        { id: 'certidao', label: 'Certidão de Nascimento ou Casamento', desc: 'Certidão legível' },
        { id: 'curriculo', label: 'Currículo', desc: 'Seu currículo atualizado' },
        { id: 'diploma', label: 'Diploma', desc: 'Comprovante de escolaridade' },
    ];

    useEffect(() => {
        async function loadDocs() {
            try {
                const res = await getProposalDocuments(proposalId);
                if (res.success && res.documents) {
                    const details: Record<string, any> = {};
                    const uploadedIds = new Set<string>();
                    
                    res.documents.forEach((doc: any) => {
                        if (doc.type) {
                            details[doc.type] = {
                                id: doc.id,
                                filename: doc.filename,
                                hash: doc.hash || '',
                                size: doc.size || 0,
                                url: doc.url,
                                path: doc.path || ''
                            };
                            uploadedIds.add(doc.type);
                        }
                    });
                    
                    setUploadedDocsDetails(details);
                    setUploadedDocs(uploadedIds);
                }
            } catch (err) {
                console.error("Error loading existing documents:", err);
            } finally {
                setLoadingExisting(false);
            }
        }
        loadDocs();
    }, [proposalId]);

    const getDocLabel = (id: string): string => {
        const allDocs = [...REQUIRED_DOCS, ...OPTIONAL_DOCS];
        const doc = allDocs.find(d => d.id === id);
        return doc ? doc.label.replace(' *', '') : id;
    };

    const handleSuccess = (id: string, docInfo: any) => {
        setUploadedDocs(prev => new Set(prev).add(id));
        setUploadedDocsDetails(prev => ({
            ...prev,
            [id]: docInfo
        }));
    };

    const handleDelete = (id: string) => {
        setUploadedDocs(prev => {
            const next = new Set(prev);
            next.delete(id);
            return next;
        });
        setUploadedDocsDetails(prev => {
            const next = { ...prev };
            delete next[id];
            return next;
        });
    };

    const handleBeforeUpload = async (file: File, hash: string): Promise<boolean> => {
        // 1. Check for duplicates in other slots
        const duplicateEntry = Object.entries(uploadedDocsDetails).find(([type, doc]) => doc.hash === hash);
        if (duplicateEntry) {
            alert(`Este arquivo já foi enviado no campo "${getDocLabel(duplicateEntry[0])}". Por favor, envie um arquivo diferente.`);
            return false;
        }

        // 2. Check total size limit (28MB = 29,360,128 bytes)
        const currentTotalSize = Object.values(uploadedDocsDetails).reduce((acc, doc) => acc + (doc.size || 0), 0);
        const newTotalSize = currentTotalSize + file.size;
        const LIMIT_28MB = 28 * 1024 * 1024;
        
        if (newTotalSize > LIMIT_28MB) {
            alert(`O limite total combinado para envio é de 30MB. Com este novo arquivo, o total seria de ${(newTotalSize / 1024 / 1024).toFixed(2)}MB (já enviado: ${(currentTotalSize / 1024 / 1024).toFixed(2)}MB). Por favor, reduza o tamanho do arquivo.`);
            return false;
        }

        return true;
    };

    const handleFinalize = async () => {
        setIsFinalizing(true);
        try {
            const res = await finalizeUploads(proposalId);
            if (res.success) {
                setIsFinished(true);
            }
        } catch (error) {
            console.error(error);
        } finally {
            setIsFinalizing(false);
        }
    };

    if (loadingExisting) {
        return (
            <div className="h-64 flex flex-col justify-center items-center space-y-4 bg-white rounded-3xl border shadow-sm p-6">
                <Loader2 className="animate-spin text-[#002B49]" size={40} />
                <p className="text-gray-500 font-bold text-sm">Carregando seus documentos...</p>
            </div>
        );
    }

    if (isFinished) {
        const isCoopera = formType === 'coopera';
        return (
            <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className={`bg-white p-12 rounded-3xl shadow-xl text-center space-y-6 border ${isCoopera ? 'border-blue-100' : 'border-lime-100'}`}
            >
                <div className={`${isCoopera ? 'bg-blue-100' : 'bg-lime-100'} w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-6`}>
                    <CheckCircle className={isCoopera ? 'text-blue-600' : 'text-lime-600'} size={48} />
                </div>
                <h2 className="text-3xl font-black text-[#002B49] uppercase">Envio Concluído!</h2>
                <p className="text-gray-600 text-lg">
                    Obrigado, <span className="font-bold">{userName}</span>. <br />
                    {isCoopera 
                        ? "Recebemos seus documentos com sucesso. Sua inscrição para mediador pedagógico será analisada e entraremos em contato em breve."
                        : "Recebemos seus documentos com sucesso. Nossa equipe irá analisar e entraremos em contato em breve."
                    }
                </p>
                <div className="pt-6">
                    <button
                        onClick={() => window.close()}
                        className="bg-[#002B49] text-white px-8 py-4 rounded-xl font-bold hover:bg-[#001f35] transition-all"
                    >
                        FECHAR PÁGINA
                    </button>
                </div>
            </motion.div>
        );
    }

    const allRequiredUploaded = REQUIRED_DOCS.every(doc => uploadedDocs.has(doc.id));
    const totalBytesUploaded = Object.values(uploadedDocsDetails).reduce((acc, doc) => acc + (doc.size || 0), 0);
    const totalMBUploaded = totalBytesUploaded / 1024 / 1024;
    const progressPercent = Math.min((totalBytesUploaded / (30 * 1024 * 1024)) * 100, 100);

    let barColor = 'bg-emerald-500';
    let bgBadge = 'bg-emerald-50 text-emerald-700 border-emerald-200';
    if (totalMBUploaded > 20) {
        barColor = 'bg-amber-500';
        bgBadge = 'bg-amber-50 text-amber-700 border-amber-200';
    }
    if (totalMBUploaded > 26) {
        barColor = 'bg-red-500 animate-pulse';
        bgBadge = 'bg-red-50 text-red-700 border-red-200';
    }

    return (
        <div className="space-y-10">
            {/* Real-time size indicator */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 space-y-3">
                <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                        <HardDrive className="text-[#002B49]" size={20} />
                        <h4 className="font-bold text-[#002B49] text-sm uppercase tracking-wider">Espaço de Envio (Total CRM)</h4>
                    </div>
                    <span className={`px-2.5 py-1 rounded-full text-xs font-bold border ${bgBadge}`}>
                        {totalMBUploaded.toFixed(2)} MB / 30 MB
                    </span>
                </div>
                <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden border">
                    <motion.div
                        className={`h-full ${barColor}`}
                        initial={{ width: 0 }}
                        animate={{ width: `${progressPercent}%` }}
                        transition={{ duration: 0.5, ease: 'easeOut' }}
                    />
                </div>
                <p className="text-gray-500 text-xs">
                    {totalMBUploaded > 26 
                        ? 'Atenção: Você está muito próximo ao limite de 30MB aceito pelo CRM. Se necessário, envie arquivos menores.' 
                        : 'Para que o seu cadastro seja processado corretamente, todos os arquivos enviados combinados devem somar menos de 30MB.'}
                </p>
            </div>

            <section className="space-y-4">
                <div className="flex items-center justify-between border-b-2 border-[#CCFF00] pb-2">
                    <h3 className="text-xl font-black text-[#002B49] uppercase italic tracking-tighter">
                        Bloco Obrigatórios
                    </h3>
                    <span className="bg-[#CCFF00] text-[#002B49] px-3 py-1 rounded-full text-xs font-black uppercase tracking-widest animate-pulse">
                        Obrigatório
                    </span>
                </div>
                <div className="bg-yellow-50 p-4 rounded-xl border-l-4 border-yellow-400 text-yellow-800 text-sm">
                    <p className="font-bold flex items-center gap-2">
                        <AlertCircle size={18} /> Atenção
                    </p>
                    <p>O envio de todos os documentos marcados com asterisco (*) é indispensável para prosseguir com a sua proposta.</p>
                </div>
                <div className="space-y-4">
                    {REQUIRED_DOCS.map((doc) => (
                        <UploadZone
                            key={doc.id}
                            proposalId={proposalId}
                            docType={doc.id}
                            label={doc.label}
                            description={doc.desc}
                            onSuccess={(docInfo) => handleSuccess(doc.id, docInfo)}
                            onDelete={() => handleDelete(doc.id)}
                            initialFile={uploadedDocsDetails[doc.id] || null}
                            onBeforeUpload={handleBeforeUpload}
                        />
                    ))}
                </div>
            </section>

            {formType !== 'coopera' && (
                <section className="space-y-4">
                    <h3 className="text-xl font-black text-gray-400 border-b-2 border-gray-100 pb-2 uppercase italic tracking-tighter">
                        Bloco Opcional
                    </h3>
                    <div className="space-y-4">
                        {OPTIONAL_DOCS.map((doc) => (
                            <UploadZone
                                key={doc.id}
                                proposalId={proposalId}
                                docType={doc.id}
                                label={doc.label}
                                description={doc.desc}
                                onSuccess={(docInfo) => handleSuccess(doc.id, docInfo)}
                                onDelete={() => handleDelete(doc.id)}
                                initialFile={uploadedDocsDetails[doc.id] || null}
                                onBeforeUpload={handleBeforeUpload}
                            />
                        ))}
                    </div>
                </section>
            )}

            <AnimatePresence>
                {allRequiredUploaded && (
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 20 }}
                        className="pt-6 pb-10"
                    >
                        <button
                            onClick={handleFinalize}
                            disabled={isFinalizing}
                            className={`w-full py-5 rounded-2xl font-black text-xl flex items-center justify-center gap-3 transition-all shadow-lg ${isFinalizing ? 'bg-gray-400' : (formType === 'coopera' ? 'bg-[#002B49] text-white hover:bg-[#001f35]' : 'bg-[#CCFF00] text-[#002B49] hover:bg-[#b8e600]')
                                } active:scale-95`}
                        >
                            {isFinalizing ? (
                                <Loader2 className="animate-spin" size={24} />
                            ) : (
                                <>
                                    <Send size={24} />
                                    FINALIZAR ENVIO
                                </>
                            )}
                        </button>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

