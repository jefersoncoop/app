'use server';

import { getAdminDb } from "@/lib/firebase-admin";

export async function saveDocumentMetadata(proposalId: string, url: string, filename: string, type: string) {
    try {
        const db = getAdminDb();
        // Add to 'documents' subcollection inside the proposal
        await db.collection("proposals").doc(proposalId).collection("documents").add({
            url,
            filename,
            type,
            uploadedAt: new Date().toISOString(),
        });

        // Optionally update the main status to "documents_submitted" if all required are there?
        // keeping it simple for now.
        return { success: true };
    } catch (e) {
        console.error("Error saving doc metadata", e);
        return { success: false, message: "Failed to save metadata" };
    }
}

export async function finalizeUploads(proposalId: string) {
    try {
        const db = getAdminDb();
        const docRef = db.collection("proposals").doc(proposalId);

        // 1. Fetch proposal data to get nome and telefone
        const doc = await docRef.get();
        if (!doc.exists) {
            return { success: false, message: "Proposta não encontrada." };
        }

        const proposalData = doc.data();
        const nomeCompleto = proposalData?.nomeCompleto || "Nome não informado";
        const telefone = proposalData?.telefone || "";

        // 2. Format phone number
        const phoneDigits = telefone.replace(/\D/g, '');
        const formattedPhone = phoneDigits.startsWith('55') && phoneDigits.length > 11
            ? phoneDigits
            : `55${phoneDigits}`;

        // 3. Update status in Firestore
        await docRef.update({
            status: "documents_received",
            documentsSubmittedAt: new Date().toISOString(),
        });

        // 4. Trigger External Notification API
        console.log(`Finalizing uploads for ${nomeCompleto}. Sending notification...`);

        try {
            const response = await fetch("https://webatende.coopedu.com.br:3000/api/external/fimroadmap", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    nome: nomeCompleto,
                    numero: formattedPhone
                }),
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error(`External Notification API Error (${response.status}):`, errorText);
            } else {
                console.log("External Notification API Success");
            }
        } catch (apiError) {
            console.error("Failed to call external notification API:", apiError);
        }

        return { success: true };
    } catch (e) {
        console.error("Error finalizing uploads", e);
        return { success: false, message: "Failed to update status" };
    }
}
