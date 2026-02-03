'use server';

import { getAdminDb } from "@/lib/firebase-admin";
import { proposalSchema, ProposalFormData } from "@/lib/schemas/proposal-schema";
import { randomUUID } from 'crypto';

export type SubmitResult = {
    success: boolean;
    message?: string;
    id?: string;
    errors?: any;
};

export async function submitProposal(data: ProposalFormData): Promise<SubmitResult> {
    try {
        // 1. Validate data on the server
        const parsed = proposalSchema.safeParse(data);
        if (!parsed.success) {
            console.error("Validation error:", parsed.error.format());
            return { success: false, message: "Dados inválidos.", errors: parsed.error.format() };
        }

        const authorizedData = parsed.data;

        // 2. Generate System Metadata
        const uploadToken = randomUUID();
        // Expires in 7 days (generous window for association)
        const uploadTokenExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

        // 3. Save to Firestore
        const db = getAdminDb();
        const docRef = await db.collection("proposals").add({
            ...authorizedData,
            uploadToken,
            uploadTokenExpires,
            createdAt: new Date().toISOString(),
            status: "pending_documents",
        });

        console.log(`Proposal created. ID: ${docRef.id}`);
        console.log(`[SIMULATION] Sending WhatsApp. Upload Link: /upload/${uploadToken}`);

        // Trigger External Notification API
        const phoneDigits = authorizedData.telefone.replace(/\D/g, '');
        // Assume BR country code '55' if not present (simple heuristic)
        const formattedPhone = phoneDigits.startsWith('55') && phoneDigits.length > 11
            ? phoneDigits
            : `55${phoneDigits}`;

        await notifyExternalService({
            nome: authorizedData.nomeCompleto,
            link: `/${uploadToken}`,
            numero: formattedPhone
        });

        return { success: true, id: docRef.id };
    } catch (error) {
        console.error("Error submitting proposal:", error);
        return { success: false, message: "Erro ao salvar a proposta. Tente novamente mais tarde." };
    }
}

async function notifyExternalService(payload: { nome: string, link: string, numero: string }) {
    try {
        console.log("Notifying external service:", payload);
        const response = await fetch("https://webatende.coopedu.com.br:3000/api/external/status_proposta", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`External API Error (${response.status}):`, errorText);
        } else {
            const result = await response.json();
            console.log("External API Success:", result);
        }
    } catch (error) {
        console.error("Failed to call external API:", error);
    }
}

export async function getProposals() {
    try {
        const db = getAdminDb();
        const snapshot = await db.collection('proposals').orderBy('createdAt', 'desc').limit(50).get();
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (e) {
        console.error("Error fetching proposals:", e);
        return [];
    }
}

export async function getProposalById(id: string) {
    try {
        const db = getAdminDb();
        const docRef = db.collection("proposals").doc(id);
        const doc = await docRef.get();

        if (!doc.exists) return null;

        const docsSnapshot = await docRef.collection("documents").orderBy("uploadedAt", "desc").get();
        const documents = docsSnapshot.docs.map(d => ({ id: d.id, ...d.data() }));

        return {
            id: doc.id,
            ...doc.data(),
            documents
        };
    } catch (error) {
        console.error("Error fetching proposal by ID:", error);
        return null;
    }
}
