'use client';

import React, { useState } from 'react';
import UploadZone from './upload-interface';
import { finalizeUploads } from '@/actions/document-actions';
import { CheckCircle, Send, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface UploadManagerProps {
    proposalId: string;
    userName: string;
}

export default function UploadManager({ proposalId, userName }: UploadManagerProps) {
    const [uploadedDocs, setUploadedDocs] = useState<Set<string>>(new Set());
    const [isFinalizing, setIsFinalizing] = useState(false);
    const [isFinished, setIsFinished] = useState(false);

    const REQUIRED_DOCS = [
        { id: 'identidade_frente', label: 'Documento de Identidade com CPF', desc: 'Frente do documento' },
        { id: 'identidade_verso', label: 'Documento de Identidade com CPF/Verso', desc: 'Verso do documento' },
        { id: 'comprovante_pis', label: 'Comprovante do número PIS/PASEP/NIT', desc: 'Extrato ou print do app' },
        { id: 'comprovante_residencia', label: 'Comprovante de Residência', desc: 'Conta de luz, água ou telefone recente' },
    ];

    const OPTIONAL_DOCS = [
        { id: 'cnh', label: 'CNH', desc: 'Carteira Nacional de Habilitação' },
        { id: 'certidao', label: 'Certidão de Nascimento ou Casamento', desc: 'Certidão legível' },
        { id: 'curriculo', label: 'Currículo', desc: 'Seu currículo atualizado' },
        { id: 'diploma', label: 'Diploma', desc: 'Comprovante de escolaridade' },
    ];

    const handleSuccess = (id: string) => {
        setUploadedDocs(prev => new Set(prev).add(id));
    };

    const handleDelete = (id: string) => {
        setUploadedDocs(prev => {
            const next = new Set(prev);
            next.delete(id);
            return next;
        });
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

    if (isFinished) {
        return (
            <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-white p-12 rounded-3xl shadow-xl text-center space-y-6 border border-lime-100"
            >
                <div className="bg-lime-100 w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-6">
                    <CheckCircle className="text-lime-600" size={48} />
                </div>
                <h2 className="text-3xl font-black text-[#002B49]">Envio Concluído!</h2>
                <p className="text-gray-600 text-lg">
                    Obrigado, <span className="font-bold">{userName}</span>. <br />
                    Recebemos seus documentos com sucesso. Nossa equipe irá analisar e entraremos em contato em breve.
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

    return (
        <div className="space-y-10">
            <section className="space-y-4">
                <h3 className="text-xl font-black text-[#002B49] border-b-2 border-[#CCFF00] pb-2 uppercase italic tracking-tighter">
                    Bloco Obrigatórios
                </h3>
                <div className="space-y-4">
                    {REQUIRED_DOCS.map((doc) => (
                        <UploadZone
                            key={doc.id}
                            proposalId={proposalId}
                            docType={doc.id}
                            label={doc.label}
                            description={doc.desc}
                            onSuccess={() => handleSuccess(doc.id)}
                            onDelete={() => handleDelete(doc.id)}
                        />
                    ))}
                </div>
            </section>

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
                            onSuccess={() => handleSuccess(doc.id)}
                            onDelete={() => handleDelete(doc.id)}
                        />
                    ))}
                </div>
            </section>

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
                            className={`w-full py-5 rounded-2xl font-black text-xl flex items-center justify-center gap-3 transition-all shadow-lg ${isFinalizing ? 'bg-gray-400' : 'bg-[#CCFF00] text-[#002B49] hover:bg-[#b8e600] active:scale-95'
                                }`}
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
