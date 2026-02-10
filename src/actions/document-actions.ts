'use server';

import { getAdminDb } from "@/lib/firebase-admin";
import citiesData from "@/data/ibge-cities.json";

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

        return { success: true };
    } catch (e) {
        console.error("Error saving doc metadata", e);
        return { success: false, message: "Failed to save metadata" };
    }
}

/**
 * Helper to fetch IBGE code for a city from local data
 */
async function getIBGECode(uf: string, cityName: string): Promise<string> {
    try {
        const normalizedCity = cityName.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const key = `${uf?.toUpperCase()}-${normalizedCity}`;
        const code = (citiesData as Record<string, string>)[key];

        if (code) {
            console.log(`Local IBGE Lookup: ${key} -> ${code}`);
            return code;
        }

        console.warn(`IBGE Code not found locally for: ${key}`);
        return "0000000";
    } catch (e) {
        console.error("Error with local IBGE code lookup:", e);
        return "0000000";
    }
}

/**
 * Helper to download file from URL as Blob/File
 */
async function downloadFileAsBlob(url: string): Promise<Blob | null> {
    try {
        const response = await fetch(url);
        if (!response.ok) return null;
        return await response.blob();
    } catch (e) {
        console.error("Error downloading file:", e);
        return null;
    }
}

function mapGender(val: string): string {
    const v = val.toUpperCase();
    if (v.includes("MASC")) return "MASCULINO";
    if (v.includes("FEMI")) return "FEMININO";
    return "OUTRO";
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

export async function syncProposalWithCRM(proposalId: string) {
    try {
        const db = getAdminDb();
        const docRef = db.collection("proposals").doc(proposalId);

        // 1. Fetch proposal data
        const doc = await docRef.get();
        if (!doc.exists) return { success: false, message: "Proposta não encontrada." };

        const proposalData = doc.data() || {};
        const nomeCompleto = proposalData.nomeCompleto || "Nome não informado";
        const telefone = proposalData.telefone || "";

        // 2. Fetch documents
        const docsSnapshot = await docRef.collection("documents").get();
        const documents = docsSnapshot.docs.map(d => ({ ...d.data(), id: d.id } as any));

        const phoneDigits = telefone.replace(/\D/g, '');
        const formattedPhone = phoneDigits.startsWith('55') && phoneDigits.length > 11 ? phoneDigits : `55${phoneDigits}`;

        console.log(`Synchronizing proposal ${proposalId} (${nomeCompleto}) with CRM...`);

        const codMunic = await getIBGECode(proposalData.estado, proposalData.cidade);
        const formData = new FormData();

        // Personal & Identification
        formData.append("Name", nomeCompleto);
        formData.append("Identification", proposalData.cpf?.replace(/\D/g, '') || "");
        formData.append("Email", proposalData.email || "nao_coletado@gmail.com");
        formData.append("Telephone", formattedPhone);
        formData.append("CellPhone", formattedPhone);
        formData.append("Gender", mapGender(proposalData.sexo || ""));
        formData.append("MaritalStatus", mapMaritalStatus(proposalData.estadoCivil || ""));
        formData.append("RaceColor", proposalData.corRaca || "Branca");
        formData.append("Nationality", proposalData.nacionalidade?.toUpperCase() || "BRASILEIRA");
        formData.append("BirthDate", proposalData.dataNascimento ? proposalData.dataNascimento.split('/').reverse().join('-') + "T00:00:00.000Z" : new Date().toISOString());
        formData.append("BirthCity", proposalData.naturalidadeMunicipio || "nao coletado");
        formData.append("BirthState", proposalData.naturalidadeEstado || "nao coletado");
        formData.append("MotherName", proposalData.nomeMae || "nao coletado");
        formData.append("FatherName", "nao coletado");
        formData.append("ESocialBirthCountry", "105");
        formData.append("ESocialNationalityCountry", "105");

        // Address
        formData.append("Address.CEP", proposalData.cep?.replace(/\D/g, '') || "");
        formData.append("Address.State", proposalData.estado || "");
        formData.append("Address.City", proposalData.cidade || "");
        formData.append("Address.CodMunic", codMunic);
        formData.append("Address.Neighborhood", proposalData.bairro || "nao coletado");
        formData.append("Address.StreetName", proposalData.logradouroNome || "nao coletado");
        formData.append("Address.HouseNumber", proposalData.numero || "S/N");
        formData.append("Address.TpLograd", proposalData.logradouroTipo || "Rua");
        formData.append("Address.Complement", proposalData.complemento || "nao coletado");

        // Country Residency: empty if Brazilian
        const isBrazilian = (proposalData.nacionalidade || "").toUpperCase() === "BRASILEIRO";
        formData.append("Address.CountryResid", isBrazilian ? "" : "BRASIL");

        // Documents Registry
        formData.append("Documents.RG", proposalData.rg || "nao coletado");
        formData.append("Documents.rgIssuer", proposalData.orgaoExpedidor || "SSP");
        formData.append("Documents.rgState", proposalData.estadoExpedidor || proposalData.estado || "");
        formData.append("Documents.rgCreatedTime", new Date().toISOString());
        formData.append("Documents.PISPASEP", proposalData.pis?.replace(/\D/g, '') || "nao coletado");

        // Professional
        formData.append("ProfessionalInformation.ProfessionalCategory", "ADMINISTRACAO");
        formData.append("ProfessionalInformation.Profession", proposalData.cargo || proposalData.categoriaFuncao || "nao coletado");
        formData.append("ProfessionalInformation.EducationalLevel", mapEducation(proposalData.escolaridade || ""));

        // Banking
        formData.append("BankAccount.Bank", proposalData.banco || "nao coletado");
        formData.append("BankAccount.ShortName", proposalData.banco || "nao coletado");
        formData.append("BankAccount.AccountType", proposalData.tipoConta || "CORRENTE");
        formData.append("BankAccount.Agency", proposalData.agencia || "00000");
        formData.append("BankAccount.Account", proposalData.conta || "00000");
        formData.append("BankAccount.Digit", proposalData.contaDigito || "0");

        // Others
        formData.append("ContractId", proposalData.clientId || "");
        formData.append("AdmissionDate", new Date().toISOString());
        formData.append("CotaParte", "10");
        formData.append("IsAdmPublic", "false");
        formData.append("ProductivitySelection", "nao coletado");

        // Files (Download and Attach with correct frontend IDs)
        const fileMapping: Record<string, string> = {
            "identidade_frente": "Files.DocIdentidadeCpfLink",
            "identidade_verso": "Files.DocIdentidadeCpfLinkBack",
            "cnh": "Files.CnhLink",
            "comprovante_residencia": "Files.ComprovanteDeResidenciaLink",
            "comprovante_pis": "Files.NumeroPisPasepNisLink",
            "certidao": "Files.CertidaoDeNascimentoOuCasamentoLink",
            "curriculo": "Files.CurriculoVitaeLink",
            "diploma": "Files.DiplomaDeGraduacaoLink"
        };

        let totalSize = 0;
        for (const doc of documents) {
            const crmField = fileMapping[doc.type as string];
            if (crmField && doc.url) {
                const blob = await downloadFileAsBlob(doc.url);
                if (blob) {
                    const filename = doc.filename || `document_${doc.type}.${blob.type.split('/')[1] || 'pdf'}`;
                    console.log(`Adding file: ${filename} (${blob.size} bytes) to field ${crmField}`);
                    totalSize += blob.size;
                    formData.append(crmField, blob, filename);
                }
            }
        }

        console.log(`Estimated total payload size: ${totalSize} bytes (~${(totalSize / 1024 / 1024).toFixed(2)} MB)`);

        // Fallback for mandatory files if not present (using .pdf as extension)
        const requiredFileFields = ["Files.DocIdentidadeCpfLink", "Files.ComprovanteDeResidenciaLink"];
        for (const field of requiredFileFields) {
            if (!formData.has(field)) {
                formData.append(field, new Blob([]), "vazio_obrigatorio.pdf");
            }
        }

        // Log all text fields for debugging (except files)
        console.log("CRM Payload (Text Fields):");
        const payloadData: Record<string, string> = {};
        (formData as any).forEach((value: any, key: any) => {
            if (!(value instanceof Blob)) {
                payloadData[key] = value as string;
            }
        });
        console.log(JSON.stringify(payloadData, null, 2));

        const crmResponse = await fetch("https://core.coopedu.app.br/api/GuestCooperativeUser/external-create", {
            method: "POST",
            headers: {
                "accept": "text/plain",
                "X-API-KEY": "583ea0cb-1c5c-4a71-aae0-5a04af21ea4e"
            },
            body: formData,
        });

        console.log(`CRM Response Status: ${crmResponse.status}`);
        // Log basic headers if possible for debugging (careful with sensitive ones)
        const headers: Record<string, string> = {};
        crmResponse.headers.forEach((v, k) => { headers[k] = v; });
        console.log("CRM Response Headers:", JSON.stringify(headers));

        if (!crmResponse.ok) {
            const txt = await crmResponse.text();
            console.error(`CRM Sync Error (${crmResponse.status}):`, txt);
            const sizeMsg = crmResponse.status === 413 ? ` (Payload: ${(totalSize / 1024 / 1024).toFixed(2)} MB)` : "";
            return { success: false, message: `Erro no CRM (${crmResponse.status})${sizeMsg}: ${txt}` };
        } else {
            console.log("CRM Sync Success");
            return { success: true, message: "Sincronizado com sucesso" };
        }
    } catch (error) {
        console.error("CRM Sync Failed:", error);
        return { success: false, message: error instanceof Error ? error.message : "Erro desconhecido" };
    }
}

async function notifyFinalExternalService(payload: { nome: string, numero: string }) {
    try {
        console.log("Notifying final external service:", payload);
        const response = await fetch("https://webatende.coopedu.com.br:3000/api/external/fimroadmap", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`Final Notification Error (${response.status}):`, errorText);
            return { success: false, message: `Erro API (${response.status}): ${errorText}` };
        } else {
            console.log("Final Notification Success");
            return { success: true };
        }
    } catch (e) {
        console.error("Final Notification error:", e);
        return { success: false, message: e instanceof Error ? e.message : "Erro de conexão" };
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

export async function finalizeUploads(proposalId: string) {
    try {
        const db = getAdminDb();
        const docRef = db.collection("proposals").doc(proposalId);

        // 1. Fetch proposal data (needed for notification)
        const docSnapshot = await docRef.get();
        if (!docSnapshot.exists) return { success: false, message: "Proposta não encontrada." };
        const proposalData = docSnapshot.data() || {};
        const nomeCompleto = proposalData.nomeCompleto || "Nome não informado";
        const telefone = proposalData.telefone || "";

        // 2. Update status in Firestore
        await docRef.update({
            status: "documents_received",
            documentsSubmittedAt: new Date().toISOString(),
        });

        // 3. Trigger External Notification (WhatsApp) - Independent & Logged
        const phoneDigits = telefone.replace(/\D/g, '');
        const formattedPhone = phoneDigits.startsWith('55') && phoneDigits.length > 11 ? phoneDigits : `55${phoneDigits}`;

        console.log(`Finalizing uploads for ${nomeCompleto}. Sending notifications and triggering CRM sync...`);

        const payload = { nome: nomeCompleto, numero: formattedPhone };

        // Use a separate async block to avoid blocking the main flow
        (async () => {
            const result = await notifyFinalExternalService(payload);
            await docRef.collection("notifications").add({
                type: "final",
                status: result.success ? "success" : "error",
                timestamp: new Date().toISOString(),
                error: result.message || null,
                payload
            });
        })();

        // 4. Trigger CRM Synchronization (Async) - Independent
        syncProposalWithCRM(proposalId).catch(e => console.error("Async CRM sync error:", e));

        return { success: true };
    } catch (e) {
        console.error("Error finalizing uploads", e);
        return { success: false, message: "Failed to update status" };
    }
}
