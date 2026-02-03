'use server';

import { getAdminDb } from "@/lib/firebase-admin";
import { campaignSchema } from "@/lib/schemas/campaign-schema";
import { revalidatePath } from "next/cache";

export async function createCampaign(data: any) {
    console.log("createCampaign: Input Data:", JSON.stringify(data, null, 2));

    try {
        const db = getAdminDb();
        console.log("createCampaign: DB Initialized");

        // Ensure professions is an array if it came in as string (depending on form handling)
        if (typeof data.professions === 'string') {
            // It's handled by zod transform, but if we pass raw data...
            console.log("createCampaign: Professions is string, Zod should transform it.");
        }

        const parsed = campaignSchema.safeParse(data);
        if (!parsed.success) {
            console.error("createCampaign: Zod Error:", JSON.stringify(parsed.error.format(), null, 2));
            return { success: false, errors: parsed.error.format(), message: "Erro de validação: Verifique os campos." };
        }

        const campaignData = parsed.data;
        console.log("createCampaign: Parsed Data:", campaignData);

        // Check if slug exists
        console.log("createCampaign: Checking Slug:", campaignData.slug);
        const slugCheck = await db.collection('campaigns').where('slug', '==', campaignData.slug).get();
        if (!slugCheck.empty) {
            console.warn("createCampaign: Slug collision");
            return { success: false, message: "Este slug já está em uso." };
        }

        console.log("createCampaign: Writing to Firestore...");
        const docRef = await db.collection('campaigns').add({
            ...campaignData,
            createdAt: new Date().toISOString(),
        });

        console.log("createCampaign: Success. ID:", docRef.id);
        revalidatePath('/admin/campaigns');
        return { success: true, id: docRef.id };

    } catch (e: any) {
        console.error("createCampaign: CRITICAL ERROR:", e);
        // Log environment status to help debug
        console.error("Env Vars Present:", {
            PROJECT_ID: !!process.env.FIREBASE_PROJECT_ID,
            CLIENT_EMAIL: !!process.env.FIREBASE_CLIENT_EMAIL
        });

        return { success: false, message: "Erro interno ao criar campanha: " + (e.message || String(e)) };
    }
}

export async function updateCampaign(id: string, data: any) {
    console.log("updateCampaign: Input Data:", id, data);
    try {
        const db = getAdminDb();
        const parsed = campaignSchema.safeParse(data);

        if (!parsed.success) {
            console.error("updateCampaign: Zod Error", parsed.error.format());
            return { success: false, errors: parsed.error.format(), message: "Erro de validação." };
        }

        await db.collection('campaigns').doc(id).update({
            ...parsed.data,
            updatedAt: new Date().toISOString(),
        });

        revalidatePath('/admin/campaigns');
        return { success: true };
    } catch (e: any) {
        console.error("updateCampaign: Error", e);
        return { success: false, message: "Erro ao atualizar: " + e.message };
    }
}

export async function getCampaigns() {
    try {
        const db = getAdminDb();
        const snapshot = await db.collection('campaigns').orderBy('createdAt', 'desc').get();
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (e) {
        console.error("getCampaigns Error:", e);
        return [];
    }
}

export async function getCampaignBySlug(slug: string) {
    try {
        const db = getAdminDb();
        const snapshot = await db.collection('campaigns').where('slug', '==', slug).where('active', '==', true).limit(1).get();
        if (snapshot.empty) return null;
        return { id: snapshot.docs[0].id, ...snapshot.docs[0].data() } as any;
    } catch (e) {
        console.error("getCampaignBySlug Error:", e);
        return null;
    }
}

export async function getCampaignById(id: string) {
    try {
        const db = getAdminDb();
        const doc = await db.collection('campaigns').doc(id).get();
        if (!doc.exists) return null;
        return { id: doc.id, ...doc.data() } as any;
    } catch (e) {
        console.error("getCampaignById Error:", e);
        return null;
    }
}
