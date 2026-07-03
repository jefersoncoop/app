import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { syncProposalWithCRM } from "@/actions/document-actions";

const SIGNED_STATUSES = new Set(["signed"]);
const SIGNED_EVENTS = new Set([
    "signed",
    "request.signed",
    "document.signed",
    "file.signed",
    "signature.signed",
    "completed",
    "finished"
]);

function normalize(value: unknown) {
    return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function firstString(...values: unknown[]) {
    for (const value of values) {
        if (typeof value === "string" && value.trim()) return value.trim();
        if (typeof value === "number") return String(value);
    }

    return "";
}

async function findProposal(candidates: Array<{ field: string; value: string }>) {
    const db = getAdminDb();

    for (const candidate of candidates.filter(c => c.value)) {
        const snap = await db.collection("proposals")
            .where(candidate.field, "==", candidate.value)
            .limit(1)
            .get();

        if (!snap.empty) {
            return {
                doc: snap.docs[0],
                field: candidate.field,
                value: candidate.value
            };
        }
    }

    return null;
}

export async function POST(req: NextRequest) {
    try {
        const secret = req.nextUrl.searchParams.get("secret")
            ?? req.headers.get("x-plugsign-secret")
            ?? req.headers.get("x-webhook-secret");

        const expectedSecret = process.env.PLUGSIGN_WEBHOOK_SECRET;

        if (expectedSecret && secret !== expectedSecret) {
            console.warn("[Webhook Plugsign] Unauthorized call - wrong secret");
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const body = await req.json().catch(() => ({}));
        console.log("[Webhook Plugsign] Received payload:", JSON.stringify(body).slice(0, 500));

        const data = body?.data || body?.request || body?.document || body;
        const eventName = normalize(
            body?.event
            ?? body?.type
            ?? body?.name
            ?? body?.data?.event
            ?? body?.data?.type
            ?? body?.data?.name
        );

        const requestStatus = normalize(
            data?.status
            ?? body?.status
            ?? body?.request?.status
            ?? body?.data?.status
        );

        const signingKey = firstString(
            data?.signing_key,
            data?.signingKey,
            body?.signing_key,
            body?.request?.signing_key,
            body?.data?.signing_key
        );

        const requestId = firstString(
            data?.id,
            data?.request_id,
            data?.requestId,
            body?.request_id,
            body?.request?.id
        );

        const documentKey = firstString(
            data?.document,
            data?.document_key,
            data?.documentKey,
            body?.document,
            body?.document_key,
            body?.request?.document
        );

        const isSigned = SIGNED_EVENTS.has(eventName) || SIGNED_STATUSES.has(requestStatus);

        if (!isSigned) {
            console.log(`[Webhook Plugsign] Ignoring non-final event: ${eventName} / ${requestStatus}`);
            return NextResponse.json({ received: true, action: "ignored" });
        }

        const found = await findProposal([
            { field: "plugsignSigningKey", value: signingKey },
            { field: "clicksignSignerId", value: signingKey },
            { field: "plugsignRequestId", value: requestId },
            { field: "clicksignEnvelopeId", value: requestId },
            { field: "plugsignDocumentKey", value: documentKey },
            { field: "clicksignDocumentId", value: documentKey }
        ]);

        if (!found) {
            console.warn(`[Webhook Plugsign] No proposal found for request ${requestId || "(none)"} / document ${documentKey || "(none)"}`);
            return NextResponse.json({ received: true, action: "proposal_not_found" });
        }

        const proposal = found.doc.data();
        const currentStatus = proposal.clicksignStatus || proposal.plugsignStatus;
        const alreadySyncedWithCRM = proposal.crmSynced === true || proposal.status === "completed";
        const signedAt = firstString(
            data?.update_time,
            data?.signed_at,
            body?.signed_at,
            body?.created_at
        ) || new Date().toISOString();

        if (currentStatus !== "signed") {
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

            await found.doc.ref.update(update);
            console.log(`[Webhook Plugsign] Marked proposal ${found.doc.id} as signed (${found.field}=${found.value})`);
        }

        if (alreadySyncedWithCRM) {
            return NextResponse.json({
                received: true,
                action: currentStatus === "signed" ? "already_signed" : "signed",
                crmAction: "already_synced",
                proposalId: found.doc.id,
                requestId,
                documentKey
            });
        }

        const crmResult = await syncProposalWithCRM(found.doc.id);

        if (!crmResult.success) {
            return NextResponse.json({
                received: true,
                action: currentStatus === "signed" ? "already_signed" : "signed",
                crmAction: "crm_sync_failed",
                crmMessage: crmResult.message,
                proposalId: found.doc.id,
                requestId,
                documentKey
            });
        }

        return NextResponse.json({
            received: true,
            action: "signed",
            crmAction: "synced",
            proposalId: found.doc.id,
            requestId,
            documentKey
        });
    } catch (error: unknown) {
        console.error("[Webhook Plugsign] Unhandled error:", error);
        const message = error instanceof Error ? error.message : "Unknown webhook error";
        return NextResponse.json({ received: true, error: message }, { status: 200 });
    }
}

export async function GET() {
    return NextResponse.json({ status: "ok", service: "plugsign-webhook" });
}
