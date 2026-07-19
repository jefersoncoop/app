import * as z from 'zod';

export const convocationSchema = z.object({
    proposalId: z.string().min(1, 'Candidato não informado.'),
    jobTitle: z.string().trim().min(2, 'Informe o cargo.').max(120, 'O cargo deve ter no máximo 120 caracteres.'),
    location: z.string().trim().min(3, 'Informe o local de comparecimento.').max(240, 'O local deve ter no máximo 240 caracteres.'),
});

export type ConvocationInput = z.infer<typeof convocationSchema>;

