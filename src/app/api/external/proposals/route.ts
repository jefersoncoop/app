import { createHash, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PUBLIC_PROPOSAL_FIELDS = [
    "campaignId",
    "clientId",
    "functionId",
    "nomeCompleto",
    "cpf",
    "rg",
    "estadoExpedidor",
    "orgaoExpedidor",
    "nomeMae",
    "pis",
    "dataNascimento",
    "sexo",
    "corRaca",
    "estadoCivil",
    "nacionalidade",
    "naturalidadeEstado",
    "naturalidadeMunicipio",
    "cep",
    "estado",
    "cidade",
    "logradouroTipo",
    "logradouroNome",
    "numero",
    "bairro",
    "complemento",
    "telefone",
    "email",
    "banco",
    "tipoConta",
    "agencia",
    "conta",
    "contaDigito",
    "escolaridade",
    "categoriaFuncao",
    "cargo",
    "tamanhoCamisa",
    "criterioLocalidade",
    "criterioExperiencia",
    "criterioDisponibilidade",
    "criterioFormacao",
    "criterioCapacitacao",
    "trabalhaEscolaBetim",
    "escolaSelecionada",
    "aceiteConcordancia",
    "aceiteLGPD",
    "aceiteTermoAdessao",
    "status",
    "createdAt",
    "updatedAt",
    "documentsSubmittedAt",
    "crmSynced",
    "crmSyncedAt",
] as const;

function json(body: unknown, status = 200) {
    return NextResponse.json(body, {
        status,
        headers: {
            "Cache-Control": "no-store",
        },
    });
}

function onlyDigits(value: unknown) {
    return String(value ?? "").replace(/\D/g, "");
}

function isValidCpf(cpf: string) {
    if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false;

    const calculateDigit = (length: number) => {
        let sum = 0;
        for (let index = 0; index < length; index += 1) {
            sum += Number(cpf[index]) * (length + 1 - index);
        }
        const remainder = (sum * 10) % 11;
        return remainder === 10 ? 0 : remainder;
    };

    return calculateDigit(9) === Number(cpf[9])
        && calculateDigit(10) === Number(cpf[10]);
}

function suppliedApiKey(request: NextRequest) {
    const authorization = request.headers.get("authorization")?.trim() || "";
    if (/^Bearer\s+/i.test(authorization)) {
        return authorization.replace(/^Bearer\s+/i, "").trim();
    }
    return request.headers.get("x-api-key")?.trim() || "";
}

function safeEquals(left: string, right: string) {
    const leftDigest = createHash("sha256").update(left).digest();
    const rightDigest = createHash("sha256").update(right).digest();
    return timingSafeEqual(leftDigest, rightDigest);
}

function authenticate(request: NextRequest) {
    // XAPIKEY is retained as a compatibility fallback for the existing deployment.
    const expectedKey = process.env.PROPOSAL_API_KEY || process.env.XAPIKEY || "";
    if (!expectedKey) return "not_configured" as const;

    const receivedKey = suppliedApiKey(request);
    return receivedKey && safeEquals(receivedKey, expectedKey)
        ? "authorized" as const
        : "unauthorized" as const;
}

function formatLegacyCpf(cpf: string) {
    return `${cpf.slice(0, 3)}.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-${cpf.slice(9)}`;
}

async function findProposalByCpf(cpf: string) {
    const db = getAdminDb();
    const normalizedSnapshot = await db.collection("proposals")
        .where("cpfDigits", "==", cpf)
        .limit(1)
        .get();

    if (!normalizedSnapshot.empty) return normalizedSnapshot.docs[0];

    // Compatibility with proposals created before cpfDigits was introduced.
    const legacySnapshot = await db.collection("proposals")
        .where("cpf", "in", [cpf, formatLegacyCpf(cpf)])
        .limit(1)
        .get();

    return legacySnapshot.empty ? null : legacySnapshot.docs[0];
}

function serializeValue(value: unknown): unknown {
    if (value === null || value === undefined) return value;
    if (value instanceof Date) return value.toISOString();

    if (typeof value === "object" && "toDate" in value && typeof value.toDate === "function") {
        return value.toDate().toISOString();
    }

    if (Array.isArray(value)) return value.map(serializeValue);

    if (typeof value === "object") {
        return Object.fromEntries(
            Object.entries(value).map(([key, nestedValue]) => [key, serializeValue(nestedValue)])
        );
    }

    return value;
}

function publicProposal(id: string, proposal: Record<string, unknown>) {
    const result: Record<string, unknown> = { id };
    for (const field of PUBLIC_PROPOSAL_FIELDS) {
        if (proposal[field] !== undefined) result[field] = serializeValue(proposal[field]);
    }

    const providerStatus = String(proposal.plugsignStatus || proposal.clicksignStatus || "")
        .trim()
        .toLowerCase();
    const signed = providerStatus === "signed" || proposal.status === "signed";
    const hasSignatureRequest = Boolean(
        proposal.plugsignRequestId
        || proposal.clicksignEnvelopeId
        || proposal.plugsignSigningUrl
    );

    let signatureStatus = "nao_solicitado";
    if (signed) signatureStatus = "assinado";
    else if (providerStatus === "cancelled") signatureStatus = "cancelado";
    else if (providerStatus === "declined") signatureStatus = "recusado";
    else if (hasSignatureRequest || providerStatus === "pending") signatureStatus = "pendente";

    result.assinatura = {
        status: signatureStatus,
        assinado: signed,
        link: proposal.plugsignSigningUrl || null,
        assinadoEm: serializeValue(proposal.plugsignSignedAt || proposal.clicksignSignedAt || null),
        statusProvedor: providerStatus || null,
    };

    return result;
}

async function handle(request: NextRequest, cpfInput: unknown) {
    const authentication = authenticate(request);
    if (authentication === "not_configured") {
        console.error("[Proposal API] PROPOSAL_API_KEY/XAPIKEY is not configured.");
        return json({ success: false, error: "API indisponível: autenticação não configurada." }, 503);
    }
    if (authentication === "unauthorized") {
        return json({ success: false, error: "Não autorizado." }, 401);
    }

    const cpf = onlyDigits(cpfInput);
    if (!isValidCpf(cpf)) {
        return json({ success: false, error: "CPF inválido." }, 400);
    }

    try {
        const proposalDocument = await findProposalByCpf(cpf);
        if (!proposalDocument) {
            return json({ success: false, error: "Proposta não encontrada." }, 404);
        }

        return json({
            success: true,
            data: publicProposal(proposalDocument.id, proposalDocument.data()),
        });
    } catch (error) {
        console.error("[Proposal API] Failed to query proposal:", error);
        return json({ success: false, error: "Erro interno ao consultar a proposta." }, 500);
    }
}

export async function GET(request: NextRequest) {
    return handle(request, request.nextUrl.searchParams.get("cpf"));
}

export async function POST(request: NextRequest) {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
        return json({ success: false, error: "Corpo JSON inválido." }, 400);
    }

    return handle(request, (body as { cpf?: unknown }).cpf);
}
