'use client';

import React, { useState } from 'react';
import { storage } from "@/lib/firebase";
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { saveDocumentMetadata } from "@/actions/document-actions";
import { UploadCloud, CheckCircle, FileText, AlertCircle, Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';

interface UploadZoneProps {
    proposalId: string;
    docType: string;
    label: string;
    description?: string;
    onSuccess?: () => void;
}

export default function UploadZone({ proposalId, docType, label, description, onSuccess }: UploadZoneProps) {
    const [status, setStatus] = useState<'idle' | 'uploading' | 'success' | 'error'>('idle');
    const [progress, setProgress] = useState(0);
    const [fileName, setFileName] = useState('');

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setStatus('uploading');
        setFileName(file.name);
        setProgress(0);

        try {
            // 1. Upload to Firebase Storage
            const storageRef = ref(storage, `uploads/${proposalId}/${docType}_${Date.now()}_${file.name}`);
            const uploadTask = uploadBytesResumable(storageRef, file);

            uploadTask.on('state_changed',
                (snapshot) => {
                    const p = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                    setProgress(p);
                },
                (error) => {
                    console.error("Upload error:", error);
                    setStatus('error');
                },
                async () => {
                    // 2. Get URL
                    const url = await getDownloadURL(uploadTask.snapshot.ref);

                    // 3. Save Metadata
                    const res = await saveDocumentMetadata(proposalId, url, file.name, docType);
                    if (res.success) {
                        setStatus('success');
                        if (onSuccess) onSuccess();
                    } else {
                        setStatus('error');
                    }
                }
            );

        } catch (err) {
            console.error(err);
            setStatus('error');
        }
    };

    return (
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 transition-all hover:shadow-md">
            <div className="flex justify-between items-start mb-4">
                <div>
                    <h3 className="font-bold text-[#002B49] text-lg flex items-center gap-2">
                        {status === 'success' ? <CheckCircle className="text-green-500" size={20} /> : <FileText size={20} className="text-gray-400" />}
                        {label}
                    </h3>
                    {description && <p className="text-gray-500 text-sm mt-1">{description}</p>}
                </div>
            </div>

            {status === 'idle' && (
                <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-gray-300 rounded-xl cursor-pointer bg-gray-50 hover:bg-gray-100 transition-colors">
                    <div className="flex flex-col items-center justify-center pt-5 pb-6">
                        <UploadCloud className="w-8 h-8 text-gray-400 mb-2" />
                        <p className="text-sm text-gray-500 font-semibold">Clique para enviar</p>
                    </div>
                    <input type="file" className="hidden" onChange={handleFileChange} accept="application/pdf,image/*" />
                </label>
            )}

            {status === 'uploading' && (
                <div className="h-32 flex flex-col justify-center items-center space-y-3 bg-gray-50 rounded-xl border border-gray-100">
                    <Loader2 className="animate-spin text-[#002B49]" size={32} />
                    <div className="w-2/3 h-2 bg-gray-200 rounded-full overflow-hidden">
                        <motion.div
                            className="h-full bg-[#CCFF00]"
                            initial={{ width: 0 }}
                            animate={{ width: `${progress}%` }}
                        />
                    </div>
                    <p className="text-xs font-mono text-gray-500">{Math.round(progress)}%</p>
                </div>
            )}

            {status === 'success' && (
                <div className="h-32 flex flex-col justify-center items-center bg-green-50 rounded-xl border border-green-100 animate-in fade-in">
                    <CheckCircle className="text-green-500 w-10 h-10 mb-2" />
                    <p className="text-green-800 font-bold text-sm">Arquivo recebido</p>
                    <p className="text-green-700 text-xs truncate max-w-[200px]">{fileName}</p>
                </div>
            )}

            {status === 'error' && (
                <div className="h-32 flex flex-col justify-center items-center bg-red-50 rounded-xl border border-red-100">
                    <AlertCircle className="text-red-500 w-8 h-8 mb-2" />
                    <p className="text-red-800 font-bold text-sm">Erro no envio</p>
                    <button onClick={() => setStatus('idle')} className="text-xs text-red-600 underline mt-2">Tentar novamente</button>
                </div>
            )}
        </div>
    );
}
