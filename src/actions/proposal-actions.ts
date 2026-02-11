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

        const notificationResult = await notifyExternalService({
            nome: authorizedData.nomeCompleto,
            link: `/${uploadToken}`,
            numero: formattedPhone
        });

        // Log notification in Firestore
        await docRef.collection("notifications").add({
            type: "initial",
            status: notificationResult.success ? "success" : "error",
            timestamp: new Date().toISOString(),
            error: notificationResult.message || null,
            payload: { nome: authorizedData.nomeCompleto, link: `/${uploadToken}`, numero: formattedPhone }
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
            return { success: false, message: `Erro API (${response.status}): ${errorText}` };
        } else {
            const result = await response.json();
            console.log("External API Success:", result);
            return { success: true };
        }
    } catch (error) {
        console.error("Failed to call external API:", error);
        return { success: false, message: error instanceof Error ? error.message : "Erro de conexão" };
    }
}

export async function resendInitialNotification(proposalId: string) {
    try {
        const db = getAdminDb();
        const docRef = db.collection("proposals").doc(proposalId);
        const doc = await docRef.get();

        if (!doc.exists) return { success: false, message: "Proposta não encontrada" };
        const data = doc.data()!;

        const phoneDigits = (data.telefone || "").replace(/\D/g, '');
        const formattedPhone = phoneDigits.startsWith('55') && phoneDigits.length > 11 ? phoneDigits : `55${phoneDigits}`;

        const payload = {
            nome: data.nomeCompleto,
            link: `/${data.uploadToken}`,
            numero: formattedPhone
        };

        const result = await notifyExternalService(payload);

        await docRef.collection("notifications").add({
            type: "initial",
            status: result.success ? "success" : "error",
            timestamp: new Date().toISOString(),
            error: result.message || null,
            payload
        });

        return result;
    } catch (e) {
        console.error("Error resending initial notification:", e);
        return { success: false, message: "Erro interno ao reenviar" };
    }
}

export async function getProposalsByCampaign(campaignId: string, limitCount: number = 50, lastId?: string, sortBy: 'createdAt' | 'nomeCompleto' = 'createdAt') {
    try {
        const db = getAdminDb();
        let query: any = db.collection('proposals');

        if (campaignId === 'uncategorized') {
            query = query.where('campaignId', 'in', ['uncategorized', null]);
        } else {
            query = query.where('campaignId', '==', campaignId);
        }

        const orderDir = sortBy === 'createdAt' ? 'desc' : 'asc';
        query = query.orderBy(sortBy, orderDir);

        // Add secondary sort for stability (document IDs)
        query = query.orderBy('__name__', orderDir);

        query = query.limit(limitCount);

        if (lastId) {
            const lastDoc = await db.collection('proposals').doc(lastId).get();
            if (lastDoc.exists) {
                query = query.startAfter(lastDoc);
            }
        }

        const snapshot = await query.get();
        return snapshot.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }));
    } catch (e) {
        console.error("Error fetching proposals by campaign:", e);
        return [];
    }
}

export async function getAllProposalsByCampaign(campaignId: string) {
    try {
        const db = getAdminDb();
        let query: any = db.collection('proposals');

        if (campaignId === 'uncategorized') {
            query = query.where('campaignId', 'in', ['uncategorized', null]);
        } else {
            query = query.where('campaignId', '==', campaignId);
        }

        // Always sort by date for the export
        query = query.orderBy('createdAt', 'desc');

        const snapshot = await query.get();
        return snapshot.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }));
    } catch (e) {
        console.error("Error fetching all proposals for export:", e);
        return [];
    }
}
export async function deleteProposal(proposalId: string) {
    try {
        const db = getAdminDb();
        await db.collection("proposals").doc(proposalId).delete();
        return { success: true };
    } catch (error) {
        console.error("Error deleting proposal:", error);
        return { success: false, message: "Erro ao excluir proposta." };
    }
}

export async function cleanupDuplicateProposals(campaignId: string) {
    try {
        const db = getAdminDb();
        let query: any = db.collection('proposals');

        if (campaignId === 'uncategorized') {
            query = query.where('campaignId', 'in', ['uncategorized', null]);
        } else {
            query = query.where('campaignId', '==', campaignId);
        }

        // Fetch all proposals for this campaign (might be slow if many, but simpler for cleanup logic)
        const snapshot = await query.get();
        const proposals = snapshot.docs.map((doc: any) => ({ id: doc.id, ...(doc.data() as any) }));

        // Group by CPF
        const groupedByCPF: Record<string, any[]> = {};
        proposals.forEach((p: any) => {
            if (!groupedByCPF[p.cpf]) groupedByCPF[p.cpf] = [];
            groupedByCPF[p.cpf].push(p);
        });

        let deletedCount = 0;
        const batch = db.batch();

        for (const cpf in groupedByCPF) {
            const list = groupedByCPF[cpf];
            if (list.length > 1) {
                // Sort by createdAt desc
                list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

                // Keep the first (newest), delete others
                for (let i = 1; i < list.length; i++) {
                    batch.delete(db.collection('proposals').doc(list[i].id));
                    deletedCount++;
                }
            }
        }

        if (deletedCount > 0) {
            await batch.commit();
        }

        return { success: true, deletedCount };
    } catch (error) {
        console.error("Error cleaning duplicates:", error);
        return { success: false, message: "Erro ao limpar duplicados." };
    }
}

export async function getProposals(limitCount: number = 50, lastId?: string) {
    try {
        const db = getAdminDb();
        let query = db.collection('proposals').orderBy('createdAt', 'desc').limit(limitCount);

        if (lastId) {
            const lastDoc = await db.collection('proposals').doc(lastId).get();
            if (lastDoc.exists) {
                query = query.startAfter(lastDoc);
            }
        }

        const snapshot = await query.get();
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (e) {
        console.error("Error fetching proposals:", e);
        return [];
    }
}

export async function searchProposals(searchTerm: string) {
    try {
        const db = getAdminDb();
        const term = searchTerm.trim().toUpperCase();

        // Exact CPF match check first (if it looks like a CPF)
        const cpfDigits = term.replace(/\D/g, '');

        let query;
        if (cpfDigits.length >= 8) {
            // Search by CPF prefix if it's long enough
            query = db.collection('proposals')
                .where('cpf', '>=', cpfDigits)
                .where('cpf', '<=', cpfDigits + '\uf8ff')
                .limit(50);
        } else {
            // Search by Name prefix
            query = db.collection('proposals')
                .where('nomeCompleto', '>=', term)
                .where('nomeCompleto', '<=', term + '\uf8ff')
                .limit(50);
        }

        const snapshot = await query.get();
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (e) {
        console.error("Error searching proposals:", e);
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

        const notificationsSnapshot = await docRef.collection("notifications").orderBy("timestamp", "desc").get();
        const notifications = notificationsSnapshot.docs.map(d => ({ id: d.id, ...d.data() }));

        return {
            id: doc.id,
            ...doc.data(),
            documents,
            notifications
        };
    } catch (error) {
        console.error("Error fetching proposal by ID:", error);
        return null;
    }
}
