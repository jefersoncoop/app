'use client';

import React, { useState } from 'react';
import { storage } from "@/lib/firebase";
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from "firebase/storage";
import { saveDocumentMetadata, deleteDocumentMetadata } from "@/actions/document-actions";
import { UploadCloud, CheckCircle, FileText, AlertCircle, Loader2, Trash2 } from 'lucide-react';
import { motion } from 'framer-motion';

interface UploadZoneProps {
    proposalId: string;
    docType: string;
    label: string;
    description?: string;
    onSuccess?: () => void;
    onDelete?: () => void;
}

export default function UploadZone({ proposalId, docType, label, description, onSuccess, onDelete }: UploadZoneProps) {
    const [status, setStatus] = useState<'idle' | 'uploading' | 'success' | 'error' | 'deleting'>('idle');
    const [progress, setProgress] = useState(0);
    const [fileName, setFileName] = useState('');
    const [lastUploadPath, setLastUploadPath] = useState<string | null>(null);

    const compressImage = (file: File): Promise<Blob | File> => {
        return new Promise((resolve) => {
            if (!file.type.startsWith('image/') || file.type === 'image/gif') {
                resolve(file);
                return;
            }

            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = (event) => {
                const img = new Image();
                img.src = event.target?.result as string;
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    let width = img.width;
                    let height = img.height;
                    const MAX_SIZE = 1280;

                    if (width > height) {
                        if (width > MAX_SIZE) {
                            height *= MAX_SIZE / width;
                            width = MAX_SIZE;
                        }
                    } else {
                        if (height > MAX_SIZE) {
                            width *= MAX_SIZE / height;
                            height = MAX_SIZE;
                        }
                    }

                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    ctx?.drawImage(img, 0, 0, width, height);

                    canvas.toBlob(
                        (blob) => {
                            if (blob) {
                                // If compression didn't actually help, use original
                                resolve(blob.size < file.size ? blob : file);
                            } else {
                                resolve(file);
                            }
                        },
                        'image/jpeg',
                        0.7
                    );
                };
                img.onerror = () => resolve(file);
            };
            reader.onerror = () => resolve(file);
        });
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const originalFile = e.target.files?.[0];
        if (!originalFile) return;

        setStatus('uploading');
        setFileName(originalFile.name);
        setProgress(0);

        try {
            // 0. Compress if image
            const file = await compressImage(originalFile);
            console.log(`Original: ${originalFile.size} bytes, Compressed: ${file.size} bytes`);

            // 1. Upload to Firebase Storage
            const path = `uploads/${proposalId}/${docType}_${Date.now()}_${originalFile.name}`;
            const storageRef = ref(storage, path);
            const uploadTask = uploadBytesResumable(storageRef, file);
            setLastUploadPath(path);

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
                    const res = await saveDocumentMetadata(proposalId, url, originalFile.name, docType);
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

    const handleDelete = async () => {
        if (!confirm("Deseja realmente excluir este documento?")) return;

        setStatus('deleting');
        try {
            // 1. Delete from Firestore first
            const res = await deleteDocumentMetadata(proposalId, docType);
            if (!res.success) throw new Error("Erro ao deletar metadados");

            // 2. Delete from Storage if we have the path
            if (lastUploadPath) {
                const storageRef = ref(storage, lastUploadPath);
                await deleteObject(storageRef);
            }

            // 3. Reset state
            setStatus('idle');
            setFileName('');
            setLastUploadPath(null);
            if (onDelete) onDelete();
        } catch (err) {
            console.error("Delete error:", err);
            alert("Erro ao excluir o arquivo.");
            setStatus('success'); // Revert to success if delete fails
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
                {status === 'success' && (
                    <button
                        onClick={handleDelete}
                        className="p-2 text-gray-400 hover:text-red-500 transition-colors"
                        title="Excluir arquivo"
                    >
                        <Trash2 size={18} />
                    </button>
                )}
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

            {status === 'deleting' && (
                <div className="h-32 flex flex-col justify-center items-center space-y-3 bg-gray-50 rounded-xl border border-gray-100">
                    <Loader2 className="animate-spin text-red-500" size={32} />
                    <p className="text-xs font-bold text-red-500">Excluindo...</p>
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
