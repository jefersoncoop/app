'use server';

import { getAdminDb, getAdminStorage } from "@/lib/firebase-admin";
import citiesData from "@/data/ibge-cities.json";
import sharp from 'sharp';
import convert from 'heic-convert';
import { verifyProposalSignature } from "./clicksign-actions";
import { randomUUID } from "crypto";

function getPathFromUrl(url: string): string | null {
    try {
        if (!url || !url.includes("firebasestorage.googleapis.com")) return null;
        const decodedUrl = decodeURIComponent(url);
        const parts = decodedUrl.split("/o/");
        if (parts.length < 2) return null;
        const pathPart = parts[1].split("?")[0];
        return pathPart;
    } catch (e) {
        console.error("Error parsing URL path", e);
        return null;
    }
}

export async function saveDocumentMetadata(
    proposalId: string, 
    url: string, 
    filename: string, 
    type: string,
    size?: number,
    hash?: string,
    path?: string
) {
    try {
        const db = getAdminDb();
        const docsRef = db.collection("proposals").doc(proposalId).collection("documents");

        // Delete any existing documents of this type (clean overwrites)
        const snapshot = await docsRef.where("type", "==", type).get();
        const batch = db.batch();
        const bucket = getAdminStorage().bucket();

        for (const doc of snapshot.docs) {
            const data = doc.data();
            const storagePath = data.path || getPathFromUrl(data.url);
            if (storagePath) {
                try {
                    const file = bucket.file(storagePath);
                    const [exists] = await file.exists();
                    if (exists) {
                        await file.delete();
                    }
                } catch (storageErr) {
                    console.error("Error deleting old file from Storage in saveDocumentMetadata:", storageErr);
                }
            }
            batch.delete(doc.ref);
        }
        await batch.commit();

        // Add the new document metadata
        await docsRef.add({
            url,
            filename,
            type,
            uploadedAt: new Date().toISOString(),
            size: size || 0,
            hash: hash || "",
            path: path || ""
        });
        return { success: true };
    } catch (e) {
        console.error("Error saving doc metadata", e);
        return { success: false, message: "Failed to save metadata" };
    }
}

export async function deleteDocumentMetadata(proposalId: string, docType: string) {
    try {
        const db = getAdminDb();
        const docsRef = db.collection("proposals").doc(proposalId).collection("documents");
        const snapshot = await docsRef.where("type", "==", docType).get();

        const batch = db.batch();
        const bucket = getAdminStorage().bucket();

        for (const doc of snapshot.docs) {
            const data = doc.data();
            const storagePath = data.path || getPathFromUrl(data.url);
            if (storagePath) {
                try {
                    const file = bucket.file(storagePath);
                    const [exists] = await file.exists();
                    if (exists) {
                        await file.delete();
                    }
                } catch (storageErr) {
                    console.error("Error deleting old file from Storage in deleteDocumentMetadata:", storageErr);
                }
            }
            batch.delete(doc.ref);
        }

        await batch.commit();
        return { success: true };
    } catch (e) {
        console.error("Error deleting doc metadata", e);
        return { success: false, message: "Failed to delete metadata" };
    }
}

export async function getProposalDocuments(proposalId: string) {
    try {
        const db = getAdminDb();
        const docsSnapshot = await db.collection("proposals").doc(proposalId).collection("documents").get();
        const documents = docsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        return { success: true, documents };
    } catch (e) {
        console.error("Error getting proposal docs", e);
        return { success: false, message: "Failed to get documents", documents: [] };
    }
}

export async function deleteProposalDocument(proposalId: string, docId: string, docType: string, storagePath?: string) {
    try {
        const db = getAdminDb();
        const docRef = db.collection("proposals").doc(proposalId).collection("documents").doc(docId);
        
        // Read data first for path/url
        const docSnapshot = await docRef.get();
        let finalPath = storagePath;
        
        if (docSnapshot.exists) {
            const data = docSnapshot.data() || {};
            if (!finalPath) {
                finalPath = data.path || getPathFromUrl(data.url);
            }
        }
        
        // 1. Delete from Firestore
        await docRef.delete();
        
        // 2. Delete from Firebase Storage
        if (finalPath) {
            try {
                const bucket = getAdminStorage().bucket();
                const file = bucket.file(finalPath);
                const [exists] = await file.exists();
                if (exists) {
                    await file.delete();
                }
            } catch (storageErr) {
                console.error("Error deleting from Firebase Storage in deleteProposalDocument:", storageErr);
            }
        }
        
        return { success: true };
    } catch (e) {
        console.error("Error deleting proposal document", e);
        return { success: false, message: e instanceof Error ? e.message : "Erro ao deletar documento" };
    }
}


/**
 * Internal logic for CRM synchronization
 */
async function performSyncWithCRM(proposalId: string, forceSync = false) {
    const lockId = randomUUID();
    let lockAcquired = false;
    let lockedDocRef: FirebaseFirestore.DocumentReference | null = null;

    try {
        const db = getAdminDb();
        const docRef = db.collection("proposals").doc(proposalId);
        lockedDocRef = docRef;

        const lockResult = await db.runTransaction(async (transaction) => {
            const doc = await transaction.get(docRef);
            if (!doc.exists) {
                return { success: false as const, message: "Proposta não encontrada." };
            }

            const data = doc.data() || {};
            // Automatic flows must remain idempotent. An explicit manual sync,
            // however, is also the recovery path for records incorrectly marked
            // as synced even though they never reached the CRM.
            if (!forceSync && (data.crmSynced === true || data.status === "completed")) {
                return { success: true as const, skip: true as const, message: "Proposta já sincronizada com o CRM.", proposalData: data };
            }

            const startedAt = data.crmSyncStartedAt ? Date.parse(data.crmSyncStartedAt) : 0;
            const lockIsFresh = data.crmSyncInProgress === true && startedAt && Date.now() - startedAt < 15 * 60 * 1000;
            if (lockIsFresh) {
                return { success: true as const, skip: true as const, message: "Sincronização com CRM já está em andamento.", proposalData: data };
            }

            transaction.update(docRef, {
                status: "crm_syncing",
                crmSyncInProgress: true,
                crmSyncStartedAt: new Date().toISOString(),
                crmSyncLockId: lockId,
                crmSyncError: null
            });

            return { success: true as const, skip: false as const, proposalData: data };
        });

        if (!lockResult.success) return lockResult;
        if (lockResult.skip) return { success: true, message: lockResult.message };

        lockAcquired = true;
        const proposalData = lockResult.proposalData || {};
        const docsSnapshot = await docRef.collection("documents").get();
        const documents = docsSnapshot.docs.map(d => ({ ...d.data(), id: d.id } as any));

        const clearSyncLock = async (message: string) => {
            await docRef.update({
                status: "crm_sync_failed",
                crmSyncInProgress: false,
                crmSyncFinishedAt: new Date().toISOString(),
                crmSyncError: message
            });
        };

        const telefone = proposalData.telefone || "";
        const phoneDigits = telefone.replace(/\D/g, '');
        const formattedPhone = phoneDigits.startsWith('55') && phoneDigits.length > 11 ? phoneDigits : `55${phoneDigits}`;

        const codMunic = await getIBGECode(proposalData.estado, proposalData.cidade);
        const formData = new FormData();

        // Fetch dynamic clientId from Campaign if available
        let finalClientId = proposalData.clientId || "";
        if (proposalData.campaignId && proposalData.campaignId !== 'uncategorized') {
            try {
                const campDoc = await db.collection("campaigns").doc(proposalData.campaignId).get();
                if (campDoc.exists) {
                    const campData = campDoc.data();
                    if (campData?.clientId) {
                        finalClientId = campData.clientId;
                        console.log(`Using clientId from Campaign: ${finalClientId}`);
                    }
                }
            } catch (e) {
                console.error("Error fetching campaign for clientId:", e);
            }
        }

        formData.append("Name", proposalData.nomeCompleto || "");
        formData.append("Identification", proposalData.cpf?.replace(/\D/g, '') || "");
        formData.append("Email", proposalData.email || "nao_coletado@gmail.com");
        formData.append("Telephone", phoneDigits);
        formData.append("CellPhone", phoneDigits);
        const gender = mapGender(proposalData.sexo || "");
        if (gender) formData.append("Gender", gender);
        formData.append("MaritalStatus", mapMaritalStatus(proposalData.estadoCivil || ""));
        formData.append("RaceColor", proposalData.corRaca || "Branca");
        formData.append("Nationality", "BRASILEIRO");
        const birthDateRaw = proposalData.dataNascimento || "";
        let birthDateFormatted = new Date().toISOString();
        if (birthDateRaw.includes('/')) {
            const parts = birthDateRaw.split('/');
            if (parts.length === 3) {
                // Return strictly YYYY-MM-DD for the CRM
                birthDateFormatted = `${parts[2]}-${parts[1]}-${parts[0]}`;
            }
        }
        formData.append("BirthDate", birthDateFormatted);
        formData.append("BirthCity", proposalData.naturalidadeMunicipio || "nao coletado");
        formData.append("BirthState", proposalData.naturalidadeEstado || "nao coletado");
        formData.append("MotherName", proposalData.nomeMae || "nao coletado");
        formData.append("FatherName", "nao coletado");
        formData.append("ESocialBirthCountry", "105");
        formData.append("ESocialNationalityCountry", "105");

        formData.append("Address.CEP", proposalData.cep?.replace(/\D/g, '') || "");
        formData.append("Address.State", proposalData.estado || "");
        formData.append("Address.City", proposalData.cidade || "");
        formData.append("Address.CodMunic", codMunic);
        formData.append("Address.Neighborhood", proposalData.bairro || "nao coletado");
        formData.append("Address.StreetName", proposalData.logradouroNome || "nao coletado");
        const houseNumber = String(proposalData.numero || "S/N").trim();
        formData.append("Address.HouseNumber", /^sem\s*n[uú]mero$/i.test(houseNumber) ? "S/N" : houseNumber.slice(0, 10));
        formData.append("Address.TpLograd", proposalData.logradouroTipo || "Rua");
        formData.append("Address.Complement", proposalData.complemento || "nao coletado");

        formData.append("Address.CountryResid", "");

        formData.append("Documents.RG", proposalData.rg || "");
        formData.append("Documents.rgIssuer", proposalData.orgaoExpedidor || "SSP");
        formData.append("Documents.rgState", proposalData.estadoExpedidor || proposalData.estado || "");
        formData.append("Documents.rgCreatedTime", new Date().toISOString());
        formData.append("Documents.PISPASEP", proposalData.pis?.replace(/\D/g, '') || "nao coletado");

        formData.append("ProfessionalInformation.ProfessionalCategory", "ADMINISTRACAO");
        formData.append("ProfessionalInformation.Profession", proposalData.cargo || proposalData.categoriaFuncao || "nao coletado");
        formData.append("ProfessionalInformation.EducationalLevel", mapEducation(proposalData.escolaridade || ""));

        formData.append("BankAccount.Bank", "000");
        formData.append(
            "BankAccount.ShortName",
            (proposalData.nomeCompleto || "").trim().split(/\s+/)[0] || ""
        );
        formData.append("BankAccount.AccountType", "C");
        formData.append("BankAccount.Agency", "00000");
        formData.append("BankAccount.Account", "00000");
        formData.append("BankAccount.Digit", "0");

        if (finalClientId && finalClientId !== "0" && finalClientId !== "00") {
            formData.append("ContractId", finalClientId);
        }
        formData.append("AdmissionDate", new Date().toISOString());
        formData.append("CotaParte", "10");
        formData.append("IsAdmPublic", "false");
        formData.append("ProductivitySelection", "nao coletado");
        const fileMapping: Record<string, string> = {
            "identidade_frente": "Files.DocIdentidadeCpfLink",
            "identidade_verso": "Files.DocIdentidadeCpfLinkBack",
            "cnh": "Files.CnhLink",
            "comprovante_residencia": "Files.ComprovanteDeResidenciaLink",
            "comprovante_pis": "Files.NumeroPisPasepNisLink",
            "certidao": "Files.CertidaoDeNascimentoOuCasamentoLink",
            "certidao_antecedentes_criminais": "Files.CertidaoDeAntecedentesCriminaisLink",
            "curriculo": "Files.CurriculoVitaeLink",
            "diploma": "Files.DiplomaDeGraduacaoLink"
        };
        const skippedFileTypes: string[] = [];

        for (const doc of documents) {
            const crmField = fileMapping[doc.type as string];
            if (crmField && doc.url) {
                let blob = await downloadFileAsBlob(doc.url);
                if (blob) {
                    const detectedType = await detectCrmFileType(blob);
                    if (!detectedType) {
                        console.warn(`Skipping unsupported CRM attachment type: ${doc.type} (${blob.type || 'unknown MIME'})`);
                        skippedFileTypes.push(String(doc.type));
                        continue;
                    }

                    const isHeic = detectedType === 'heic';

                    // Convert images (including HEIC) to JPG
                    if (detectedType !== 'pdf') {
                        try {
                            let buffer = Buffer.from(await blob.arrayBuffer());

                            // If HEIC, convert to JPG buffer first using heic-convert
                            if (isHeic) {
                                try {
                                    console.log(`HEIC detected for ${doc.type}, converting with heic-convert first...`);
                                    const inputBuffer = buffer; // Use the buffer already created
                                    const outputBuffer = await convert({

                                        buffer: inputBuffer.buffer.slice(inputBuffer.byteOffset, inputBuffer.byteOffset + inputBuffer.byteLength),
                                        format: 'JPEG',
                                        quality: 1
                                    });
                                    buffer = Buffer.from(outputBuffer);
                                } catch (heicError) {
                                    console.error(`heic-convert error for ${doc.type}:`, heicError);
                                    // continue to sharp, maybe it works or fails gracefully
                                }
                            }

                            const compressedBuffer = await sharp(buffer)
                                .resize({ width: 1000, withoutEnlargement: true })
                                .jpeg({ quality: 60, mozjpeg: true })
                                .toBuffer();

                            console.log(`Converted/Compressed ${doc.type}: ${blob.size} -> ${compressedBuffer.length}`);
                            blob = new Blob([new Uint8Array(compressedBuffer)], { type: 'image/jpeg' });
                        } catch (sharpError) {
                            console.error(`Error processing image ${doc.type}:`, sharpError);
                            skippedFileTypes.push(String(doc.type));
                            continue;
                        }
                    } else if (blob.type !== 'application/pdf') {
                        blob = new Blob([new Uint8Array(await blob.arrayBuffer())], { type: 'application/pdf' });
                    }

                    if (blob.size > 10 * 1024 * 1024) {
                        console.warn(`Skipping CRM attachment larger than 10MB: ${doc.type}`);
                        skippedFileTypes.push(String(doc.type));
                        continue;
                    }

                    // The CRM validates the extension from the multipart filename.
                    // Stored legacy names are often missing or contain text after the
                    // extension, so always send a deterministic valid name.
                    const extension = detectedType === 'pdf' ? 'pdf' : 'jpg';
                    const filename = `document_${sanitizeFilenamePart(String(doc.type))}.${extension}`;
                    formData.append(crmField, blob, filename);
                }
            }
        }

        const requiredFileFields = ["Files.DocIdentidadeCpfLink", "Files.ComprovanteDeResidenciaLink"];
        for (const field of requiredFileFields) {
            if (!formData.has(field)) {
                formData.append(field, new Blob([], { type: 'application/pdf' }), "vazio_obrigatorio.pdf");
            }
        }

        // DEBUG: Logging payload (keys and total size)
        const payloadKeys = Array.from((formData as any).keys());
        let totalSize = 0;
        for (const [key, value] of (formData as any).entries()) {
            if (value instanceof Blob) {
                totalSize += value.size;
                console.log(`Document [${key}]: ${(value.size / 1024).toFixed(1)} KB`);
            } else if (typeof value === 'string') {
                totalSize += value.length;
            }
        }

        const totalMB = totalSize / 1024 / 1024;
        console.log("CRM Sync Payload Keys:", payloadKeys);
        console.log(`CRM Sync Total Appx Size: ${totalMB.toFixed(2)} MB`);

        // Safety check to avoid CRM failure (30MB limit)
        if (totalMB > 29) {
            console.error(`CRITICAL: Payload too large for CRM (${totalMB.toFixed(2)} MB)`);
            const message = `Os arquivos combinados são muito grandes (${totalMB.toFixed(2)} MB). O limite é 30MB. Por favor, tente reduzir o tamanho dos PDFs.`;
            await clearSyncLock(message);
            return {
                success: false,
                message
            };
        }

        // Automatic sync obeys the campaign setting. Explicit actions from the
        // admin UI use forceSync so a campaign in manual mode can still be sent.
        let syncEnabled = true;
        if (!forceSync && proposalData.campaignId && proposalData.campaignId !== 'uncategorized') {
            try {
                const campDoc = await db.collection("campaigns").doc(proposalData.campaignId).get();
                if (campDoc.exists) {
                    const campData = campDoc.data();
                    if (campData?.syncCRM === false) {
                        syncEnabled = false;
                        console.log(`CRM Sync DISABLED for campaign: ${proposalData.campaignId}`);
                    }
                }
            } catch (e) {
                console.error("Error checking syncCRM status:", e);
            }
        }

        if (!syncEnabled) {
            // Mark as completed but skip external call
            await docRef.update({
                status: "completed",
                crmSynced: false, // Explicitly false as it was skipped
                crmSyncedAt: null,
                completedAt: new Date().toISOString(),
                crmSyncInProgress: false,
                crmSyncFinishedAt: new Date().toISOString(),
                crmSyncError: null
            });
            return { success: true, message: "Envio concluído (Sincronização manual selecionada)" };
        }

        const crmResponse = await fetch("https://core.coopedu.app.br/api/GuestCooperativeUser/external-create", {
            method: "POST",
            headers: {
                "accept": "text/plain",
                "X-API-KEY": process.env.XAPIKEY || ""
            },
            body: formData,
        });

        if (!crmResponse.ok) {
            const txt = await crmResponse.text();
            console.error(`CRM Sync Error (${crmResponse.status}):`, txt);

            // If it's a 400 or 500, the body might contain JSON with details
            try {
                const json = JSON.parse(txt);
                console.error("CRM Error Details (JSON):", json);
            } catch (e) {
                // ignore if not json
            }

            const message = `Erro no CRM (${crmResponse.status}): ${txt}`;
            await clearSyncLock(message);
            return { success: false, message };
        } else {
            // SUCCESS: Mark as synchronized and completed in Firestore
            await docRef.update({
                status: "completed",
                crmSynced: true,
                crmSyncedAt: new Date().toISOString(),
                completedAt: new Date().toISOString(),
                crmSyncInProgress: false,
                crmSyncFinishedAt: new Date().toISOString(),
                crmSyncError: null,
                crmSyncWarnings: skippedFileTypes.length > 0
                    ? [`Anexos ignorados por formato ou tamanho incompatível: ${Array.from(new Set(skippedFileTypes)).join(', ')}`]
                    : []
            });
            return {
                success: true,
                message: skippedFileTypes.length > 0
                    ? `Sincronizado com sucesso. Alguns anexos incompatíveis foram ignorados: ${Array.from(new Set(skippedFileTypes)).join(', ')}.`
                    : "Sincronizado com sucesso"
            };
        }
    } catch (error) {
        console.error("CRM Sync Failed:", error);
        if (lockAcquired && lockedDocRef) {
            try {
                await lockedDocRef.update({
                    crmSyncInProgress: false,
                    crmSyncFinishedAt: new Date().toISOString(),
                    crmSyncError: error instanceof Error ? error.message : "Erro desconhecido"
                });
            } catch (unlockError) {
                console.error("Failed to clear CRM sync lock:", unlockError);
            }
        }
        return { success: false, message: error instanceof Error ? error.message : "Erro desconhecido" };
    }
}

export async function syncProposalWithCRM(proposalId: string, forceSync = false) {
    return await performSyncWithCRM(proposalId, forceSync);
}

export async function batchSyncProposalsWithCRM(campaignId: string) {
    try {
        const db = getAdminDb();
        const snapshot = await db.collection("proposals")
            .where("campaignId", "==", campaignId)
            .get();

        if (snapshot.empty) return { success: false, message: "Nenhuma proposta encontrada para esta campanha." };

        let successCount = 0;
        let failCount = 0;
        const errors = [];

        for (const doc of snapshot.docs) {
            const data = doc.data();
            // Only retry completed proposals that were explicitly marked as
            // not synced. Older records may not have the crmSynced field.
            if (data.crmSynced === true || (data.status === "completed" && data.crmSynced !== false)) {
                continue;
            }

            // Small delay to avoid hitting CRM rate limits too hard if any
            await new Promise(resolve => setTimeout(resolve, 500));

            const res = await performSyncWithCRM(doc.id, true);
            if (res.success) {
                successCount++;
            } else {
                failCount++;
                errors.push({ id: doc.id, name: data.nomeCompleto || "Sem Nome", error: res.message });
            }
        }

        return {
            success: true,
            message: `Sincronização em lote finalizada.`,
            successCount,
            failCount,
            errors
        };
    } catch (error) {
        console.error("Batch CRM Sync Failed:", error);
        return { success: false, message: error instanceof Error ? error.message : "Erro desconhecido" };
    }
}

export async function finalizeUploads(proposalId: string) {
    try {
        const db = getAdminDb();
        const docRef = db.collection("proposals").doc(proposalId);
        const docSnapshot = await docRef.get();
        if (!docSnapshot.exists) return { success: false, message: "Proposta não encontrada." };

        const proposalData = docSnapshot.data() || {};
        const nomeCompleto = proposalData.nomeCompleto || "Nome não informado";
        const telefone = proposalData.telefone || "";

        if (proposalData.crmSynced === true || proposalData.status === "completed") {
            return { success: true, message: "Documentos já sincronizados com o CRM." };
        }

        // Fetch Campaign to know the formType
        let formType = 'coopedu';
        if (proposalData.campaignId && proposalData.campaignId !== 'uncategorized') {
            const campDoc = await db.collection("campaigns").doc(proposalData.campaignId).get();
            if (campDoc.exists) {
                formType = campDoc.data()?.formType || 'coopedu';
            }
        }

        const documentsSnapshot = await docRef.collection("documents").get();
        const uploadedTypes = new Set(documentsSnapshot.docs.map(doc => doc.data().type));
        const isCooperaForm = formType === 'coopera' || formType === 'coopera_cadastro_reserva';
        const requiredDocumentTypes = isCooperaForm
            ? ["identidade_frente", "identidade_verso", "comprovante_pis", "comprovante_residencia", "certidao_antecedentes_criminais"]
            : ["identidade_frente", "identidade_verso", "comprovante_pis", "comprovante_residencia"];
        const missingDocument = requiredDocumentTypes.find(type => !uploadedTypes.has(type));

        if (missingDocument) {
            return {
                success: false,
                message: "Envie todos os documentos obrigatórios antes de finalizar."
            };
        }

        // Enforce Plugsign signature for standard multi-step forms
        if (formType === 'coopedu' || isCooperaForm) {
            const isSigned = await verifyProposalSignature(proposalId);
            if (!isSigned) {
                return {
                    success: false,
                    message: "A assinatura da proposta via Plugsign é obrigatória para finalizar o envio dos documentos."
                };
            }
        }

        const crmSyncStartedAt = proposalData.crmSyncStartedAt ? Date.parse(proposalData.crmSyncStartedAt) : 0;
        const crmSyncLockIsFresh = proposalData.crmSyncInProgress === true && crmSyncStartedAt && Date.now() - crmSyncStartedAt < 15 * 60 * 1000;
        if (crmSyncLockIsFresh) {
            return { success: true, message: "Documentos recebidos. Sincronização com CRM já está em andamento." };
        }

        const finalStatus = (formType === 'coopedu' || isCooperaForm) ? "signed" : "documents_received";
        await docRef.update({
            status: finalStatus,
            documentsSubmittedAt: proposalData.documentsSubmittedAt || new Date().toISOString(),
        });

        const phoneDigits = telefone.replace(/\D/g, '');
        const formattedPhone = phoneDigits.startsWith('55') && phoneDigits.length > 11 ? phoneDigits : `55${phoneDigits}`;
        const payload = { nome: nomeCompleto, numero: formattedPhone };

        // Handle notification - disabled as requested
        /*
        notifyFinalExternalService(payload).then(async result => {
            await docRef.collection("notifications").add({
                type: "final",
                status: result.success ? "success" : "error",
                timestamp: new Date().toISOString(),
                error: result.message || null,
                payload
            });
        }).catch(e => console.error("Notification trigger error:", e));
        */

        return { success: true };
    } catch (e) {
        console.error("Error finalizing uploads", e);
        return { success: false, message: "Failed to update status" };
    }
}

export async function resendFinalNotification(proposalId: string) {
    try {
        const db = getAdminDb();
        const docRef = db.collection("proposals").doc(proposalId);
        const doc = await docRef.get();

        if (!doc.exists) return { success: false, message: "Proposta não encontrada" };
        const data = doc.data()!;

        const phoneDigits = (data.telefone || "").replace(/\D/g, '');
        const formattedPhone = phoneDigits.startsWith('55') && phoneDigits.length > 11 ? phoneDigits : `55${phoneDigits}`;

        const payload = { nome: data.nomeCompleto, numero: formattedPhone };
        const result = await notifyFinalExternalService(payload);

        await docRef.collection("notifications").add({
            type: "final",
            status: result.success ? "success" : "error",
            timestamp: new Date().toISOString(),
            error: result.message || null,
            payload
        });

        return result;
    } catch (e) {
        console.error("Error resending final notification:", e);
        return { success: false, message: "Erro interno ao reenviar" };
    }
}

// Helpers

async function getIBGECode(uf: string, cityName: string): Promise<string> {
    try {
        const normalizedCity = cityName.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const key = `${uf?.toUpperCase()}-${normalizedCity}`;
        const code = (citiesData as Record<string, string>)[key];
        return code || "0000000";
    } catch (e) {
        return "0000000";
    }
}

async function downloadFileAsBlob(url: string): Promise<Blob | null> {
    try {
        const response = await fetch(url);
        if (!response.ok) return null;
        return await response.blob();
    } catch (e) {
        return null;
    }
}

type CrmFileType = 'pdf' | 'jpeg' | 'png' | 'webp' | 'heic';

async function detectCrmFileType(blob: Blob): Promise<CrmFileType | null> {
    const mime = blob.type.toLowerCase();
    if (mime === 'application/pdf') return 'pdf';
    if (mime === 'image/jpeg' || mime === 'image/jpg') return 'jpeg';
    if (mime === 'image/png') return 'png';
    if (mime === 'image/webp') return 'webp';
    if (mime === 'image/heic' || mime === 'image/heif') return 'heic';

    // Firebase metadata from older uploads may have an empty/generic MIME type.
    const bytes = new Uint8Array(await blob.slice(0, 16).arrayBuffer());
    const ascii = String.fromCharCode(...bytes);
    if (ascii.startsWith('%PDF-')) return 'pdf';
    if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpeg';
    if (bytes[0] === 0x89 && ascii.slice(1, 4) === 'PNG') return 'png';
    if (ascii.slice(0, 4) === 'RIFF' && ascii.slice(8, 12) === 'WEBP') return 'webp';
    if (ascii.slice(4, 8) === 'ftyp' && /hei[cxf]|mif1/.test(ascii.slice(8, 16))) return 'heic';
    return null;
}

function sanitizeFilenamePart(value: string): string {
    return value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9_-]/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_+|_+$/g, '') || 'arquivo';
}

async function notifyFinalExternalService(payload: { nome: string, numero: string }) {
    try {
        const response = await fetch("https://webatende.coopedu.com.br:3000/api/external/fimroadmap", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });
        if (!response.ok) {
            const errorText = await response.text();
            return { success: false, message: errorText };
        }
        return { success: true };
    } catch (e) {
        return { success: false, message: e instanceof Error ? e.message : "Erro de conexão" };
    }
}

function mapGender(val: string): string | null {
    const v = val.toUpperCase();
    if (v.includes("MASC")) return "MASCULINO";
    if (v.includes("FEMI")) return "FEMININO";
    // The CRM currently rejects "OUTRO". Omitting the optional field is safer
    // than sending a value outside its enum.
    return null;
}

function mapMaritalStatus(val: string): string {
    const v = val.toUpperCase();
    if (v.includes("SOLT")) return "SOLTEIRO";
    if (v.includes("CASA")) return "CASADO";
    if (v.includes("DIVOR")) return "DIVORCIADO";
    if (v.includes("VIUV")) return "VIUVO";
    if (v.includes("UNIAO")) return "UNIAO_ESTAVEL";
    return "SOLTEIRO";
}

function mapEducation(val: string): string {
    const v = val.toUpperCase();
    if (v.includes("SEM ESCOLARIDADE") || v.includes("ANALFABETO")) return "ANALFABETO";
    if (v.includes("FUNDAMENTAL INCOMPLETO")) return "ATE_5_ANO_INCOMPLETO";
    if (v.includes("FUNDAMENTAL COMPLETO")) return "FUNDAMENTAL_COMPLETO";
    if (v.includes("MEDIO INCOMPLETO")) return "MEDIO_INCOMPLETO";
    if (v.includes("MEDIO COMPLETO")) return "MEDIO_COMPLETO";
    if (v.includes("SUPERIOR INCOMPLETO")) return "SUPERIOR_INCOMPLETO";
    if (v.includes("SUPERIOR COMPLETO")) return "SUPERIOR_COMPLETO";
    if (v.includes("ESPECIALIZACAO")) return "POS_GRADUACAO";
    if (v.includes("MESTRADO")) return "MESTRADO";
    if (v.includes("DOUTORADO")) return "DOUTORADO";
    return "ANALFABETO";
}
