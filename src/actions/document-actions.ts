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
        await db.collection("proposals").doc(proposalId).update({
            status: "documents_received",
            documentsSubmittedAt: new Date().toISOString(),
        });
        return { success: true };
    } catch (e) {
        console.error("Error finalizing uploads", e);
        return { success: false, message: "Failed to update status" };
    }
}
