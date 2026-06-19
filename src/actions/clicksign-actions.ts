'use server';

import { getAdminDb } from "@/lib/firebase-admin";

const DEFAULT_TEMPLATE_ID = "2b2ed8dc-9709-43ac-a323-85ab4b1f9f0b";

interface ClickSignResponse {
    success: boolean;
    message?: string;
    envelopeId?: string;
    documentId?: string;
    signerId?: string;
    signingUrl?: string;
    status?: string;
    errors?: any;
}

type ProposalSignatureStatus = {
    success: boolean;
    message?: string;
    clicksignStatus?: string | null;
    signed?: boolean;
};

/**
 * Helper to execute calls to Clicksign API v3
 */
async function clicksignFetch(endpoint: string, options: RequestInit = {}) {
    const apiKey = process.env.CLICKSIGN_API_KEY;
    const apiUrl = process.env.CLICKSIGN_API_URL || "https://sandbox.clicksign.com";

    if (!apiKey) {
        throw new Error("CLICKSIGN_API_KEY não configurado no servidor.");
    }

    const url = `${apiUrl}${endpoint}`;
    const headers = {
        "Content-Type": "application/vnd.api+json",
        "Accept": "application/vnd.api+json",
        "Authorization": apiKey,
        ...options.headers
    };

    console.log(`[Clicksign Request] ${options.method || 'GET'} ${url}`);

    const response = await fetch(url, {
        ...options,
        headers
    });

    const responseText = await response.text();
    console.log(`[Clicksign Response] Status ${response.status}:`, responseText);

    let responseData = null;
    if (responseText) {
        try {
            responseData = JSON.parse(responseText);
        } catch (e) {
            console.error("Erro ao analisar resposta JSON do ClickSign:", e);
        }
    }

    if (!response.ok) {
        const errorMsg = responseData?.errors?.[0]?.detail || responseData?.errors?.[0]?.title || `Erro ${response.status}`;
        throw new Error(errorMsg);
    }

    return responseData;
}

/**
 * Gets or creates a ClickSign folder for a campaign.
 * Saves the folder ID to Firestore so the same folder is reused across proposals.
 */
async function getOrCreateCampaignFolder(campaignId: string, campaignName: string): Promise<string | null> {
    try {
        const db = getAdminDb();
        const campaignRef = db.collection("campaigns").doc(campaignId);
        const campaignSnap = await campaignRef.get();

        // Return cached folder ID if already created
        if (campaignSnap.exists) {
            const existingFolderId = campaignSnap.data()?.clicksignFolderId;
            if (existingFolderId) {
                console.log(`[Clicksign] Reusing folder ${existingFolderId} for campaign ${campaignId}`);
                return existingFolderId;
            }
        }

        // Create a new folder named after the campaign
        const folderRes = await clicksignFetch("/api/v3/folders", {
            method: "POST",
            body: JSON.stringify({
                data: {
                    type: "folders",
                    attributes: { name: campaignName }
                }
            })
        });

        const folderId = folderRes?.data?.id;
        if (!folderId) {
            console.warn(`[Clicksign] Could not create folder for campaign ${campaignId}`);
            return null;
        }

        console.log(`[Clicksign] Created folder ${folderId} for campaign "${campaignName}"`);

        // Persist the folder ID on the campaign document
        await campaignRef.update({ clicksignFolderId: folderId });
        return folderId;
    } catch (err) {
        console.warn(`[Clicksign] getOrCreateCampaignFolder failed for ${campaignId}:`, err);
        return null; // Non-fatal — envelope will be created without a folder
    }
}

/**
 * Creates envelope, document, signer, requirement and activates envelope.
 * Saves keys to proposal document in Firestore.
 */
export async function getOrCreateProposalSignature(proposalId: string, options?: { requireWhatsappVerified?: boolean; autoResendWhatsapp?: boolean }): Promise<ClickSignResponse> {
    try {
        const db = getAdminDb();
        const docRef = db.collection("proposals").doc(proposalId);
        const docSnapshot = await docRef.get();

        if (!docSnapshot.exists) {
            return { success: false, message: "Proposta não encontrada." };
        }

        const proposal = docSnapshot.data() as any;

        if (options?.requireWhatsappVerified && !proposal.whatsappVerified) {
            return {
                success: false,
                message: "Valide seu WhatsApp antes de solicitar a assinatura da proposta."
            };
        }

        // If ClickSign signature is already initialized, validate and return existing signer key
        if (proposal.clicksignEnvelopeId && proposal.clicksignSignerId) {
            // Verify the signer still exists in ClickSign before returning cached IDs
            try {
                const apiKey = process.env.CLICKSIGN_API_KEY;
                const apiUrl = process.env.CLICKSIGN_API_URL || "https://sandbox.clicksign.com";
                const checkRes = await fetch(
                    `${apiUrl}/api/v3/envelopes/${proposal.clicksignEnvelopeId}/signers/${proposal.clicksignSignerId}`,
                    {
                        method: "GET",
                        headers: {
                            "Authorization": apiKey!,
                            "Accept": "application/vnd.api+json"
                        }
                    }
                );
                if (checkRes.ok) {
                    console.log(`[Clicksign] Returning cached signer ${proposal.clicksignSignerId} for proposal ${proposalId}`);

                    if (options?.autoResendWhatsapp && proposal.clicksignStatus !== "signed") {
                        try {
                            await sendClicksignWhatsappNotification(proposal.clicksignEnvelopeId, proposal.clicksignSignerId);
                            await docRef.collection("notifications").add({
                                type: "clicksign_whatsapp_auto_resend",
                                status: "success",
                                timestamp: new Date().toISOString(),
                                error: null,
                                payload: {
                                    envelopeId: proposal.clicksignEnvelopeId,
                                    signerId: proposal.clicksignSignerId,
                                    source: "cached_signature"
                                }
                            });
                        } catch (notifyError) {
                            console.warn(`[Clicksign] Auto resend failed for cached signer ${proposal.clicksignSignerId}:`, notifyError);
                            await docRef.collection("notifications").add({
                                type: "clicksign_whatsapp_auto_resend",
                                status: "error",
                                timestamp: new Date().toISOString(),
                                error: notifyError instanceof Error ? notifyError.message : "Erro ao reenviar WhatsApp",
                                payload: {
                                    envelopeId: proposal.clicksignEnvelopeId,
                                    signerId: proposal.clicksignSignerId,
                                    source: "cached_signature"
                                }
                            });
                        }
                    }

                    return {
                        success: true,
                        envelopeId: proposal.clicksignEnvelopeId,
                        signerId: proposal.clicksignSignerId,
                        status: proposal.clicksignStatus || "pending"
                    };
                } else {
                    // Cached IDs are invalid (404 or other error) - clear them and recreate
                    console.warn(`[Clicksign] Cached signer invalid (${checkRes.status}), recreating envelope for proposal ${proposalId}`);
                    await docRef.update({
                        clicksignEnvelopeId: null,
                        clicksignDocumentId: null,
                        clicksignSignerId: null,
                        clicksignStatus: null
                    });
                }
            } catch (validationError) {
                console.warn(`[Clicksign] Could not validate cached signer, recreating:`, validationError);
                await docRef.update({
                    clicksignEnvelopeId: null,
                    clicksignDocumentId: null,
                    clicksignSignerId: null,
                    clicksignStatus: null
                });
            }
        }

        console.log(`[Clicksign] Starting signature creation for proposal ${proposalId}`);

        // Resolve campaign folder (creates it if needed, non-fatal if it fails)
        let folderId: string | null = null;
        if (proposal.campaignId) {
            const db2 = getAdminDb();
            const campaignSnap = await db2.collection("campaigns").doc(proposal.campaignId).get();
            const campaignName = campaignSnap.exists
                ? (campaignSnap.data()?.name || campaignSnap.data()?.titulo || `Campanha ${proposal.campaignId}`)
                : `Campanha ${proposal.campaignId}`;
            folderId = await getOrCreateCampaignFolder(proposal.campaignId, campaignName);
        }

        // 1. Create Envelope (with optional folder relationship)
        const envelopePayload: any = {
            data: {
                type: "envelopes",
                attributes: {
                    name: `Proposta de Adesão - ${proposal.nomeCompleto}`
                },
                ...(folderId && {
                    relationships: {
                        folder: {
                            data: { type: "folders", id: folderId }
                        }
                    }
                })
            }
        };

        const envelopeRes = await clicksignFetch("/api/v3/envelopes", {
            method: "POST",
            body: JSON.stringify(envelopePayload)
        });

        const envelopeId = envelopeRes?.data?.id;
        if (!envelopeId) throw new Error("Falha ao gerar ID do envelope no ClickSign.");

        // 2. Create Document by Template
        // Map template variables based on docx template fields:
        // {{nome}}, {{cpf}}, {{datanasc}}, {{numpis}}, {{sexo}}, {{estadocivil}}, {{rg}}, {{datarg}}
        // {{endereco}}, {{numcasa}}, {{bairro}}, {{cidade}}, {{uf}}, {{cep}}, {{fone}}, {{email}}
        // {{escolaridade}}, {{tc}}, {{nomebanco}}, {{agencia}}, {{numconta}}

        let birthdayFormatted = "";
        if (proposal.dataNascimento && proposal.dataNascimento.includes('/')) {
            const parts = proposal.dataNascimento.split('/');
            if (parts.length === 3) {
                birthdayFormatted = `${parts[2]}-${parts[1]}-${parts[0]}`; // YYYY-MM-DD
            }
        }

        const documentPayload = {
            data: {
                type: "documents",
                attributes: {
                    filename: `Proposta de Adesao - ${(proposal.nomeCompleto || "Associado").replace(/[^a-zA-Z0-9 ]/g, '')}.docx`,
                    template: {
                        key: DEFAULT_TEMPLATE_ID,
                        data: {
                            nome: proposal.nomeCompleto || "",
                            cpf: proposal.cpf || "",
                            email: proposal.email || "",
                            fone: proposal.telefone || "",
                            datanasc: proposal.dataNascimento || "",
                            numpis: proposal.pis || "",
                            sexo: proposal.sexo || "",
                            estadocivil: proposal.estadoCivil || "",
                            rg: proposal.rg || "",
                            datarg: proposal.datarg || "",
                            endereco: proposal.logradouroNome || "",
                            numcasa: proposal.numero || "",
                            bairro: proposal.bairro || "",
                            cidade: proposal.cidade || "",
                            uf: proposal.estado || "",
                            cep: proposal.cep || "",
                            escolaridade: proposal.escolaridade || "",
                            tc: "",
                            nomebanco: proposal.banco || "",
                            natural: proposal.naturalidadeMunicipio || "",
                            agencia: proposal.agencia || "",
                            numconta: proposal.conta ? `${proposal.conta}${proposal.contaDigito ? `-${proposal.contaDigito}` : ''}` : ""
                        }
                    }
                }
            }
        };

        const documentRes = await clicksignFetch(`/api/v3/envelopes/${envelopeId}/documents`, {
            method: "POST",
            body: JSON.stringify(documentPayload)
        });

        const documentId = documentRes?.data?.id;
        if (!documentId) throw new Error("Falha ao gerar ID do documento no ClickSign.");

        // 3. Create Signer
        // phone_number: 10 or 11 digits only (no +55 prefix)
        const phoneDigits = (proposal.telefone || "").replace(/\D/g, '');
        const formattedPhone = phoneDigits.startsWith('55') && phoneDigits.length > 11
            ? phoneDigits.slice(2)  // remove country code if present
            : phoneDigits;

        const signerPayload = {
            data: {
                type: "signers",
                attributes: {
                    name: proposal.nomeCompleto,
                    email: proposal.email,
                    phone_number: formattedPhone,
                    documentation: proposal.cpf || "",
                    birthday: birthdayFormatted || null,
                    communicate_events: {
                        signature_request: "whatsapp"
                    }
                }
            }
        };

        const signerRes = await clicksignFetch(`/api/v3/envelopes/${envelopeId}/signers`, {
            method: "POST",
            body: JSON.stringify(signerPayload)
        });

        const signerId = signerRes?.data?.id;
        if (!signerId) throw new Error("Falha ao gerar ID do signatário no ClickSign.");

        // 4. Create Authentication Requirements (each auth type is a separate requirement)
        const makeAuthReq = (auth: string) => ({
            data: {
                type: "requirements",
                attributes: { action: "provide_evidence", auth },
                relationships: {
                    document: { data: { type: "documents", id: documentId } },
                    signer: { data: { type: "signers", id: signerId } }
                }
            }
        });

        // 4.0 Qualification requirement (links signer to document as signatory)
        await clicksignFetch(`/api/v3/envelopes/${envelopeId}/requirements`, {
            method: "POST",
            body: JSON.stringify({
                data: {
                    type: "requirements",
                    attributes: { action: "agree", role: "sign" },
                    relationships: {
                        document: { data: { type: "documents", id: documentId } },
                        signer: { data: { type: "signers", id: signerId } }
                    }
                }
            })
        });

        // 4a. WhatsApp token authentication
        await clicksignFetch(`/api/v3/envelopes/${envelopeId}/requirements`, {
            method: "POST",
            body: JSON.stringify(makeAuthReq("whatsapp"))
        });

        // 4b. Selfie authentication
        await clicksignFetch(`/api/v3/envelopes/${envelopeId}/requirements`, {
            method: "POST",
            body: JSON.stringify(makeAuthReq("selfie"))
        });

        // 4c. Official document authentication
        await clicksignFetch(`/api/v3/envelopes/${envelopeId}/requirements`, {
            method: "POST",
            body: JSON.stringify(makeAuthReq("official_document"))
        });

        // 5. Activate Envelope (PATCH status: draft -> running)
        await clicksignFetch(`/api/v3/envelopes/${envelopeId}`, {
            method: "PATCH",
            body: JSON.stringify({
                data: {
                    type: "envelopes",
                    id: envelopeId,
                    attributes: { status: "running" }
                }
            })
        });

        console.log(`[Clicksign] Activated envelope ${envelopeId} successfully for proposal ${proposalId}`);


        // Save metadata in Firestore
        // NOTE: The signing URL for whatsapp+selfie flow is a one-time token
        // generated by ClickSign per notification — it cannot be pre-computed from the signer ID.
        // Admins must use the 'Resend WhatsApp' button in the admin panel.
        await docRef.update({
            clicksignEnvelopeId: envelopeId,
            clicksignDocumentId: documentId,
            clicksignSignerId: signerId,
            clicksignStatus: "pending"
        });

        if (options?.autoResendWhatsapp) {
            try {
                await sendClicksignWhatsappNotification(envelopeId, signerId);
                await docRef.collection("notifications").add({
                    type: "clicksign_whatsapp_auto_resend",
                    status: "success",
                    timestamp: new Date().toISOString(),
                    error: null,
                    payload: {
                        envelopeId,
                        signerId,
                        source: "new_signature"
                    }
                });
                console.log(`[Clicksign] Auto resent WhatsApp for signer ${signerId} after envelope creation`);
            } catch (notifyError) {
                console.warn(`[Clicksign] Auto resend failed after envelope creation for signer ${signerId}:`, notifyError);
                await docRef.collection("notifications").add({
                    type: "clicksign_whatsapp_auto_resend",
                    status: "error",
                    timestamp: new Date().toISOString(),
                    error: notifyError instanceof Error ? notifyError.message : "Erro ao reenviar WhatsApp",
                    payload: {
                        envelopeId,
                        signerId,
                        source: "new_signature"
                    }
                });
            }
        }

        return {
            success: true,
            envelopeId,
            documentId,
            signerId,
            status: "pending"
        };
    } catch (error: any) {
        console.error("[Clicksign Error] getOrCreateProposalSignature failed:", error);
        return {
            success: false,
            message: error?.message || "Erro desconhecido na integração com Clicksign."
        };
    }
}

export async function getProposalSignatureStatus(proposalId: string): Promise<ProposalSignatureStatus> {
    try {
        const db = getAdminDb();
        const docSnapshot = await db.collection("proposals").doc(proposalId).get();

        if (!docSnapshot.exists) {
            return { success: false, message: "Proposta não encontrada." };
        }

        const proposal = docSnapshot.data() as any;
        const clicksignStatus = proposal.clicksignStatus || null;

        return {
            success: true,
            clicksignStatus,
            signed: clicksignStatus === "signed"
        };
    } catch (error: any) {
        console.error("[Clicksign] getProposalSignatureStatus failed:", error);
        return { success: false, message: error?.message || "Erro ao consultar assinatura." };
    }
}

/**
 * Forces creation of a new ClickSign envelope for any proposal, regardless of current status.
 * Used by admins to generate signing documents for proposals that were submitted before
 * the ClickSign integration existed, or to regenerate a document.
 */
export async function forceCreateClicksignEnvelope(proposalId: string): Promise<ClickSignResponse> {
    try {
        const db = getAdminDb();
        const docRef = db.collection("proposals").doc(proposalId);
        const docSnapshot = await docRef.get();

        if (!docSnapshot.exists) {
            return { success: false, message: "Proposta não encontrada." };
        }

        // Clear any existing ClickSign data to force a full recreation
        await docRef.update({
            clicksignEnvelopeId: null,
            clicksignDocumentId: null,
            clicksignSignerId: null,
            clicksignStatus: null
        });

        console.log(`[Clicksign] Force-creating new envelope for proposal ${proposalId}`);

        // Reuse the same creation flow
        return await getOrCreateProposalSignature(proposalId);
    } catch (error: any) {
        console.error("[Clicksign] forceCreateClicksignEnvelope failed:", error);
        return {
            success: false,
            message: error?.message || "Erro ao forçar criação do envelope ClickSign."
        };
    }
}

/**
 * Checks if the envelope has been completed (signed by the user) on ClickSign.
 * Updates Firestore proposal document if completed.
 */
export async function verifyProposalSignature(proposalId: string): Promise<boolean> {
    try {
        const db = getAdminDb();
        const docRef = db.collection("proposals").doc(proposalId);
        const docSnapshot = await docRef.get();

        if (!docSnapshot.exists) {
            console.error(`[Clicksign Verify] Proposal ${proposalId} not found.`);
            return false;
        }

        const proposal = docSnapshot.data() as any;

        if (proposal.clicksignStatus === "signed") {
            return true;
        }

        const envelopeId = proposal.clicksignEnvelopeId;
        if (!envelopeId) {
            console.warn(`[Clicksign Verify] Proposal ${proposalId} does not have a ClickSign Envelope ID.`);
            return false;
        }

        const envelopeData = await clicksignFetch(`/api/v3/envelopes/${envelopeId}`, {
            method: "GET"
        });

        const status = envelopeData?.data?.attributes?.status;
        console.log(`[Clicksign Verify] Envelope ${envelopeId} status is: ${status}`);

        // ClickSign terminal statuses: 'completed', 'finalized', and 'closed' all mean fully signed
        if (status === "completed" || status === "finalized" || status === "closed") {
            await docRef.update({
                clicksignStatus: "signed"
            });
            return true;
        }

        if (status === "cancelled") {
            console.warn(`[Clicksign Verify] Envelope ${envelopeId} was cancelled.`);
        }

        return false;
    } catch (error) {
        console.error(`[Clicksign Verify] Failed to verify signature for proposal ${proposalId}:`, error);
        return false;
    }
}

/**
 * Fetches a temporary pre-signed URL to download the signed PDF from ClickSign.
 * The URL is generated by ClickSign and expires in ~5 minutes.
 */
export async function getClicksignSignedDocumentUrl(proposalId: string): Promise<{
    success: boolean;
    url?: string;
    filename?: string;
    message?: string;
}> {
    try {
        const db = getAdminDb();
        const docSnapshot = await db.collection("proposals").doc(proposalId).get();

        if (!docSnapshot.exists) {
            return { success: false, message: "Proposta não encontrada." };
        }

        const proposal = docSnapshot.data() as any;
        const envelopeId = proposal.clicksignEnvelopeId;

        if (!envelopeId) {
            return { success: false, message: "Proposta não possui envelope ClickSign." };
        }

        const docsData = await clicksignFetch(`/api/v3/envelopes/${envelopeId}/documents`, {
            method: "GET"
        });

        const firstDoc = docsData?.data?.[0];
        if (!firstDoc) {
            return { success: false, message: "Nenhum documento encontrado no envelope." };
        }

        const signedUrl = firstDoc?.links?.files?.signed;
        const originalUrl = firstDoc?.links?.files?.original;
        const filename = firstDoc?.attributes?.filename || "documento-assinado.pdf";

        // For closed envelopes, use the signed PDF; for pending, use original
        const downloadUrl = signedUrl || originalUrl;

        if (!downloadUrl) {
            return { success: false, message: "URL do documento não disponível." };
        }

        return {
            success: true,
            url: downloadUrl,
            filename: filename.replace(/\.(docx|doc)$/i, ".pdf")
        };
    } catch (error: any) {
        console.error("[Clicksign] getClicksignSignedDocumentUrl failed:", error);
        return { success: false, message: error?.message || "Erro ao obter URL do documento." };
    }
}

/**
 * Re-sends the WhatsApp signing notification to the signer via ClickSign API.
 * Used by admins to nudge signatories without creating a new envelope.
 */
export async function resendClicksignWhatsapp(proposalId: string): Promise<{ success: boolean; message?: string }> {
    try {
        const db = getAdminDb();
        const docRef = db.collection("proposals").doc(proposalId);
        const docSnapshot = await docRef.get();

        if (!docSnapshot.exists) {
            return { success: false, message: "Proposta não encontrada." };
        }

        const proposal = docSnapshot.data() as any;
        const envelopeId = proposal.clicksignEnvelopeId;
        const signerId = proposal.clicksignSignerId;

        if (!envelopeId || !signerId) {
            return { success: false, message: "Proposta sem envelope ClickSign gerado ainda." };
        }

        if (proposal.clicksignStatus === "signed") {
            return { success: false, message: "Esta proposta já foi assinada." };
        }

        const notifyRes = await sendClicksignWhatsappNotification(envelopeId, signerId);

        console.log(`[Clicksign] WhatsApp resent for signer ${signerId}`, notifyRes);
        return { success: true, message: "Notificação WhatsApp reenviada com sucesso." };
    } catch (error: any) {
        console.error("[Clicksign] resendClicksignWhatsapp failed:", error);
        return { success: false, message: error?.message || "Erro ao reenviar notificação WhatsApp." };
    }
}

async function sendClicksignWhatsappNotification(envelopeId: string, signerId: string) {
    // ClickSign v3: notify signer via WhatsApp using the notifications endpoint.
    // Body must follow JSON:API spec with data.type = "notifications".
    return await clicksignFetch(
        `/api/v3/envelopes/${envelopeId}/signers/${signerId}/notifications`,
        {
            method: "POST",
            body: JSON.stringify({
                data: {
                    type: "notifications",
                    attributes: {}
                }
            })
        }
    );
}

/**
 * Syncs ClickSign signature status for all proposals that have an envelope
 * but are not yet marked as signed. Optionally filter by campaignId.
 *
 * Intended for batch CSV flows where there's no user-side "finalizar" button.
 */
export async function batchSyncClicksignStatus(campaignId?: string): Promise<{
    checked: number;
    nowSigned: number;
    stillPending: number;
    errors: number;
}> {
    const db = getAdminDb();

    // Query proposals that have an envelope but haven't been marked signed yet
    let query = db.collection("proposals")
        .where("clicksignEnvelopeId", "!=", null) as FirebaseFirestore.Query;

    if (campaignId) {
        query = db.collection("proposals")
            .where("campaignId", "==", campaignId)
            .where("clicksignEnvelopeId", "!=", null);
    }

    const snap = await query.get();
    const pending = snap.docs.filter(d => d.data().clicksignStatus !== "signed");

    let nowSigned = 0;
    let stillPending = 0;
    let errors = 0;

    console.log(`[Clicksign Batch Sync] Checking ${pending.length} pending envelopes...`);

    for (const doc of pending) {
        try {
            const envelopeId = doc.data().clicksignEnvelopeId;
            const envelopeData = await clicksignFetch(`/api/v3/envelopes/${envelopeId}`, { method: "GET" });
            const status = envelopeData?.data?.attributes?.status;

            if (status === "completed" || status === "finalized" || status === "closed") {
                await doc.ref.update({ clicksignStatus: "signed" });
                nowSigned++;
                console.log(`[Clicksign Batch Sync] ✅ Marked signed: ${doc.id} (envelope ${envelopeId})`);
            } else {
                stillPending++;
            }

            // Respect rate limits
            await new Promise(r => setTimeout(r, 300));
        } catch (err) {
            console.error(`[Clicksign Batch Sync] Error checking ${doc.id}:`, err);
            errors++;
        }
    }

    console.log(`[Clicksign Batch Sync] Done. Signed: ${nowSigned}, Pending: ${stillPending}, Errors: ${errors}`);
    return { checked: pending.length, nowSigned, stillPending, errors };
}

// ─────────────────────────────────────────────────────────────────────────────
// BATCH OPERATIONS
// ─────────────────────────────────────────────────────────────────────────────

export interface ProposalCpfResult {
    cpf: string;
    proposalId: string | null;
    nomeCompleto: string | null;
    campaignId: string | null;
    campaignName: string | null;
    status: string | null;
    clicksignStatus: string | null;
    clicksignEnvelopeId: string | null;
}

/**
 * Finds proposals by a list of CPFs.
 * Returns one result per CPF, including proposals not found.
 */
export async function findProposalsByCpfs(cpfs: string[]): Promise<ProposalCpfResult[]> {
    const db = getAdminDb();

    // Normalize CPFs (strip non-digits, then reformat as 000.000.000-00)
    const normalize = (cpf: string) => {
        const d = cpf.replace(/\D/g, '');
        if (d.length !== 11) return cpf.trim();
        return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
    };

    const normalized = cpfs.map(normalize);
    const results: ProposalCpfResult[] = [];

    // Cache campaign names to avoid repeated Firestore reads
    const campaignCache: Record<string, string> = {};

    // Firestore 'in' query supports max 30 items; batch in chunks
    const chunkSize = 30;
    const found: Record<string, any> = {};

    for (let i = 0; i < normalized.length; i += chunkSize) {
        const chunk = normalized.slice(i, i + chunkSize);
        const snap = await db.collection("proposals")
            .where("cpf", "in", chunk)
            .get();

        snap.forEach(doc => {
            const d = doc.data();
            found[d.cpf] = { id: doc.id, ...d };
        });
    }

    // Resolve campaign names
    for (const cpf of normalized) {
        const proposal = found[cpf];
        if (!proposal) {
            results.push({
                cpf,
                proposalId: null,
                nomeCompleto: null,
                campaignId: null,
                campaignName: null,
                status: null,
                clicksignStatus: null,
                clicksignEnvelopeId: null
            });
            continue;
        }

        let campaignName = null;
        if (proposal.campaignId) {
            if (!campaignCache[proposal.campaignId]) {
                const campSnap = await db.collection("campaigns").doc(proposal.campaignId).get();
                campaignCache[proposal.campaignId] = campSnap.exists
                    ? (campSnap.data()?.name || campSnap.data()?.titulo || proposal.campaignId)
                    : proposal.campaignId;
            }
            campaignName = campaignCache[proposal.campaignId];
        }

        results.push({
            cpf,
            proposalId: proposal.id,
            nomeCompleto: proposal.nomeCompleto || null,
            campaignId: proposal.campaignId || null,
            campaignName,
            status: proposal.status || null,
            clicksignStatus: proposal.clicksignStatus || null,
            clicksignEnvelopeId: proposal.clicksignEnvelopeId || null
        });
    }

    return results;
}

export interface BatchCreateResult {
    cpf: string;
    proposalId: string;
    nomeCompleto: string | null;
    success: boolean;
    envelopeId?: string;
    signerId?: string;
    message?: string;
    skipped?: boolean;
    skipReason?: string;
}

/**
 * Sequentially creates ClickSign envelopes for a list of proposal IDs.
 * Each proposal gets its document placed in the campaign folder.
 * Uses a small delay between requests to respect ClickSign rate limits.
 */
export async function batchCreateClicksignEnvelopes(
    proposalIds: string[],
    options: { forceRecreate?: boolean } = {}
): Promise<BatchCreateResult[]> {
    const db = getAdminDb();
    const results: BatchCreateResult[] = [];

    for (const proposalId of proposalIds) {
        try {
            const snap = await db.collection("proposals").doc(proposalId).get();
            if (!snap.exists) {
                results.push({ cpf: '', proposalId, nomeCompleto: null, success: false, message: 'Proposta não encontrada' });
                continue;
            }

            const proposal = snap.data() as any;
            const cpf = proposal.cpf || '';

            // Skip already signed unless force recreate
            if (proposal.clicksignStatus === 'signed' && !options.forceRecreate) {
                results.push({
                    cpf, proposalId, nomeCompleto: proposal.nomeCompleto,
                    success: true, skipped: true, skipReason: 'Já assinado',
                    envelopeId: proposal.clicksignEnvelopeId
                });
                continue;
            }

            // Force recreate: clear existing ClickSign data
            if (options.forceRecreate && proposal.clicksignEnvelopeId) {
                await db.collection("proposals").doc(proposalId).update({
                    clicksignEnvelopeId: null,
                    clicksignDocumentId: null,
                    clicksignSignerId: null,
                    clicksignStatus: null
                });
            }

            const res = await getOrCreateProposalSignature(proposalId);
            results.push({
                cpf, proposalId, nomeCompleto: proposal.nomeCompleto,
                success: res.success,
                envelopeId: res.envelopeId,
                signerId: res.signerId,
                message: res.message
            });

            // Small delay to avoid ClickSign rate limiting
            await new Promise(r => setTimeout(r, 800));
        } catch (err: any) {
            results.push({ cpf: '', proposalId, nomeCompleto: null, success: false, message: err?.message || 'Erro desconhecido' });
        }
    }

    return results;
}

export interface BatchResendResult {
    cpf: string;
    proposalId: string;
    nomeCompleto: string | null;
    success: boolean;
    message?: string;
}

/**
 * Resends WhatsApp signing notifications to all unsigned proposals in the list.
 */
export async function batchResendWhatsapp(proposalIds: string[]): Promise<BatchResendResult[]> {
    const db = getAdminDb();
    const results: BatchResendResult[] = [];

    for (const proposalId of proposalIds) {
        const snap = await db.collection("proposals").doc(proposalId).get();
        if (!snap.exists) {
            results.push({ cpf: '', proposalId, nomeCompleto: null, success: false, message: 'Não encontrada' });
            continue;
        }

        const proposal = snap.data() as any;

        if (proposal.clicksignStatus === 'signed') {
            results.push({ cpf: proposal.cpf || '', proposalId, nomeCompleto: proposal.nomeCompleto, success: true, message: 'Já assinado — pulado' });
            continue;
        }

        if (!proposal.clicksignEnvelopeId) {
            results.push({ cpf: proposal.cpf || '', proposalId, nomeCompleto: proposal.nomeCompleto, success: false, message: 'Sem envelope gerado' });
            continue;
        }

        const res = await resendClicksignWhatsapp(proposalId);
        results.push({ cpf: proposal.cpf || '', proposalId, nomeCompleto: proposal.nomeCompleto, success: res.success, message: res.message });

        await new Promise(r => setTimeout(r, 500));
    }

    return results;
}

/**
 * Resends WhatsApp signing notifications for ALL pending proposals in a campaign.
 * Skips proposals that are already signed or have no envelope.
 */
export async function batchResendWhatsappByCampaign(campaignId: string): Promise<{
    total: number;
    sent: number;
    skipped: number;
    errors: number;
    details: BatchResendResult[];
}> {
    const db = getAdminDb();

    // Find all proposals in this campaign that have an envelope but are not signed
    const snap = await db.collection('proposals')
        .where('campaignId', '==', campaignId)
        .where('clicksignEnvelopeId', '!=', null)
        .get();

    const pending = snap.docs.filter(d => d.data().clicksignStatus !== 'signed');

    console.log(`[Clicksign Batch Resend] Campaign ${campaignId}: ${pending.length} pending out of ${snap.size} with envelopes`);

    const details: BatchResendResult[] = [];
    let sent = 0;
    let skipped = 0;
    let errors = 0;

    for (const doc of pending) {
        const proposal = doc.data();
        const res = await resendClicksignWhatsapp(doc.id);

        details.push({
            cpf: proposal.cpf || '',
            proposalId: doc.id,
            nomeCompleto: proposal.nomeCompleto || null,
            success: res.success,
            message: res.message
        });

        if (res.success) sent++;
        else errors++;

        await new Promise(r => setTimeout(r, 500));
    }

    return { total: pending.length, sent, skipped, errors, details };
}
