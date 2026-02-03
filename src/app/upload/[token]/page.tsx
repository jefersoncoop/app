import React from 'react';
import { notFound } from 'next/navigation';
import { getAdminDb } from '@/lib/firebase-admin';
import UploadManager from '@/components/upload-manager';
import { PackageOpen } from 'lucide-react';

interface Params {
    params: Promise<{ token: string }>;
}

async function getProposalByToken(token: string) {
    const db = getAdminDb();
    const snapshot = await db.collection("proposals")
        .where("uploadToken", "==", token)
        .limit(1)
        .get();

    if (snapshot.empty) return null;

    const doc = snapshot.docs[0];
    const data = doc.data() as any;

    const proposal = { id: doc.id, ...data } as { id: string, nomeCompleto: string, expired?: boolean, uploadTokenExpires?: string };

    // Check expiration
    if (proposal.uploadTokenExpires) {
        const expires = new Date(proposal.uploadTokenExpires);
        if (expires < new Date()) {
            proposal.expired = true;
        }
    }

    return proposal;
}

export default async function UploadPage(props: Params) {
    const params = await props.params;
    const proposal = await getProposalByToken(params.token);

    if (!proposal) {
        return notFound();
    }

    if (proposal.expired) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
                <div className="text-center space-y-4 max-w-md">
                    <div className="bg-red-100 p-6 rounded-full inline-block">
                        <PackageOpen size={48} className="text-red-500" />
                    </div>
                    <h1 className="text-2xl font-bold text-gray-800">Link Expirado</h1>
                    <p className="text-gray-600">Este link de envio de documentos não é mais válido. Entre em contato com a equipe de atendimento.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#F0F4F8] font-sans pb-20">
            {/* Header */}
            <div className="bg-[#002B49] text-white p-6 pb-24 shadow-lg">
                <div className="max-w-2xl mx-auto">
                    <p className="text-[#CCFF00] font-bold text-sm tracking-wider mb-2">COOPERAÇÃO DIGITAL</p>
                    <h1 className="text-3xl font-bold">Envio de Documentos</h1>
                    <p className="text-gray-300 mt-2">Olá, <span className="text-white font-bold">{proposal.nomeCompleto}</span>. Precisamos dos documentos abaixo para finalizar seu cadastro.</p>
                </div>
            </div>

            {/* Content */}
            <div className="max-w-2xl mx-auto px-6 -mt-16 space-y-6">
                <UploadManager proposalId={proposal.id} userName={proposal.nomeCompleto} />

                <div className="p-6 text-center text-gray-500 text-sm">
                    <p>Seus dados estão seguros conosco.</p>
                    <p className="text-xs mt-1">Ao enviar, você confirma a veracidade dos documentos.</p>
                </div>

            </div>
        </div>
    );
}
