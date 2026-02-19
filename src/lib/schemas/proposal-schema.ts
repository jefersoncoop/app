import * as z from 'zod';

function validateCPF(cpf: string): boolean {
    cpf = cpf.replace(/[^\d]+/g, '');
    if (cpf.length !== 11 || !!cpf.match(/(\d)\1{10}/)) return false;

    let sum = 0;
    for (let i = 0; i < 9; i++) sum += parseInt(cpf.charAt(i)) * (10 - i);
    let rev = 11 - (sum % 11);
    if (rev === 10 || rev === 11) rev = 0;
    if (rev !== parseInt(cpf.charAt(9))) return false;

    sum = 0;
    for (let i = 0; i < 10; i++) sum += parseInt(cpf.charAt(i)) * (11 - i);
    rev = 11 - (sum % 11);
    if (rev === 10 || rev === 11) rev = 0;
    if (rev !== parseInt(cpf.charAt(10))) return false;

    return true;
}

function validateDate(dateStr: string): boolean {
    const regex = /^(\d{2})\/(\d{2})\/(\d{4})$/;
    const match = dateStr.match(regex);
    if (!match) return false;

    const day = parseInt(match[1]);
    const month = parseInt(match[2]);
    const year = parseInt(match[3]);

    if (month < 1 || month > 12) return false;
    if (year < 1900 || year > new Date().getFullYear()) return false;

    const date = new Date(year, month - 1, day);
    return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

export const proposalSchema = z.object({
    // Pessoais
    cpf: z.string().min(14, "CPF obrigatório").refine(validateCPF, "CPF inválido"),
    nomeCompleto: z.string().min(5, "Nome completo sem abreviações").max(70),
    rg: z.string().optional().or(z.literal('')),
    estadoExpedidor: z.string().optional().or(z.literal('')),
    orgaoExpedidor: z.string().optional().or(z.literal('')),
    nomeMae: z.string().min(5, "Nome da mãe obrigatório").max(70),
    pis: z.string().min(14, "PIS/NIT deve conter 11 dígitos"),
    dataNascimento: z.string().min(10, "Data inválida (DD/MM/AAAA)").refine(validateDate, "Data de nascimento inválida"),
    sexo: z.string().min(1, "Selecione"),
    corRaca: z.string().min(1, "Selecione"),
    estadoCivil: z.string().min(1, "Selecione"),
    nacionalidade: z.string().min(1, "Selecione"),
    naturalidadeEstado: z.string().min(2, "Selecione o estado de nascimento"),
    naturalidadeMunicipio: z.string().min(2, "Selecione o município de nascimento"),
    // Endereço
    cep: z.string().min(9, "CEP obrigatório"),
    estado: z.string().min(2),
    cidade: z.string().min(2),
    logradouroTipo: z.string().min(1),
    logradouroNome: z.string().min(3),
    numero: z.string().min(1),
    bairro: z.string().min(2),
    complemento: z.string().optional(),
    // Contato
    telefone: z.string().min(14, "Telefone incompleto"),
    email: z.string().email("E-mail inválido"),
    // Bancário
    // Bancário (Hidden in current flow)
    banco: z.string().optional(),
    tipoConta: z.string().optional(),
    agencia: z.string().optional(),
    conta: z.string().optional(),
    contaDigito: z.string().optional(),
    // Profissional
    escolaridade: z.string().min(1),
    categoriaFuncao: z.string().min(1),
    cargo: z.string().optional(),
    tamanhoCamisa: z.string().min(1),
    // Jurídico
    aceiteConcordancia: z.boolean().refine(v => v === true, "Você deve aceitar a concordância"),
    aceiteLGPD: z.boolean().refine(v => v === true, "Você deve aceitar os termos da LGPD"),
    // CEP (Critérios)
    criterioLocalidade: z.string().min(1, "Responda sobre a localidade"),
    criterioExperiencia: z.string().min(1, "Responda sobre a experiência"),
    criterioDisponibilidade: z.string().min(1, "Responda sobre a disponibilidade"),
    // Campaign & CRM Data
    campaignId: z.string().optional(),
    clientId: z.string().optional(),
    functionId: z.string().optional(),
    ddd: z.string().optional(),
});

export type ProposalFormData = z.infer<typeof proposalSchema>;
