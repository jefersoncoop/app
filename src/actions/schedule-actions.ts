'use server';

import { getAdminDb } from "@/lib/firebase-admin";
import { scheduleRegistrationSchema, scheduleSlotSchema, ScheduleRegistrationInput, ScheduleSlotInput } from "@/lib/schemas/schedule-schema";
import { revalidatePath } from "next/cache";
import { FieldValue } from "firebase-admin/firestore";

type ActionResult = {
    success: boolean;
    message?: string;
    errors?: unknown;
};

export type ScheduleSlot = {
    id: string;
    campaignId: string;
    location: string;
    date: string;
    time: string;
    endTime?: string;
    capacity: number;
    bookedCount?: number;
    active?: boolean;
};

export type ScheduleRegistration = {
    id: string;
    campaignId: string;
    slotId: string;
    name: string;
    cpf: string;
    phone: string;
    location: string;
    date: string;
    time: string;
    endTime?: string;
    createdAt?: string;
};

function onlyDigits(value: string) {
    return (value || '').replace(/\D/g, '');
}

function normalizePhone(phone: string) {
    const digits = onlyDigits(phone);
    return digits.startsWith('55') && digits.length > 11 ? digits : `55${digits}`;
}

function formatDate(date: string) {
    const [year, month, day] = date.split('-');
    return `${day}/${month}/${year}`;
}

export async function createScheduleSlot(data: ScheduleSlotInput): Promise<ActionResult> {
    try {
        const parsed = scheduleSlotSchema.safeParse(data);
        if (!parsed.success) {
            return { success: false, message: "Verifique os campos do horário.", errors: parsed.error.format() };
        }

        const db = getAdminDb();
        await db.collection('scheduleSlots').add({
            ...parsed.data,
            bookedCount: 0,
            createdAt: new Date().toISOString(),
        });

        revalidatePath('/admin/schedules');
        revalidatePath('/a');
        return { success: true };
    } catch (error) {
        console.error("createScheduleSlot error:", error);
        return { success: false, message: "Erro ao cadastrar horário." };
    }
}

export async function deleteScheduleSlot(slotId: string): Promise<ActionResult> {
    try {
        const db = getAdminDb();
        const slotRef = db.collection('scheduleSlots').doc(slotId);
        const slotDoc = await slotRef.get();

        if (!slotDoc.exists) return { success: false, message: "Horário não encontrado." };
        if (Number(slotDoc.data()?.bookedCount || 0) > 0) {
            return { success: false, message: "Não é possível excluir um horário que já possui inscritos." };
        }

        await slotRef.delete();
        revalidatePath('/admin/schedules');
        revalidatePath('/a');
        return { success: true };
    } catch (error) {
        console.error("deleteScheduleSlot error:", error);
        return { success: false, message: "Erro ao excluir horário." };
    }
}

export async function deleteScheduleRegistration(registrationId: string): Promise<ActionResult> {
    try {
        const db = getAdminDb();
        const registrationRef = db.collection('scheduleRegistrations').doc(registrationId);

        await db.runTransaction(async (transaction) => {
            const registrationDoc = await transaction.get(registrationRef);
            if (!registrationDoc.exists) {
                throw new Error("Agendamento não encontrado.");
            }

            const registration = registrationDoc.data() as ScheduleRegistration;
            const slotRef = db.collection('scheduleSlots').doc(registration.slotId);
            const slotDoc = await transaction.get(slotRef);

            transaction.delete(registrationRef);

            if (slotDoc.exists) {
                const bookedCount = Number(slotDoc.data()?.bookedCount || 0);
                transaction.update(slotRef, {
                    bookedCount: Math.max(bookedCount - 1, 0),
                    updatedAt: new Date().toISOString(),
                });
            }
        });

        revalidatePath('/admin/schedules');
        revalidatePath('/a');
        return { success: true };
    } catch (error) {
        console.error("deleteScheduleRegistration error:", error);
        return { success: false, message: error instanceof Error ? error.message : "Erro ao excluir agendamento." };
    }
}

export async function getScheduleDashboard(campaignId?: string) {
    try {
        const db = getAdminDb();
        if (!campaignId) return { slots: [], registrations: [] };

        const [slotsSnapshot, registrationsSnapshot] = await Promise.all([
            db.collection('scheduleSlots').where('campaignId', '==', campaignId).get(),
            db.collection('scheduleRegistrations').where('campaignId', '==', campaignId).get(),
        ]);

        const slots = slotsSnapshot.docs
            .map(doc => ({ id: doc.id, ...doc.data() } as ScheduleSlot))
            .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
        const registrations = registrationsSnapshot.docs
            .map(doc => ({ id: doc.id, ...doc.data() } as ScheduleRegistration))
            .sort((a, b) => `${a.name} ${a.date} ${a.time}`.localeCompare(`${b.name} ${b.date} ${b.time}`, 'pt-BR'));

        return { slots, registrations };
    } catch (error) {
        console.error("getScheduleDashboard error:", error);
        return { slots: [], registrations: [] };
    }
}

export async function getAvailableScheduleSlots(campaignId: string): Promise<ScheduleSlot[]> {
    try {
        const db = getAdminDb();
        const snapshot = await db.collection('scheduleSlots')
            .where('campaignId', '==', campaignId)
            .get();

        return snapshot.docs
            .map(doc => ({ id: doc.id, ...doc.data() } as ScheduleSlot))
            .filter(slot => slot.active !== false && Number(slot.bookedCount || 0) < Number(slot.capacity || 0))
            .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
    } catch (error) {
        console.error("getAvailableScheduleSlots error:", error);
        return [];
    }
}

export async function registerScheduleCandidate(data: ScheduleRegistrationInput): Promise<ActionResult> {
    const parsed = scheduleRegistrationSchema.safeParse(data);
    if (!parsed.success) {
        return { success: false, message: "Verifique os dados informados.", errors: parsed.error.format() };
    }

    const cleanCpf = onlyDigits(parsed.data.cpf);
    const cleanPhone = normalizePhone(parsed.data.phone);
    const registrationId = `${parsed.data.campaignId}_${cleanCpf}`;

    try {
        const db = getAdminDb();
        const slotRef = db.collection('scheduleSlots').doc(parsed.data.slotId);
        const registrationRef = db.collection('scheduleRegistrations').doc(registrationId);
        let selectedSlot: ScheduleSlot | null = null;

        await db.runTransaction(async (transaction) => {
            const [slotDoc, registrationDoc] = await Promise.all([
                transaction.get(slotRef),
                transaction.get(registrationRef),
            ]);

            if (registrationDoc.exists) {
                throw new Error("Você já possui um agendamento nesta campanha.");
            }

            if (!slotDoc.exists) {
                throw new Error("Horário não encontrado.");
            }

            const slotData = slotDoc.data() || {};
            if (slotData.campaignId !== parsed.data.campaignId || slotData.active === false) {
                throw new Error("Este horário não está disponível para esta campanha.");
            }

            const bookedCount = Number(slotData.bookedCount || 0);
            const capacity = Number(slotData.capacity || 0);
            if (bookedCount >= capacity) {
                throw new Error("Este horário acabou de ficar sem vagas. Escolha outro horário.");
            }

            selectedSlot = { id: slotDoc.id, ...slotData } as ScheduleSlot;

            transaction.set(registrationRef, {
                campaignId: parsed.data.campaignId,
                slotId: parsed.data.slotId,
                name: parsed.data.name.trim(),
                cpf: cleanCpf,
                phone: cleanPhone,
                location: slotData.location,
                date: slotData.date,
                time: slotData.time,
                endTime: slotData.endTime || '',
                createdAt: new Date().toISOString(),
            });

            transaction.update(slotRef, {
                bookedCount: FieldValue.increment(1),
                updatedAt: new Date().toISOString(),
            });
        });

        const confirmedSlot = selectedSlot as ScheduleSlot | null;
        if (!confirmedSlot) {
            throw new Error("Não foi possível confirmar os dados do horário selecionado.");
        }

        const notificationResult = await notifyScheduleWhatsapp({
            nome: parsed.data.name.trim(),
            numero: cleanPhone,
            local: confirmedSlot.location,
            data: formatDate(confirmedSlot.date),
            horario: confirmedSlot.endTime ? `${confirmedSlot.time} às ${confirmedSlot.endTime}` : confirmedSlot.time,
        });

        await registrationRef.collection('notifications').add({
            type: 'schedule_confirmation',
            status: notificationResult.success ? 'success' : 'error',
            timestamp: new Date().toISOString(),
            error: notificationResult.message || null,
            payload: {
                numero: cleanPhone,
                local: confirmedSlot.location,
                data: formatDate(confirmedSlot.date),
                horario: confirmedSlot.endTime ? `${confirmedSlot.time} às ${confirmedSlot.endTime}` : confirmedSlot.time,
            },
        });

        revalidatePath('/admin/schedules');
        return notificationResult.success
            ? { success: true, message: "Agendamento confirmado. Enviamos os detalhes pelo WhatsApp." }
            : { success: true, message: "Agendamento confirmado, mas não foi possível enviar o WhatsApp automaticamente." };
    } catch (error) {
        console.error("registerScheduleCandidate error:", error);
        return { success: false, message: error instanceof Error ? error.message : "Erro ao confirmar agendamento." };
    }
}

async function notifyScheduleWhatsapp(payload: {
    nome: string;
    numero: string;
    local: string;
    data: string;
    horario: string;
}) {
    const endpoint = process.env.SCHEDULE_WHATSAPP_ENDPOINT;
    if (!endpoint) {
        console.log("[DEV SCHEDULE WHATSAPP]", payload);
        return { success: true, message: "Endpoint de agendamento não configurado." };
    }

    try {
        const response = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });

        if (!response.ok) {
            return { success: false, message: await response.text() };
        }

        return { success: true };
    } catch (error) {
        return { success: false, message: error instanceof Error ? error.message : "Erro de conexão" };
    }
}
