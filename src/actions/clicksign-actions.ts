'use server';

import fs from "node:fs/promises";
import path from "node:path";
import { getAdminDb } from "@/lib/firebase-admin";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";

const PLUGSIGN_API_URL = process.env.PLUGSIGN_API_URL || "https://app.plugsign.com.br";
const PROPOSAL_TEMPLATE_PATH = path.join(process.cwd(), "PORPOSTAV1.docx");
const SIGNED_STATUSES = new Set(["signed"]);
const PENDING_STATUS = "pending";

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

type PlugsignRequest = {
    id?: number | string;
    signing_key?: string;
    document?: string;
    status?: string;
    update_time?: string;
    send_time?: string;
    url?: string;
    link?: string;
    signing_url?: string;
    signature_url?: string;
    sign_url?: string;
};

function getPlugsignToken() {
    const token = process.env.PLUGSIGN_API_TOKEN || process.env.PLUGSIGN_TOKEN;

    if (!token) {
        throw new Error("PLUGSIGN_API_TOKEN não configurado no servidor.");
    }

    return token;
}

async function plugsignFetch(endpoint: string, options: RequestInit = {}) {
    const url = `${PLUGSIGN_API_URL}${endpoint}`;
    const headers = {
        "Accept": "application/json",
        "Authorization": getPlugsignToken(),
        ...options.headers
    };

    console.log(`[Plugsign Request] ${options.method || "GET"} ${url}`);

    const response = await fetch(url, {
        ...options,
        headers
    });

    const contentType = response.headers.get("content-type") || "";
    const responseBody = contentType.includes("application/json")
        ? await response.json().catch(() => null)
        : await response.text().catch(() => "");

    console.log(`[Plugsign Response] Status ${response.status}:`, typeof responseBody === "string" ? responseBody.slice(0, 500) : responseBody);

    if (!response.ok) {
        const message = typeof responseBody === "object" && responseBody
            ? (responseBody as any).message || (responseBody as any).error || JSON.stringify(responseBody)
            : `Erro ${response.status}`;
        throw new Error(message);
    }

    return responseBody;
}

function onlyDigits(value: unknown) {
    return String(value || "").replace(/\D/g, "");
}

function sanitizeFilename(value: string) {
    return value
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-zA-Z0-9 -]/g, "")
        .trim()
        .replace(/\s+/g, " ")
        .slice(0, 80) || "Associado";
}

function formatBirthdateForPlugsign(value: unknown) {
    const text = String(value || "").trim();
    const match = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    return match ? text : "";
}

function normalizePlugsignStatus(status: unknown) {
    const normalized = String(status || "").trim().toLowerCase();
    if (SIGNED_STATUSES.has(normalized)) return "signed";
    if (normalized === "cancelled" || normalized === "declined") return normalized;
    return PENDING_STATUS;
}

function getProposalIssueDate() {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat("pt-BR", {
        timeZone: "America/Fortaleza",
        day: "2-digit",
        month: "long",
        year: "numeric"
    });

    const parts = Object.fromEntries(
        formatter.formatToParts(now).map((part) => [part.type, part.value])
    );

    return {
        dia: parts.day || "",
        mes: parts.month || "",
        ano: parts.year || ""
    };
}

function extractSigningUrl(value: unknown): string | null {
    if (!value || typeof value !== "object") return null;

    const record = value as Record<string, unknown>;
    const directCandidates = [
        record.signing_url,
        record.signature_url,
        record.sign_url,
        record.signing_link,
        record.signature_link,
        record.link_signature,
        record.url_sign,
        record.url_signature,
        record.url_assinatura,
        record.link_assinatura,
        record.signingUrl,
        record.signatureUrl,
        record.url,
        record.link,
        record.public_url,
        record.publicUrl
    ];

    for (const candidate of directCandidates) {
        if (typeof candidate === "string" && /^https?:\/\//i.test(candidate)) {
            return candidate;
        }
    }

    for (const nestedValue of Object.values(record)) {
        if (Array.isArray(nestedValue)) {
            for (const item of nestedValue) {
                const found = extractSigningUrl(item);
                if (found) return found;
            }
            continue;
        }

        if (nestedValue && typeof nestedValue === "object") {
            const found = extractSigningUrl(nestedValue);
            if (found) return found;
        }
    }

    return null;
}

async function notifySignatureWhatsapp(payload: { nome: string; numero: string; link: string }) {
    const endpoint = process.env.PLUGSIGN_WHATSAPP_ENDPOINT || process.env.SIGNATURE_WHATSAPP_ENDPOINT;

    if (!endpoint) {
        console.log("[DEV PLUGSIGN WHATSAPP]", payload);
        return { success: true, message: "Endpoint de WhatsApp de assinatura não configurado." };
    }

    try {
        const response = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorText = await response.text();
            return { success: false, message: `Erro API (${response.status}): ${errorText}` };
        }

        return { success: true };
    } catch (error) {
        return { success: false, message: error instanceof Error ? error.message : "Erro de conexão" };
    }
}

function mapProposalToTemplateData(proposal: any) {
    const issueDate = getProposalIssueDate();

    return {
        nome: proposal.nomeCompleto || "",
        cpf: proposal.cpf || "",
        email: proposal.email || "",
        fone: proposal.telefone || "",
        datanasc: proposal.dataNascimento || "",
        numpis: proposal.pis || "",
        sexo: proposal.sexo || "",
        estadocivil: proposal.estadoCivil || "",
        rg: proposal.rg || "",
        datarg: proposal.datarg || proposal.dataExpedicao || "",
        endereco: [proposal.logradouroTipo, proposal.logradouroNome].filter(Boolean).join(" ") || proposal.logradouroNome || "",
        numcasa: proposal.numero || "",
        bairro: proposal.bairro || "",
        cidade: proposal.cidade || "",
        uf: proposal.estado || "",
        cep: proposal.cep || "",
        escolaridade: proposal.escolaridade || "",
        cargo: proposal.cargo || proposal.categoriaFuncao || "",
        tc: proposal.tipoConta || "",
        nomebanco: proposal.banco || "",
        natural: proposal.naturalidadeMunicipio || "",
        agencia: proposal.agencia || "",
        numconta: proposal.conta ? `${proposal.conta}${proposal.contaDigito ? `-${proposal.contaDigito}` : ""}` : "",
        dia: issueDate.dia,
        mes: issueDate.mes,
        ano: issueDate.ano
    };
}

function appendFormData(formData: FormData, key: string, value: unknown) {
    if (value === undefined || value === null || value === "") return;

    if (Array.isArray(value)) {
        value.forEach((item, index) => appendFormData(formData, `${key}[${index}]`, item));
        return;
    }

    if (typeof value === "object") {
        Object.entries(value as Record<string, unknown>).forEach(([childKey, childValue]) => {
            appendFormData(formData, `${key}[${childKey}]`, childValue);
        });
        return;
    }

    formData.append(key, typeof value === "boolean" ? (value ? "1" : "0") : String(value));
}

async function renderProposalDocx(proposal: any) {
    const template = await fs.readFile(PROPOSAL_TEMPLATE_PATH);
    const zip = new PizZip(template);
    const doc = new Docxtemplater(zip, {
        delimiters: {
            start: "{{",
            end: "}}"
        },
        paragraphLoop: true,
        linebreaks: true,
        nullGetter: () => ""
    });

    doc.render(mapProposalToTemplateData(proposal));
    return doc.getZip().generate({
        type: "nodebuffer",
        compression: "DEFLATE"
    }) as Buffer;
}

async function getOrCreateCampaignFolder(campaignId: string, campaignName: string): Promise<number | null> {
    try {
        const db = getAdminDb();
        const campaignRef = db.collection("campaigns").doc(campaignId);
        const campaignSnap = await campaignRef.get();

        const existingFolderId = campaignSnap.exists
            ? campaignSnap.data()?.plugsignFolderId || campaignSnap.data()?.clicksignFolderId
            : null;

        if (existingFolderId) {
            return Number(existingFolderId);
        }

        const folderRes = await plugsignFetch("/api/folders", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                name: campaignName,
                accessibility: "Everyone"
            })
        });

        const folderId = Number(folderRes?.data?.id);
        if (!folderId) return null;

        await campaignRef.update({
            plugsignFolderId: folderId,
            clicksignFolderId: String(folderId)
        });

        return folderId;
    } catch (err) {
        console.warn(`[Plugsign] getOrCreateCampaignFolder failed for ${campaignId}:`, err);
        return null;
    }
}

async function getCampaignFolderId(proposal: any) {
    if (!proposal.campaignId || proposal.campaignId === "uncategorized") return null;

    const db = getAdminDb();
    const campaignSnap = await db.collection("campaigns").doc(proposal.campaignId).get();
    const campaignName = campaignSnap.exists
        ? (campaignSnap.data()?.name || campaignSnap.data()?.titulo || `Campanha ${proposal.campaignId}`)
        : `Campanha ${proposal.campaignId}`;

    return getOrCreateCampaignFolder(proposal.campaignId, campaignName);
}

async function getPlugsignRequest(signingKey: string): Promise<PlugsignRequest | null> {
    const res = await plugsignFetch(`/api/requests/${encodeURIComponent(signingKey)}`, {
        method: "GET"
    });

    return res?.data || null;
}

async function markSignedIfNeeded(proposalId: string, request: PlugsignRequest) {
    const db = getAdminDb();
    const docRef = db.collection("proposals").doc(proposalId);
    const snap = await docRef.get();
    if (!snap.exists) return false;

    const proposal = snap.data() as any;
    const status = normalizePlugsignStatus(request.status);
    if (status !== "signed") return false;

    const signedAt = request.update_time || new Date().toISOString();
    const update: FirebaseFirestore.UpdateData<FirebaseFirestore.DocumentData> = {
        clicksignStatus: "signed",
        plugsignStatus: "signed",
        clicksignSignedAt: signedAt,
        plugsignSignedAt: signedAt,
        documentsSubmittedAt: proposal.documentsSubmittedAt || signedAt
    };

    if (proposal.status === "pending_documents") {
        update.status = "documents_received";
    }

    await docRef.update(update);
    return true;
}

export async function getOrCreateProposalSignature(
    proposalId: string,
    options?: { requireWhatsappVerified?: boolean; autoResendWhatsapp?: boolean }
): Promise<ClickSignResponse> {
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

        const existingSigningKey = proposal.plugsignSigningKey || proposal.clicksignSignerId;
        const existingDocumentKey = proposal.plugsignDocumentKey || proposal.clicksignDocumentId;
        const existingRequestId = proposal.plugsignRequestId || proposal.clicksignEnvelopeId;
        const phoneDigits = onlyDigits(proposal.telefone);
        const phoneWithCountry = phoneDigits.startsWith("55") ? phoneDigits : `55${phoneDigits}`;

        if (existingSigningKey && existingDocumentKey && existingRequestId) {
            try {
                const existingRequest = await getPlugsignRequest(existingSigningKey);
                const normalizedStatus = normalizePlugsignStatus(existingRequest?.status);
                if (existingRequest) {
                    if (normalizedStatus === "signed") {
                        await markSignedIfNeeded(proposalId, existingRequest);
                    }

                    const existingSigningUrl = proposal.plugsignSigningUrl || extractSigningUrl(existingRequest);
                    if (options?.autoResendWhatsapp && normalizedStatus !== "signed" && existingSigningUrl) {
                        const whatsappResult = await notifySignatureWhatsapp({
                            nome: proposal.nomeCompleto || "Cooperado",
                            numero: phoneWithCountry,
                            link: existingSigningUrl
                        });

                        await docRef.update({
                            plugsignSigningUrl: existingSigningUrl,
                            plugsignWhatsappSentAt: whatsappResult.success ? new Date().toISOString() : null,
                            plugsignWhatsappError: whatsappResult.success ? null : whatsappResult.message
                        });
                    }

                    return {
                        success: true,
                        envelopeId: String(existingRequest.id || existingRequestId),
                        documentId: String(existingRequest.document || existingDocumentKey),
                        signerId: String(existingRequest.signing_key || existingSigningKey),
                        signingUrl: existingSigningUrl || undefined,
                        status: normalizedStatus
                    };
                }
            } catch (err) {
                console.warn(`[Plugsign] Could not validate cached request for proposal ${proposalId}, recreating:`, err);
            }
        }

        const folderId = await getCampaignFolderId(proposal);
        const docxBuffer = await renderProposalDocx(proposal);
        const filename = `Proposta de Adesao - ${sanitizeFilename(proposal.nomeCompleto || "Associado")}.docx`;

        const payload = {
            ...(folderId && { folder: folderId }),
            name: filename,
            chain: false,
            silent_mode: true,
            optimizer: true,
            editablevalidate: 3,
            width_page: 794,
            recipients: [
                {
                    send_to: phoneWithCountry,
                    subject: "Assinatura da Proposta de Adesão",
                    message: "Olá! Assine sua Proposta de Adesão da COOPEDU.",
                    fullname: proposal.nomeCompleto || "",
                    cpf: onlyDigits(proposal.cpf),
                    birthdate: formatBirthdateForPlugsign(proposal.dataNascimento),
                    doubleauth: false,
                    allow_selfie: true,
                    allow_document: true,
                    allow_document_back: true,
                    allow_cpf: true,
                    allow_birth_date: true,
                    signature_type: "Interessado",
                    send_finished: true,
                    signature_mode: "all",
                    certificate: 0,
                    fields: [
                        {
                            type: "signature",
                            page: 1,
                            width: 200,
                            height: 75,
                            xPos: -999,
                            yPos: -999
                        }
                    ]
                }
            ]
        };

        const formData = new FormData();
        appendFormData(formData, "folder", payload.folder);
        appendFormData(formData, "name", payload.name);
        appendFormData(formData, "chain", payload.chain);
        appendFormData(formData, "silent_mode", payload.silent_mode);
        appendFormData(formData, "optimizer", payload.optimizer);
        appendFormData(formData, "editablevalidate", payload.editablevalidate);
        appendFormData(formData, "width_page", payload.width_page);
        appendFormData(formData, "recipients", payload.recipients);
        formData.append(
            "file",
            new Blob([new Uint8Array(docxBuffer)], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }),
            filename
        );

        const requestRes = await plugsignFetch("/api/files/upload/requests", {
            method: "POST",
            body: formData
        });

        const request = (Array.isArray(requestRes?.data)
            ? requestRes.data[0]
            : requestRes?.data) as PlugsignRequest | undefined;

        if (!request?.id || !request?.signing_key || !request?.document) {
            throw new Error("Plugsign não retornou os identificadores da solicitação.");
        }

        const signingUrl = extractSigningUrl(request) || extractSigningUrl(requestRes);
        const whatsappResult = signingUrl
            ? await notifySignatureWhatsapp({
                nome: proposal.nomeCompleto || "Cooperado",
                numero: phoneWithCountry,
                link: signingUrl
            })
            : { success: false, message: "Plugsign não retornou o link de assinatura no modo silencioso." };

        await docRef.update({
            plugsignRequestId: String(request.id),
            plugsignDocumentKey: request.document,
            plugsignSigningKey: request.signing_key,
            plugsignSigningUrl: signingUrl || null,
            plugsignStatus: normalizePlugsignStatus(request.status),
            plugsignProvider: "plugsign",
            plugsignOriginalFilename: filename,
            plugsignWhatsappSentAt: whatsappResult.success ? new Date().toISOString() : null,
            plugsignWhatsappError: whatsappResult.success ? null : whatsappResult.message,
            clicksignEnvelopeId: String(request.id),
            clicksignDocumentId: request.document,
            clicksignSignerId: request.signing_key,
            clicksignStatus: normalizePlugsignStatus(request.status)
        });

        return {
            success: true,
            envelopeId: String(request.id),
            documentId: request.document,
            signerId: request.signing_key,
            signingUrl: signingUrl || undefined,
            status: normalizePlugsignStatus(request.status),
            message: whatsappResult.success
                ? "Solicitação criada e link de assinatura enviado pelo WhatsApp."
                : `Solicitação criada, mas o WhatsApp não foi enviado: ${whatsappResult.message}`
        };
    } catch (error: any) {
        console.error("[Plugsign Error] getOrCreateProposalSignature failed:", error);
        return {
            success: false,
            message: error?.message || "Erro desconhecido na integração com Plugsign."
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
        const clicksignStatus = proposal.clicksignStatus || proposal.plugsignStatus || null;

        return {
            success: true,
            clicksignStatus,
            signed: clicksignStatus === "signed"
        };
    } catch (error: any) {
        console.error("[Plugsign] getProposalSignatureStatus failed:", error);
        return { success: false, message: error?.message || "Erro ao consultar assinatura." };
    }
}

export async function forceCreateClicksignEnvelope(proposalId: string): Promise<ClickSignResponse> {
    try {
        const db = getAdminDb();
        const docRef = db.collection("proposals").doc(proposalId);
        const docSnapshot = await docRef.get();

        if (!docSnapshot.exists) {
            return { success: false, message: "Proposta não encontrada." };
        }

        await docRef.update({
            plugsignRequestId: null,
            plugsignDocumentKey: null,
            plugsignSigningKey: null,
            plugsignSigningUrl: null,
            plugsignStatus: null,
            plugsignWhatsappSentAt: null,
            plugsignWhatsappError: null,
            clicksignEnvelopeId: null,
            clicksignDocumentId: null,
            clicksignSignerId: null,
            clicksignStatus: null
        });

        return await getOrCreateProposalSignature(proposalId);
    } catch (error: any) {
        console.error("[Plugsign] forceCreateClicksignEnvelope failed:", error);
        return {
            success: false,
            message: error?.message || "Erro ao forçar criação da solicitação Plugsign."
        };
    }
}

export async function verifyProposalSignature(proposalId: string): Promise<boolean> {
    try {
        const db = getAdminDb();
        const docRef = db.collection("proposals").doc(proposalId);
        const docSnapshot = await docRef.get();

        if (!docSnapshot.exists) {
            console.error(`[Plugsign Verify] Proposal ${proposalId} not found.`);
            return false;
        }

        const proposal = docSnapshot.data() as any;

        if (proposal.clicksignStatus === "signed" || proposal.plugsignStatus === "signed") {
            return true;
        }

        const signingKey = proposal.plugsignSigningKey || proposal.clicksignSignerId;
        if (!signingKey) {
            console.warn(`[Plugsign Verify] Proposal ${proposalId} does not have a Plugsign signing key.`);
            return false;
        }

        const request = await getPlugsignRequest(signingKey);
        if (!request) return false;

        return await markSignedIfNeeded(proposalId, request);
    } catch (error) {
        console.error(`[Plugsign Verify] Failed to verify signature for proposal ${proposalId}:`, error);
        return false;
    }
}

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
        const documentKey = proposal.plugsignDocumentKey || proposal.clicksignDocumentId;

        if (!documentKey) {
            return { success: false, message: "Proposta não possui documento Plugsign." };
        }

        return {
            success: true,
            url: `/api/plugsign-download/${encodeURIComponent(documentKey)}`,
            filename: `proposta-${sanitizeFilename(proposal.nomeCompleto || proposalId)}.pdf`
        };
    } catch (error: any) {
        console.error("[Plugsign] getClicksignSignedDocumentUrl failed:", error);
        return { success: false, message: error?.message || "Erro ao obter URL do documento." };
    }
}

export async function resendClicksignWhatsapp(proposalId: string): Promise<{ success: boolean; message?: string }> {
    try {
        const db = getAdminDb();
        const docRef = db.collection("proposals").doc(proposalId);
        const snap = await docRef.get();

        if (!snap.exists) {
            return { success: false, message: "Proposta não encontrada." };
        }

        const proposal = snap.data() as any;
        if (proposal.clicksignStatus === "signed" || proposal.plugsignStatus === "signed") {
            return { success: false, message: "Esta proposta já foi assinada." };
        }

        const savedSigningUrl = proposal.plugsignSigningUrl;
        const phoneDigits = onlyDigits(proposal.telefone);
        const phoneWithCountry = phoneDigits.startsWith("55") ? phoneDigits : `55${phoneDigits}`;

        if (savedSigningUrl) {
            const whatsappResult = await notifySignatureWhatsapp({
                nome: proposal.nomeCompleto || "Cooperado",
                numero: phoneWithCountry,
                link: savedSigningUrl
            });

            await docRef.update({
                plugsignWhatsappSentAt: whatsappResult.success ? new Date().toISOString() : null,
                plugsignWhatsappError: whatsappResult.success ? null : whatsappResult.message
            });

            return {
                success: whatsappResult.success,
                message: whatsappResult.success
                    ? "Link de assinatura reenviado pelo WhatsApp."
                    : whatsappResult.message
            };
        }

        const recreated = await forceCreateClicksignEnvelope(proposalId);
        return {
            success: recreated.success,
            message: recreated.message || (recreated.success
                ? "Nova solicitação Plugsign enviada ao signatário."
                : "Erro ao recriar solicitação Plugsign.")
        };
    } catch (error: any) {
        console.error("[Plugsign] resendClicksignWhatsapp failed:", error);
        return { success: false, message: error?.message || "Erro ao reenviar solicitação Plugsign." };
    }
}

export async function batchSyncClicksignStatus(campaignId?: string): Promise<{
    checked: number;
    nowSigned: number;
    stillPending: number;
    errors: number;
}> {
    const db = getAdminDb();

    let query = db.collection("proposals")
        .where("clicksignEnvelopeId", "!=", null) as FirebaseFirestore.Query;

    if (campaignId) {
        query = db.collection("proposals")
            .where("campaignId", "==", campaignId)
            .where("clicksignEnvelopeId", "!=", null);
    }

    const snap = await query.get();
    const pending = snap.docs.filter(d => d.data().clicksignStatus !== "signed" && d.data().plugsignStatus !== "signed");

    let nowSigned = 0;
    let stillPending = 0;
    let errors = 0;

    for (const doc of pending) {
        try {
            const signingKey = doc.data().plugsignSigningKey || doc.data().clicksignSignerId;
            if (!signingKey) {
                stillPending++;
                continue;
            }

            const request = await getPlugsignRequest(signingKey);
            const status = normalizePlugsignStatus(request?.status);

            if (request && status === "signed") {
                await markSignedIfNeeded(doc.id, request);
                nowSigned++;
            } else {
                stillPending++;
            }

            await new Promise(r => setTimeout(r, 300));
        } catch (err) {
            console.error(`[Plugsign Batch Sync] Error checking ${doc.id}:`, err);
            errors++;
        }
    }

    return { checked: pending.length, nowSigned, stillPending, errors };
}

export interface DocumentDashboardStats {
    totalProposals: number;
    created: number;
    signed: number;
    pendingSignature: number;
}

export async function getDocumentDashboardStats(): Promise<DocumentDashboardStats> {
    const db = getAdminDb();
    const proposals = db.collection("proposals");

    const [totalSnap, createdSnap, signedSnap] = await Promise.all([
        proposals.count().get(),
        proposals.where("clicksignEnvelopeId", "!=", null).count().get(),
        proposals.where("clicksignStatus", "==", "signed").count().get(),
    ]);

    const totalProposals = totalSnap.data().count;
    const created = createdSnap.data().count;
    const signed = signedSnap.data().count;

    return {
        totalProposals,
        created,
        signed,
        pendingSignature: Math.max(created - signed, 0),
    };
}

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

export async function findProposalsByCpfs(cpfs: string[]): Promise<ProposalCpfResult[]> {
    const db = getAdminDb();
    const normalize = (cpf: string) => {
        const d = cpf.replace(/\D/g, "");
        if (d.length !== 11) return cpf.trim();
        return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
    };

    const normalized = cpfs.map(normalize);
    const results: ProposalCpfResult[] = [];
    const campaignCache: Record<string, string> = {};
    const found: Record<string, any> = {};

    for (let i = 0; i < normalized.length; i += 30) {
        const chunk = normalized.slice(i, i + 30);
        const snap = await db.collection("proposals").where("cpf", "in", chunk).get();
        snap.forEach(doc => {
            const d = doc.data();
            found[d.cpf] = { id: doc.id, ...d };
        });
    }

    for (const cpf of normalized) {
        const proposal = found[cpf];
        if (!proposal) {
            results.push({ cpf, proposalId: null, nomeCompleto: null, campaignId: null, campaignName: null, status: null, clicksignStatus: null, clicksignEnvelopeId: null });
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
            clicksignStatus: proposal.clicksignStatus || proposal.plugsignStatus || null,
            clicksignEnvelopeId: proposal.clicksignEnvelopeId || proposal.plugsignRequestId || null
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
                results.push({ cpf: "", proposalId, nomeCompleto: null, success: false, message: "Proposta não encontrada" });
                continue;
            }

            const proposal = snap.data() as any;
            const cpf = proposal.cpf || "";

            if ((proposal.clicksignStatus === "signed" || proposal.plugsignStatus === "signed") && !options.forceRecreate) {
                results.push({
                    cpf,
                    proposalId,
                    nomeCompleto: proposal.nomeCompleto,
                    success: true,
                    skipped: true,
                    skipReason: "Já assinado",
                    envelopeId: proposal.clicksignEnvelopeId || proposal.plugsignRequestId
                });
                continue;
            }

            if (options.forceRecreate && (proposal.clicksignEnvelopeId || proposal.plugsignRequestId)) {
                await db.collection("proposals").doc(proposalId).update({
                    plugsignRequestId: null,
                    plugsignDocumentKey: null,
                    plugsignSigningKey: null,
                    plugsignStatus: null,
                    clicksignEnvelopeId: null,
                    clicksignDocumentId: null,
                    clicksignSignerId: null,
                    clicksignStatus: null
                });
            }

            const res = await getOrCreateProposalSignature(proposalId);
            results.push({
                cpf,
                proposalId,
                nomeCompleto: proposal.nomeCompleto,
                success: res.success,
                envelopeId: res.envelopeId,
                signerId: res.signerId,
                message: res.message
            });

            await new Promise(r => setTimeout(r, 800));
        } catch (err: any) {
            results.push({ cpf: "", proposalId, nomeCompleto: null, success: false, message: err?.message || "Erro desconhecido" });
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

export async function batchResendWhatsapp(proposalIds: string[]): Promise<BatchResendResult[]> {
    const db = getAdminDb();
    const results: BatchResendResult[] = [];

    for (const proposalId of proposalIds) {
        const snap = await db.collection("proposals").doc(proposalId).get();
        if (!snap.exists) {
            results.push({ cpf: "", proposalId, nomeCompleto: null, success: false, message: "Não encontrada" });
            continue;
        }

        const proposal = snap.data() as any;

        if (proposal.clicksignStatus === "signed" || proposal.plugsignStatus === "signed") {
            results.push({ cpf: proposal.cpf || "", proposalId, nomeCompleto: proposal.nomeCompleto, success: true, message: "Já assinado - pulado" });
            continue;
        }

        const res = await resendClicksignWhatsapp(proposalId);
        results.push({ cpf: proposal.cpf || "", proposalId, nomeCompleto: proposal.nomeCompleto, success: res.success, message: res.message });

        await new Promise(r => setTimeout(r, 500));
    }

    return results;
}

export async function batchResendWhatsappByCampaign(campaignId: string): Promise<{
    total: number;
    sent: number;
    skipped: number;
    errors: number;
    details: BatchResendResult[];
}> {
    const db = getAdminDb();
    const snap = await db.collection("proposals")
        .where("campaignId", "==", campaignId)
        .where("clicksignEnvelopeId", "!=", null)
        .get();

    const pending = snap.docs.filter(d => d.data().clicksignStatus !== "signed" && d.data().plugsignStatus !== "signed");
    const details: BatchResendResult[] = [];
    let sent = 0;
    let errors = 0;

    for (const doc of pending) {
        const proposal = doc.data();
        const res = await resendClicksignWhatsapp(doc.id);

        details.push({
            cpf: proposal.cpf || "",
            proposalId: doc.id,
            nomeCompleto: proposal.nomeCompleto || null,
            success: res.success,
            message: res.message
        });

        if (res.success) sent++;
        else errors++;

        await new Promise(r => setTimeout(r, 500));
    }

    return { total: pending.length, sent, skipped: 0, errors, details };
}
