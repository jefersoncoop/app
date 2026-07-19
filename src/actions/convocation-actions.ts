'use server';

import { randomUUID } from 'crypto';
import { cookies, headers } from 'next/headers';
import { getAdminDb } from '@/lib/firebase-admin';
import { convocationSchema, type ConvocationInput } from '@/lib/schemas/convocation-schema';

export type ConvocationStatus = 'sending' | 'sent' | 'send_failed' | 'confirmed';

export type PublicConvocation = {
    token: string;
    candidateName: string;
    jobTitle: string;
    location: string;
    status: ConvocationStatus;
    sentAt?: string | null;
    confirmedAt?: string | null;
};

type ActionResult = {
    success: boolean;
    message: string;
    convocation?: PublicConvocation;
};

function normalizePhone(phone: string) {
    const digits = String(phone || '').replace(/\D/g, '');
    if (!digits) return '';
    return digits.startsWith('55') && digits.length > 11 ? digits : `55${digits}`;
}

async function getPublicBaseUrl() {
    const configuredUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL;
    if (configuredUrl) return configuredUrl.replace(/\/$/, '');

    if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;

    const requestHeaders = await headers();
    const host = requestHeaders.get('x-forwarded-host') || requestHeaders.get('host');
    const protocol = requestHeaders.get('x-forwarded-proto') || (host?.includes('localhost') ? 'http' : 'https');
    return host ? `${protocol}://${host}` : '';
}

function toPublicConvocation(token: string, data: Record<string, unknown>): PublicConvocation {
    return {
        token,
        candidateName: String(data.candidateName || ''),
        jobTitle: String(data.jobTitle || ''),
        location: String(data.location || ''),
        status: data.status as ConvocationStatus,
        sentAt: typeof data.sentAt === 'string' ? data.sentAt : null,
        confirmedAt: typeof data.confirmedAt === 'string' ? data.confirmedAt : null,
    };
}

async function sendWhatsapp(payload: {
    nome: string;
    numero: string;
    cargo: string;
    local: string;
    link: string;
}) {
    const endpoint = process.env.CONVOCATION_WHATSAPP_ENDPOINT;
    if (!endpoint) {
        return { success: false, message: 'Configure CONVOCATION_WHATSAPP_ENDPOINT para realizar o disparo.' };
    }

    try {
        const authToken = process.env.CONVOCATION_WHATSAPP_TOKEN;
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
            },
            body: JSON.stringify(payload),
            cache: 'no-store',
        });

        if (!response.ok) {
            const body = await response.text();
            return { success: false, message: `WhatsApp API (${response.status}): ${body || response.statusText}` };
        }

        return { success: true, message: 'Convocação enviada pelo WhatsApp.' };
    } catch (error) {
        return {
            success: false,
            message: error instanceof Error ? error.message : 'Erro de conexão com a API do WhatsApp.',
        };
    }
}

export async function sendCandidateConvocation(input: ConvocationInput): Promise<ActionResult> {
    const session = (await cookies()).get('admin_session');
    if (session?.value !== 'true') return { success: false, message: 'Sessão administrativa expirada.' };

    const parsed = convocationSchema.safeParse(input);
    if (!parsed.success) {
        return { success: false, message: parsed.error.issues[0]?.message || 'Dados da convocação inválidos.' };
    }

    const db = getAdminDb();
    const proposalRef = db.collection('proposals').doc(parsed.data.proposalId);
    const proposalDoc = await proposalRef.get();
    if (!proposalDoc.exists) return { success: false, message: 'Candidato não encontrado.' };

    const proposal = proposalDoc.data() || {};
    const candidateName = String(proposal.nomeCompleto || '').trim();
    const phone = normalizePhone(String(proposal.telefone || ''));
    if (!candidateName || phone.length < 12) {
        return { success: false, message: 'O candidato não possui nome e WhatsApp válidos.' };
    }

    const baseUrl = await getPublicBaseUrl();
    if (!baseUrl) return { success: false, message: 'Configure NEXT_PUBLIC_APP_URL para gerar o link de confirmação.' };

    const token = randomUUID();
    const now = new Date().toISOString();
    const convocationRef = db.collection('convocations').doc(token);
    const confirmationLink = `convocacao/${token}`;
    const convocationData = {
        proposalId: parsed.data.proposalId,
        candidateName,
        phone,
        jobTitle: parsed.data.jobTitle,
        location: parsed.data.location,
        confirmationLink,
        status: 'sending' as ConvocationStatus,
        createdAt: now,
        updatedAt: now,
    };

    await convocationRef.set(convocationData);

    const payload = {
        nome: candidateName,
        numero: phone,
        cargo: parsed.data.jobTitle,
        local: parsed.data.location,
        link: confirmationLink,
    };
    const delivery = await sendWhatsapp(payload);
    const updatedAt = new Date().toISOString();
    const status: ConvocationStatus = delivery.success ? 'sent' : 'send_failed';
    const statusData = {
        status,
        sentAt: delivery.success ? updatedAt : null,
        sendError: delivery.success ? null : delivery.message,
        updatedAt,
    };

    await Promise.all([
        convocationRef.update(statusData),
        proposalRef.update({
            latestConvocation: {
                token,
                jobTitle: parsed.data.jobTitle,
                location: parsed.data.location,
                status,
                sentAt: statusData.sentAt,
                confirmedAt: null,
                updatedAt,
            },
        }),
        proposalRef.collection('notifications').add({
            type: 'convocation',
            status: delivery.success ? 'success' : 'error',
            timestamp: updatedAt,
            error: delivery.success ? null : delivery.message,
            payload,
        }),
    ]);

    return {
        success: delivery.success,
        message: delivery.message,
        convocation: toPublicConvocation(token, { ...convocationData, ...statusData }),
    };
}

export async function getPublicConvocation(token: string): Promise<PublicConvocation | null> {
    if (!/^[0-9a-f-]{36}$/i.test(token)) return null;

    const doc = await getAdminDb().collection('convocations').doc(token).get();
    if (!doc.exists) return null;
    return toPublicConvocation(doc.id, doc.data() || {});
}

export async function confirmCandidateAttendance(token: string): Promise<ActionResult> {
    if (!/^[0-9a-f-]{36}$/i.test(token)) {
        return { success: false, message: 'Link de confirmação inválido.' };
    }

    const db = getAdminDb();
    const convocationRef = db.collection('convocations').doc(token);

    try {
        let result: PublicConvocation | null = null;
        await db.runTransaction(async transaction => {
            const convocationDoc = await transaction.get(convocationRef);
            if (!convocationDoc.exists) throw new Error('Convocação não encontrada.');

            const data = convocationDoc.data() || {};
            const proposalRef = data.proposalId
                ? db.collection('proposals').doc(String(data.proposalId))
                : null;
            const proposalDoc = proposalRef ? await transaction.get(proposalRef) : null;
            const confirmedAt = typeof data.confirmedAt === 'string' ? data.confirmedAt : new Date().toISOString();
            result = toPublicConvocation(token, { ...data, status: 'confirmed', confirmedAt });

            if (data.status !== 'confirmed') {
                transaction.update(convocationRef, {
                    status: 'confirmed',
                    confirmedAt,
                    updatedAt: confirmedAt,
                });

                if (proposalRef && proposalDoc?.data()?.latestConvocation?.token === token) {
                    transaction.set(proposalRef, {
                        latestConvocation: {
                            token,
                            jobTitle: data.jobTitle,
                            location: data.location,
                            status: 'confirmed',
                            sentAt: data.sentAt || null,
                            confirmedAt,
                            updatedAt: confirmedAt,
                        },
                    }, { merge: true });
                }
            }
        });

        return { success: true, message: 'Comparecimento confirmado com sucesso.', convocation: result || undefined };
    } catch (error) {
        return {
            success: false,
            message: error instanceof Error ? error.message : 'Não foi possível confirmar o comparecimento.',
        };
    }
}
