'use client';

import React, { useState, useEffect } from 'react';
import UploadZone from './upload-interface';
import { finalizeUploads, getProposalDocuments } from '@/actions/document-actions';
import { CheckCircle, Send, Loader2, AlertCircle, HardDrive, MessageCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { getOrCreateProposalSignature, getProposalSignatureStatus } from '@/actions/clicksign-actions';

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

    // Plugsign signature states
    const [showSignature, setShowSignature] = useState(false);
    const [signatureLoading, setSignatureLoading] = useState(false);
    const [signatureError, setSignatureError] = useState<string | null>(null);
    const [signatureRequested, setSignatureRequested] = useState(false);
    const [isPollingSignature, setIsPollingSignature] = useState(false);
    const requiresSignature = formType === 'coopedu' || formType === 'coopera';

    const BASE_REQUIRED_DOCS = [
        { id: 'identidade_frente', label: 'Documento de Identidade com CPF *', desc: 'Frente do documento' },
        { id: 'identidade_verso', label: 'Documento de Identidade com CPF/Verso *', desc: 'Verso do documento' },
        { id: 'comprovante_pis', label: 'Comprovante do número PIS/PASEP/NIT *', desc: 'Extrato ou print do app' },
        { id: 'comprovante_residencia', label: 'Comprovante de Residência *', desc: 'Conta de luz, água ou telefone recente' },
    ];

    const REQUIRED_DOCS = formType === 'coopera'
        ? [
            ...BASE_REQUIRED_DOCS,
            { id: 'certidao_antecedentes_criminais', label: 'Certidão de Antecedentes Criminais *', desc: 'Certidão negativa ou documento equivalente' },
        ]
        : BASE_REQUIRED_DOCS;

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

    useEffect(() => {
        if (!showSignature || !signatureRequested || isFinished || !requiresSignature) return;

        let cancelled = false;
        let inFlight = false;

        const checkStoredSignatureStatus = async () => {
            if (inFlight || cancelled) return;
            inFlight = true;
            setIsPollingSignature(true);

            try {
                const statusRes = await getProposalSignatureStatus(proposalId);
                if (cancelled) return;

                if (statusRes.success && statusRes.signed) {
                    const finalizeRes = await finalizeUploads(proposalId);
                    if (cancelled) return;

                    if (finalizeRes.success) {
                        setIsFinished(true);
                        setShowSignature(false);
                    } else {
                        setSignatureError(finalizeRes.message || "Assinatura detectada, mas não foi possível finalizar o envio.");
                    }
                }
            } catch (err) {
                console.error("Error polling signature status:", err);
            } finally {
                inFlight = false;
                if (!cancelled) setIsPollingSignature(false);
            }
        };

        checkStoredSignatureStatus();
        const interval = window.setInterval(checkStoredSignatureStatus, 5000);

        return () => {
            cancelled = true;
            window.clearInterval(interval);
        };
    }, [showSignature, signatureRequested, isFinished, requiresSignature, proposalId]);

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
        setSignatureError(null);
        try {
            const res = await finalizeUploads(proposalId);
            if (res.success) {
                setIsFinished(true);
            } else {
                if (requiresSignature) {
                    setSignatureError(res.message || "Assinatura não detectada. Por favor, assine a proposta antes de finalizar.");
                } else {
                    alert(res.message || "Erro ao finalizar envio.");
                }
            }
        } catch (error) {
            console.error(error);
            setSignatureError("Erro de rede ao finalizar envio.");
        } finally {
            setIsFinalizing(false);
        }
    };

    const handleStartSignature = async () => {
        setSignatureLoading(true);
        setSignatureError(null);
        setShowSignature(true);
        try {
            const res = await getOrCreateProposalSignature(proposalId, {
                requireWhatsappVerified: true,
                autoResendWhatsapp: true
            });
            if (res.success) {
                // Request created -> our WhatsApp API sends the silent signing link.
                setSignatureRequested(true);
            } else {
                setSignatureError(res.message || "Erro ao gerar proposta de assinatura.");
            }
        } catch (err) {
            console.error("Error starting signature:", err);
            setSignatureError("Erro de conexão ao carregar módulo de assinatura.");
        } finally {
            setSignatureLoading(false);
        }
    };

    const handleCheckSignature = async () => {
        setIsFinalizing(true);
        setSignatureError(null);
        try {
            const res = await finalizeUploads(proposalId);
            if (res.success) {
                setIsFinished(true);
            } else {
                setSignatureError(res.message || "Assinatura ainda não detectada. Conclua a assinatura no link enviado pelo WhatsApp.");
            }
        } catch (error) {
            console.error(error);
            setSignatureError("Erro de rede ao verificar assinatura.");
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
                        type="button"
                        onClick={() => window.close()}
                        className="bg-[#002B49] text-white px-8 py-4 rounded-xl font-bold hover:bg-[#001f35] transition-all"
                    >
                        FECHAR PÁGINA
                    </button>
                </div>
            </motion.div>
        );
    }

    if (showSignature) {
        return (
            <div className="space-y-6">
                <div className="bg-white p-8 rounded-3xl shadow-md border border-gray-100 text-center space-y-6">
                    <h3 className="text-2xl font-black text-[#002B49] uppercase italic tracking-tighter border-b-2 border-[#CCFF00] pb-2">
                        Assinatura da Proposta
                    </h3>

                    {/* Loading: generating envelope */}
                    {signatureLoading && (
                        <div className="h-48 flex flex-col justify-center items-center space-y-4">
                            <Loader2 className="animate-spin text-[#002B49]" size={40} />
                            <p className="text-gray-500 font-bold text-sm">Gerando sua proposta de adesão...</p>
                        </div>
                    )}

                    {/* Error state */}
                    {signatureError && (
                        <div className="bg-red-50 p-6 rounded-2xl border border-red-100 text-red-800 text-sm space-y-4">
                            <p className="font-bold flex items-center justify-center gap-2 text-red-700">
                                <AlertCircle size={18} /> Atenção
                            </p>
                            <p>{signatureError}</p>
                            <div className="flex justify-center gap-4">
                                <button
                                    type="button"
                                    onClick={() => { setShowSignature(false); setSignatureError(null); }}
                                    className="bg-transparent border-2 border-[#002B49] text-[#002B49] px-6 py-2 rounded-xl font-bold text-xs hover:bg-gray-50 transition-colors"
                                >
                                    VOLTAR
                                </button>
                                <button
                                    type="button"
                                    onClick={handleCheckSignature}
                                    disabled={isFinalizing}
                                    className="bg-[#002B49] text-white px-6 py-2 rounded-xl font-bold text-xs hover:bg-[#001f35] transition-colors disabled:opacity-50 flex items-center gap-2"
                                >
                                    {isFinalizing ? <Loader2 className="animate-spin" size={14} /> : null}
                                    JÁ ASSINEI, VERIFICAR
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Success: envelope activated, waiting for WhatsApp signature */}
                    {!signatureLoading && !signatureError && signatureRequested && (
                        <div className="space-y-6">
                            {/* WhatsApp sent indicator */}
                            <div className="flex flex-col items-center gap-4 py-4">
                                <div className="bg-green-100 rounded-full p-5">
                                    <MessageCircle className="text-green-600" size={40} />
                                </div>
                                <div>
                                    <p className="text-[#002B49] font-black text-lg">Proposta enviada via WhatsApp!</p>
                                    <p className="text-gray-500 text-sm mt-1">
                                        Você receberá em instantes um link no seu WhatsApp para assinar a proposta de adesão.
                                    </p>
                                </div>
                            </div>

                            {/* Step by step instructions */}
                            <div className="bg-[#002B49] text-white p-5 rounded-2xl text-left space-y-3">
                                <p className="font-bold text-sm uppercase tracking-wide text-[#CCFF00]">Como assinar:</p>
                                <ol className="space-y-2 text-sm list-none">
                                    <li className="flex items-start gap-3">
                                        <span className="bg-[#CCFF00] text-[#002B49] font-black rounded-full w-6 h-6 flex items-center justify-center flex-shrink-0 text-xs">1</span>
                                        <span>Abra o <strong>WhatsApp</strong> e clique no link de assinatura enviado pela COOPEDU</span>
                                    </li>
                                    <li className="flex items-start gap-3">
                                        <span className="bg-[#CCFF00] text-[#002B49] font-black rounded-full w-6 h-6 flex items-center justify-center flex-shrink-0 text-xs">2</span>
                                        <span>Insira o <strong>código de verificação</strong> recebido no WhatsApp</span>
                                    </li>
                                    <li className="flex items-start gap-3">
                                        <span className="bg-[#CCFF00] text-[#002B49] font-black rounded-full w-6 h-6 flex items-center justify-center flex-shrink-0 text-xs">3</span>
                                        <span>Tire uma <strong>selfie segurando seu documento</strong> para validação de identidade</span>
                                    </li>
                                    <li className="flex items-start gap-3">
                                        <span className="bg-[#CCFF00] text-[#002B49] font-black rounded-full w-6 h-6 flex items-center justify-center flex-shrink-0 text-xs">4</span>
                                        <span>Assine a proposta e volte aqui para <strong>confirmar a conclusão</strong></span>
                                    </li>
                                </ol>
                            </div>

                            <div className="bg-lime-50 border border-lime-200 text-[#002B49] rounded-2xl p-4 text-sm flex items-center justify-center gap-2">
                                {isPollingSignature ? <Loader2 className="animate-spin" size={16} /> : <CheckCircle size={16} />}
                                <span className="font-bold">Estamos verificando automaticamente a confirmação da assinatura.</span>
                            </div>

                            {/* Action buttons */}
                            <div className="flex gap-3">
                                <button
                                    type="button"
                                    onClick={() => { setShowSignature(false); setSignatureRequested(false); }}
                                    className="w-1/3 py-4 rounded-xl border-2 border-gray-300 text-gray-500 font-bold text-sm hover:bg-gray-50 transition-colors"
                                >
                                    VOLTAR
                                </button>
                                <button
                                    type="button"
                                    onClick={handleCheckSignature}
                                    disabled={isFinalizing}
                                    className="w-2/3 py-4 rounded-xl bg-[#CCFF00] text-[#002B49] font-black text-sm flex items-center justify-center gap-2 hover:bg-[#b8e600] transition-colors active:scale-95 disabled:opacity-50 shadow-lg"
                                >
                                    {isFinalizing ? (
                                        <Loader2 className="animate-spin" size={20} />
                                    ) : (
                                        <>
                                            <CheckCircle size={20} />
                                            JÁ ASSINEI, FINALIZAR
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
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
                            type="button"
                            onClick={requiresSignature ? handleStartSignature : handleFinalize}
                            disabled={isFinalizing}
                            className={`w-full py-5 rounded-2xl font-black text-xl flex items-center justify-center gap-3 transition-all shadow-lg ${isFinalizing ? 'bg-gray-400' : (requiresSignature ? 'bg-[#CCFF00] text-[#002B49] hover:bg-[#b8e600]' : 'bg-[#002B49] text-white hover:bg-[#001f35]')
                                } active:scale-95`}
                        >
                            {isFinalizing ? (
                                <Loader2 className="animate-spin" size={24} />
                            ) : (
                                <>
                                    <Send size={24} />
                                    {requiresSignature ? 'ASSINAR PROPOSTA E FINALIZAR' : 'FINALIZAR ENVIO'}
                                </>
                            )}
                        </button>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
