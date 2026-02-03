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

    const docTypes = [
        { id: 'rg_cnh', label: 'RG ou CNH', desc: 'Frente e Verso ou arquivo digital (PDF)' },
        { id: 'comprovante_residencia', label: 'Comprovante de Residência', desc: 'Conta de luz, água ou telefone recente' },
        { id: 'foto_perfil', label: 'Foto de Perfil (Selfie)', desc: 'Uma foto atual do seu rosto para identificação' }
    ];

    const handleSuccess = (id: string) => {
        setUploadedDocs(prev => new Set(prev).add(id));
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

    const allUploaded = uploadedDocs.size >= docTypes.length;

    return (
        <div className="space-y-6">
            {docTypes.map((doc) => (
                <UploadZone
                    key={doc.id}
                    proposalId={proposalId}
                    docType={doc.id}
                    label={doc.label}
                    description={doc.desc}
                    onSuccess={() => handleSuccess(doc.id)}
                />
            ))}

            <AnimatePresence>
                {allUploaded && (
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
