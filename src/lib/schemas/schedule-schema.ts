import * as z from 'zod';

const cpfRegex = /^\d{3}\.\d{3}\.\d{3}-\d{2}$|^\d{11}$/;
const phoneRegex = /^\(?\d{2}\)?\s?\d{4,5}-?\d{4}$|^\d{10,11}$/;

export const scheduleSlotSchema = z.object({
    campaignId: z.string().min(1, "Selecione uma campanha"),
    location: z.string().min(3, "Informe o local").max(160),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Informe uma data válida"),
    time: z.string().regex(/^\d{2}:\d{2}$/, "Informe um horário válido"),
    endTime: z.string().regex(/^\d{2}:\d{2}$/, "Informe o horário de fim"),
    capacity: z.coerce.number().int().min(1, "Informe ao menos 1 vaga").max(500, "Limite máximo de 500 vagas"),
    active: z.boolean().default(true),
}).refine((data) => data.endTime > data.time, {
    path: ['endTime'],
    message: "O horário de fim deve ser maior que o horário de início",
});

export const scheduleRegistrationSchema = z.object({
    campaignId: z.string().min(1),
    slotId: z.string().min(1, "Selecione um horário"),
    name: z.string().min(5, "Informe o nome completo").max(80),
    cpf: z.string().regex(cpfRegex, "Informe um CPF válido"),
    phone: z.string().regex(phoneRegex, "Informe um telefone válido"),
});

export type ScheduleSlotInput = z.input<typeof scheduleSlotSchema>;
export type ScheduleRegistrationInput = z.input<typeof scheduleRegistrationSchema>;
