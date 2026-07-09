export const PROPOSAL_TEMPLATE_OPTIONS = [
    {
        id: "porpostav1",
        label: "Padrão - PORPOSTAV1",
        filename: "PORPOSTAV1.docx"
    },
    {
        id: "adesao_full",
        label: "Proposta de Adesão Completa",
        filename: "PROPOSTA_DE_ADESAO_full.docx"
    }
] as const;

export type ProposalTemplateId = typeof PROPOSAL_TEMPLATE_OPTIONS[number]["id"];

export const DEFAULT_PROPOSAL_TEMPLATE_ID: ProposalTemplateId = "porpostav1";
