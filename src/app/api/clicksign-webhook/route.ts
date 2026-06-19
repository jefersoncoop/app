import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin';
import { syncProposalWithCRM } from '@/actions/document-actions';

/**
 * ClickSign Webhook Handler
 *
 * Receives POST events from ClickSign when envelope status changes.
 * Automatically marks proposals as signed in Firestore when the envelope closes.
 *
 * Setup: Register this URL in the ClickSign dashboard:
 *   https://app.clicksign.com > Configurações > Webhooks > Nova Integração
 *   URL: https://<seu-dominio>/api/clicksign-webhook?secret=<CLICKSIGN_WEBHOOK_SECRET>
 *   Events: envelope.closed (or "Envelope Finalizado")
 */

const SIGNED_STATUSES = new Set(['closed', 'completed', 'finalized']);

const SIGNED_EVENTS = new Set([
    'auto_close',
    'close',
    'document.closed',
    'document_closed',
    'envelope.closed',
    'envelope.completed',
    'envelope.finalized',
    'envelope_closed',
    'envelope_completed',
    'envelope_finalized',
]);

function normalizeWebhookValue(value: unknown): string {
    return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function firstString(...values: unknown[]): string {
    for (const value of values) {
        if (typeof value === 'string' && value.trim()) {
            return value.trim();
        }
    }

    return '';
}

export async function POST(req: NextRequest) {
    try {
        // ── 1. Verify secret token ────────────────────────────────────────
        const secret = req.nextUrl.searchParams.get('secret')
            ?? req.headers.get('x-clicksign-secret')
            ?? req.headers.get('x-webhook-secret');

        const expectedSecret = process.env.CLICKSIGN_WEBHOOK_SECRET;

        if (expectedSecret && secret !== expectedSecret) {
            console.warn('[Webhook ClickSign] Unauthorized call — wrong secret');
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // ── 2. Parse body ─────────────────────────────────────────────────
        const body = await req.json().catch(() => ({}));

        console.log('[Webhook ClickSign] Received payload:', JSON.stringify(body).slice(0, 500));

        // ClickSign v3 JSON:API payload
        const eventName = normalizeWebhookValue(
            body?.data?.attributes?.name           // v3: data.attributes.name
            ?? body?.event?.name                   // webhook: event.name
            ?? body?.event                         // legacy flat
        );

        // Envelope ID: try v3 first, then legacy
        const envelopeId = firstString(
            body?.data?.attributes?.data?.envelope?.id,   // v3 nested
            body?.data?.relationships?.envelope?.data?.id,
            body?.event?.data?.envelope?.id,
            body?.envelope?.id                            // legacy
        );

        const documentId = firstString(
            body?.data?.attributes?.data?.document?.id,
            body?.data?.relationships?.document?.data?.id,
            body?.event?.data?.document?.id,
            body?.document?.key,
            body?.document?.id
        );

        // Envelope status
        const envelopeStatus = normalizeWebhookValue(
            body?.data?.attributes?.data?.envelope?.status
            ?? body?.event?.data?.envelope?.status
            ?? body?.envelope?.status
            ?? body?.status
        );

        console.log(`[Webhook ClickSign] event="${eventName}" envelopeId="${envelopeId}" documentId="${documentId}" status="${envelopeStatus}"`);

        // ── 3. Determine if envelope is signed ────────────────────────────
        const isSigned =
            SIGNED_EVENTS.has(eventName) ||
            SIGNED_STATUSES.has(envelopeStatus);

        if (!isSigned) {
            console.log(`[Webhook ClickSign] Ignoring non-final event: ${eventName} / ${envelopeStatus}`);
            return NextResponse.json({ received: true, action: 'ignored' });
        }

        if (!envelopeId && !documentId) {
            console.warn('[Webhook ClickSign] Could not determine envelopeId or documentId from payload');
            return NextResponse.json({ received: true, action: 'no_clicksign_id' });
        }

        // ── 4. Update Firestore ───────────────────────────────────────────
        const db = getAdminDb();
        const lookupCandidates = [
            { field: 'clicksignEnvelopeId', value: envelopeId },
            { field: 'clicksignDocumentId', value: documentId },
        ].filter((candidate) => candidate.value);

        let snap: FirebaseFirestore.QuerySnapshot | null = null;
        let lookupField = '';
        let lookupValue = '';

        for (const candidate of lookupCandidates) {
            const candidateSnap = await db.collection('proposals')
                .where(candidate.field, '==', candidate.value)
                .limit(1)
                .get();

            if (!candidateSnap.empty) {
                snap = candidateSnap;
                lookupField = candidate.field;
                lookupValue = candidate.value;
                break;
            }
        }

        if (!snap || snap.empty) {
            console.warn(`[Webhook ClickSign] No proposal found for envelope ${envelopeId || '(none)'} / document ${documentId || '(none)'}`);
            return NextResponse.json({ received: true, action: 'proposal_not_found' });
        }

        const doc = snap.docs[0];
        const proposal = doc.data();
        const currentClicksignStatus = proposal.clicksignStatus;
        const alreadySyncedWithCRM = proposal.crmSynced === true || proposal.status === 'completed';

        const signedAt = firstString(
            body?.document?.finished_at,
            body?.event?.occurred_at,
            body?.data?.attributes?.occurred_at,
            body?.data?.attributes?.data?.document?.finished_at
        ) || new Date().toISOString();

        if (currentClicksignStatus !== 'signed') {
            const signedUpdate: FirebaseFirestore.UpdateData<FirebaseFirestore.DocumentData> = {
                clicksignStatus: 'signed',
                clicksignSignedAt: signedAt,
                documentsSubmittedAt: proposal.documentsSubmittedAt || signedAt
            };

            if (proposal.status === 'pending_documents') {
                signedUpdate.status = 'documents_received';
            }

            await doc.ref.update(signedUpdate);

            console.log(`[Webhook ClickSign] Marked proposal ${doc.id} as signed (${lookupField}=${lookupValue})`);
        } else {
            console.log(`[Webhook ClickSign] Proposal ${doc.id} already marked as signed`);
        }

        if (alreadySyncedWithCRM) {
            console.log(`[Webhook ClickSign] Proposal ${doc.id} already synced with CRM - skipping CRM sync`);
            return NextResponse.json({
                received: true,
                action: currentClicksignStatus === 'signed' ? 'already_signed' : 'signed',
                crmAction: 'already_synced',
                proposalId: doc.id,
                envelopeId,
                documentId
            });
        }

        const crmResult = await syncProposalWithCRM(doc.id);

        if (!crmResult.success) {
            console.error(`[Webhook ClickSign] CRM sync failed for proposal ${doc.id}: ${crmResult.message}`);
            return NextResponse.json({
                received: true,
                action: currentClicksignStatus === 'signed' ? 'already_signed' : 'signed',
                crmAction: 'crm_sync_failed',
                crmMessage: crmResult.message,
                proposalId: doc.id,
                envelopeId,
                documentId
            });
        }

        console.log(`[Webhook ClickSign] Synced proposal ${doc.id} with CRM after signature`);

        return NextResponse.json({
            received: true,
            action: 'signed',
            crmAction: 'synced',
            proposalId: doc.id,
            envelopeId,
            documentId
        });

    } catch (error: unknown) {
        console.error('[Webhook ClickSign] Unhandled error:', error);
        // Always return 200 to prevent ClickSign from retrying indefinitely
        const message = error instanceof Error ? error.message : 'Unknown webhook error';
        return NextResponse.json({ received: true, error: message }, { status: 200 });
    }
}

// ClickSign may send HEAD or GET to validate the endpoint
export async function GET() {
    return NextResponse.json({ status: 'ok', service: 'clicksign-webhook' });
}
