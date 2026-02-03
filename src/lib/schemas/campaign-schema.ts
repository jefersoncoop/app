import * as z from 'zod';

export const campaignSchema = z.object({
    name: z.string().min(3, "Nome da campanha é obrigatório"),
    slug: z.string().min(3, "Slug (URL) é obrigatório").regex(/^[a-z0-9-]+$/, "Apenas letras minúsculas, números e hífens"),
    bannerUrl: z.string().url("URL do banner inválida").optional().or(z.literal('')),
    clientId: z.string().min(1, "Client ID é obrigatório (CRM)"),
    functionId: z.string().min(1, "Function ID é obrigatório (CRM)"),
    professions: z.preprocess(
        (val) => {
            if (typeof val === 'string') {
                return val.split(',').map(s => s.trim()).filter(Boolean);
            }
            return val;
        },
        z.array(z.string()).min(1, "Adicione pelo menos uma profissão")
    ),
    active: z.boolean().default(true),
});

export type CampaignFormData = z.infer<typeof campaignSchema>;

export interface Campaign extends CampaignFormData {
    id: string;
    createdAt: string;
    professions: string[];
}
