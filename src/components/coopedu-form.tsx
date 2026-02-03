'use client';

import React, { useState } from 'react';
import { useForm, FormProvider, useFormContext } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight, CheckCircle, Info, ShieldCheck } from 'lucide-react';
import { proposalSchema, ProposalFormData } from '@/lib/schemas/proposal-schema';
import { submitProposal } from '@/actions/proposal-actions';

// --- COMPONENTES AUXILIARES DE UI ---
interface FieldProps {
    name: string;
    label: string;
    placeholder?: string;
    mask?: string;
}

// Utility mask function
const applyMask = (value: string, mask: string) => {
    let i = 0;
    const v = value.replace(/\D/g, '');
    return mask.replace(/#/g, () => v[i++] || '').slice(0, v.length + (mask.slice(v.length).search(/\d/) !== -1 ? 0 : 0)); // Simple masking logic needs improvement for robustness or use a library. 
    // Let's use a simpler tailored regex approach or switch/case for known masks to ensure correctness without external heavy libs if possible, 
    // or just manual formatting logic.
};

// Robust formatting helpers
const formatters: Record<string, (v: string) => string> = {
    cpf: (v) => {
        const d = v.replace(/\D/g, '').slice(0, 11);
        return d.replace(/(\d{3})(\d)/, '$1.$2')
            .replace(/(\d{3})(\d)/, '$1.$2')
            .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
    },
    pis: (v) => {
        const d = v.replace(/\D/g, '').slice(0, 11);
        return d.replace(/^(\d{3})(\d)/, '$1.$2')
            .replace(/^(\d{3})\.(\d{5})(\d)/, '$1.$2.$3')
            .replace(/(\d{5})\.(\d{2})(\d)/, '$1.$2-$3');
    },
    date: (v) => {
        const d = v.replace(/\D/g, '').slice(0, 8);
        return d.replace(/(\d{2})(\d)/, '$1/$2')
            .replace(/(\d{2})(\d)/, '$1/$2');
    },
    phone: (v) => {
        const d = v.replace(/\D/g, '').slice(0, 11);
        if (d.length > 10) return d.replace(/^(\d{2})(\d{5})(\d{4}).*/, '($1) $2-$3');
        return d.replace(/^(\d{2})(\d{4})(\d{0,4}).*/, '($1) $2-$3');
    },
    cep: (v) => {
        const d = v.replace(/\D/g, '').slice(0, 8);
        return d.replace(/(\d{5})(\d)/, '$1-$2');
    },
    // Generic max length only
    maxLength: (v) => v
};

const InputField = ({ name, label, placeholder, mask, maxLength }: FieldProps & { mask?: keyof typeof formatters | string, maxLength?: number }) => {
    const { register, setValue, watch, formState: { errors } } = useFormContext();
    const error = errors[name]?.message as string | undefined;

    // Watch value to apply formatting
    const value = watch(name);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        let val = e.target.value;

        // Force Uppercase for all fields except email (standardization request)
        if (name !== 'email' && typeof val === 'string') {
            val = val.toUpperCase();
        }

        if (mask && formatters[mask as string]) {
            val = formatters[mask as string](val);
        } else if (maxLength) {
            val = val.slice(0, maxLength);
        }
        setValue(name, val, { shouldValidate: true });
    };

    return (
        <div className="w-full space-y-2">
            <label className="text-lg font-bold text-[#002B49] block">{label}</label>
            <input
                {...register(name)}
                onChange={handleChange}
                maxLength={maxLength}
                placeholder={placeholder}
                className={`w-full p-4 border-2 rounded-xl text-xl transition-all ${error ? 'border-red-500 bg-red-50' : 'border-gray-200 focus:border-[#CCFF00] focus:ring-2 focus:ring-[#CCFF00] focus:outline-none'}`}
            />
            {error && <p className="text-red-500 text-sm font-semibold">{error}</p>}
        </div>
    );
};

interface SelectProps {
    name: string;
    label: string;
    options: string[];
}

const SelectField = ({ name, label, options }: SelectProps) => {
    const { register, formState: { errors } } = useFormContext();
    const error = errors[name]?.message as string | undefined;

    return (
        <div className="w-full space-y-2">
            <label className="text-lg font-bold text-[#002B49] block">{label}</label>
            <select {...register(name)} className={`w-full p-4 border-2 rounded-xl text-lg bg-white transition-all ${error ? 'border-red-500 bg-red-50' : 'border-gray-200 focus:border-[#CCFF00] focus:ring-2 focus:ring-[#CCFF00] focus:outline-none'}`}>
                <option value="">Selecione...</option>
                {options.map((opt: string) => <option key={opt} value={opt}>{opt}</option>)}
            </select>
            {error && <p className="text-red-500 text-sm font-semibold">{error}</p>}
        </div>
    );
};

export default function CoopeduFormMaster({ campaign }: { campaign?: any }) {
    const [step, setStep] = useState(0);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState<string | null>(null);

    const methods = useForm<ProposalFormData>({
        resolver: zodResolver(proposalSchema),
        mode: "onBlur",
        defaultValues: {
            aceiteConcordancia: false,
            aceiteLGPD: false
        }
    });

    const steps = [
        { id: 'start', progress: 0 },
        { id: 'intro1', progress: 0 },
        { id: 'intro2', progress: 0 },
        { id: 'cpf', progress: 5, fields: ['cpf', 'pis'] },
        { id: 'nome', progress: 12, fields: ['nomeCompleto'] },
        { id: 'mae', progress: 18, fields: ['nomeMae'] },
        { id: 'pessoais', progress: 30, fields: ['dataNascimento', 'sexo', 'corRaca', 'estadoCivil', 'nacionalidade', 'naturalidadeEstado', 'naturalidadeMunicipio'] },
        { id: 'endereco', progress: 40, fields: ['cep', 'cidade', 'estado', 'logradouroNome', 'numero'] },
        { id: 'contato', progress: 50, fields: ['telefone', 'email'] },
        { id: 'profissional', progress: 60, fields: ['escolaridade', 'categoriaFuncao'] },
        { id: 'logistica', progress: 70, fields: ['tamanhoCamisa'] },
        { id: 'criterios', progress: 80, fields: ['criterioLocalidade', 'criterioExperiencia', 'criterioDisponibilidade'] },
        { id: 'termos', progress: 90, fields: ['aceiteConcordancia'] },
        { id: 'lgpd', progress: 95, fields: ['aceiteLGPD'] },
        { id: 'success', progress: 100 }
    ];

    // Note: User's steps array indices in logic vs UI might be slightly off due to hidden/empty steps. 
    // Adjusted logic:
    // Step 0: Splash
    // Step 1: Legal Text
    // Step 3: CPF (Wait, step 2 is missing in user renderer? User code: step === 3. Where is 2? "intro2"?)
    // Let's assume the user provided code flow is correct and map strictly to it.

    const handleNext = async () => {
        const currentStepConfig = steps[step];
        // Check if the current step corresponds to a known configuration
        if (currentStepConfig && currentStepConfig.fields) {
            // Trigger validation for specific fields
            const isValid = await methods.trigger(currentStepConfig.fields as any);
            if (!isValid) return;
        }

        setStep(s => s + 1);
    };

    const onSubmit = async (data: ProposalFormData) => {
        setIsSubmitting(true);
        setSubmitError(null);
        try {
            console.log("Submitting to Server Action:", data);

            // Inject Campaign Data & Extract DDD
            const phoneClean = data.telefone.replace(/\D/g, '');
            const derivedDDD = phoneClean.substring(0, 2);

            const payload = {
                ...data,
                ddd: derivedDDD,
                campaignId: campaign?.id,
                clientId: campaign?.clientId,
                functionId: campaign?.functionId
            };

            const result = await submitProposal(payload as any);

            if (result.success) {
                setStep(steps.length - 1); // Jump to success step
            } else {
                setSubmitError(result.message || "Erro ao enviar.");
            }
        } catch (err) {
            console.error("Submission error:", err);
            setSubmitError("Erro de conexão.");
        } finally {
            setIsSubmitting(false);
        }
    };

    // Debugging validation errors
    if (Object.keys(methods.formState.errors).length > 0) {
        console.log("Form Validation Errors:", methods.formState.errors);
    }

    return (
        <div className="min-h-screen bg-white font-sans text-[#333]">
            {/* HEADER FIXO */}
            <header className="bg-[#002B49] text-white p-4 sticky top-0 z-50 flex justify-between items-center h-20 shadow-md">
                <button
                    onClick={() => setStep(s => Math.max(0, s - 1))}
                    className={`p-2 transition-opacity ${step === 0 || step === steps.length - 1 ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
                >
                    <ChevronLeft size={32} />
                </button>
                <div className="font-bold tracking-tighter text-xl">COOPEDU</div>
                <div className="relative w-14 h-14">
                    {/* Circular Progress */}
                    <svg className="w-full h-full -rotate-90">
                        <circle cx="28" cy="28" r="24" stroke="#1a4d70" strokeWidth="4" fill="none" />
                        <circle cx="28" cy="28" r="24" stroke="#CCFF00" strokeWidth="4" fill="none"
                            strokeDasharray={150.8}
                            strokeDashoffset={150.8 - (150.8 * (steps[step]?.progress || 0)) / 100}
                            className="transition-all duration-700 ease-out" />
                    </svg>
                    <span className="absolute inset-0 flex items-center justify-center text-[10px] font-black italic">
                        {(steps[step]?.progress || 0)}%
                    </span>
                </div>
            </header>

            <main className="p-6 max-w-xl mx-auto pb-32">
                <FormProvider {...methods}>
                    <form onSubmit={methods.handleSubmit(onSubmit)}>
                        {submitError && (
                            <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 mb-4" role="alert">
                                <p className="font-bold">Erro</p>
                                <p>{submitError}</p>
                            </div>
                        )}

                        <AnimatePresence mode="wait">
                            <motion.div
                                key={step}
                                initial={{ opacity: 0, x: 50 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -50 }}
                                className="w-full"
                            >
                                {/* TELA: SPLASH INICIAL */}
                                {step === 0 && (
                                    <div className="text-center space-y-8 pt-10">
                                        {campaign?.bannerUrl ? (
                                            <div className="rounded-3xl shadow-2xl overflow-hidden mb-8 max-w-sm mx-auto">
                                                <img src={campaign.bannerUrl} alt={campaign.name} className="w-full h-auto" />
                                            </div>
                                        ) : (
                                            <div className="bg-[#002B49] text-white p-8 rounded-3xl inline-block shadow-2xl">
                                                <h1 className="text-4xl font-black italic">COOPERAÇÃO<br />DIGITAL</h1>
                                            </div>
                                        )}
                                        <p className="text-2xl font-light">
                                            {campaign ? `Adesão: ${campaign.name}` : 'Preencha a sua ficha de adesão'}
                                        </p>
                                        <button type="button" onClick={handleNext} className="bg-[#CCFF00] text-[#002B49] w-full py-5 rounded-full text-2xl font-black shadow-lg hover:bg-[#b3e600] transition-colors">
                                            CADASTRE-SE
                                        </button>
                                    </div>
                                )}

                                {/* TELAS DE INTRODUÇÃO (TEXTOS LEGAIS) */}
                                {step === 1 && (
                                    <div className="space-y-6">
                                        <div className="bg-blue-50 p-6 rounded-2xl border-l-8 border-[#002B49]">
                                            <h2 className="text-2xl font-bold text-[#002B49] mb-4">Ato de Cooperação Digital</h2>
                                            <p className="text-gray-700 leading-relaxed">A cooperação é uma ação conjunta, realizada para uma finalidade ou objetivo em comum. Nos termos da Lei 5.764, de 16 dezembro de 1971, o Ato de Cooperação é voluntário, e ocorre quando os cooperados aderem aos propósitos sociais e preenchem as condições estabelecidas no Estatuto da Cooperativa responsável pela cooperação. O acesso é livre a quem quiser cooperar-se (exceto nos casos de inaptidão nos termos da lei ou do Estatuto Social), e a manifestação de adesão dependendo única e exclusivamente do próprio cooperado. Diante do exposto, o processo de cooperação da Cooperativa de Trabalho dos Profissionais da Educação do Estado do Rio Grande do Norte (Coopedu) é divido em 02 (duas) etapas, abaixo relacionadas:

                                                <br /><b>ETAPA 01 </b>– PROPOSTA DE ADESÃO: Corresponde ao preenchimento da Proposta de Adesão e assinatura da Declaração de Ciência e Compromisso do Ato Cooperado.

                                                <br /><b>ETAPA 02 </b>– CRITÉRIOS DE ESCOLHA PARA PRODUÇÃO (CEP): Após o preenchimento dos dados pessoais, o participante deverá preencher o questionário CEP, para que a instituição possa avaliar sua experiência e disponibilidade para as vagas ofertadas.

                                                <br /><b>ATENÇÃO!</b> O preenchimento da proposta de adesão, entrega da documentação e dinâmica CEP implicará na aceitação total das normas e condições estabelecidas no Ato de Cooperação. Seus participantes não poderão alegar desconhecimento posteriormente.
                                            </p>
                                        </div>
                                        <button type="button" onClick={handleNext} className="w-full bg-[#002B49] text-white py-4 rounded-xl font-bold hover:bg-[#001f35] transition-colors">PRÓXIMO</button>
                                    </div>
                                )}

                                {/* Step 2 in original logic was implicit or skipped? Rendering step 2 just in case to avoid blank screen if user enters it */}
                                {step === 2 && (
                                    <div className="space-y-6">
                                        <div className="bg-blue-50 p-6 rounded-2xl border-l-8 border-[#002B49]">
                                            <h2 className="text-2xl font-bold text-[#002B49] mb-4">Olá! Agora que você tomou conhecimento de como funciona o Ato de Cooperação, preencha a Proposta de Adesão com os dados solicitados.</h2>
                                            <p className="text-gray-700 leading-relaxed">Você precisará de CPF, Numero do pis, Comprovante de Residência...</p>
                                        </div>
                                        <button type="button" onClick={handleNext} className="w-full bg-[#002B49] text-white py-4 rounded-xl font-bold hover:bg-[#001f35] transition-colors">COMEÇAR</button>
                                    </div>
                                )}

                                {/* TELA: CPF (5%) */}
                                {step === 3 && (
                                    <div className="space-y-6">
                                        <InputField name="cpf" label="Informe seu CPF" placeholder="000.000.000-00" mask="cpf" />
                                        <p className="text-sm text-gray-500 italic">Usaremos este dado para validar seu registro na base nacional.</p>
                                        <InputField name="pis" label="PIS/NIT" placeholder="000.00000.00-0" mask="pis" />
                                        <p className="text-sm text-gray-500 italic">Atenção! A numeração pode estar na Carteira de Trabalho ou no App do Meu INSS.</p>
                                    </div>
                                )}

                                {/* TELA: NOME (11%) */}
                                {step === 4 && (
                                    <div className="space-y-6">
                                        <InputField name="nomeCompleto" label="Seu nome completo" placeholder="Ex: João da Silva Sauro" />
                                        <div className="bg-yellow-50 p-4 rounded-lg flex gap-3 text-yellow-800 text-sm">
                                            <Info size={20} className="shrink-0" /> <p>Não utilize abreviações para evitar problemas na emissão de contratos.</p>
                                        </div>
                                    </div>
                                )}

                                {/* Missing steps 5, 6, 7 in user snippet. User snippet jumped: 4 -> 8. 
                    I must implement the steps 5, 6, 7 based on `steps` array fields to ensure all fields are reachable. 
                    Steps array:
                    3: cpf
                    4: nome
                    5: rg... (id: 'rg')
                    6: mae... (id: 'mae')
                    7: pis... (id: 'pis')
                    8: pessoais...
                */}

                                {step === 5 && (
                                    <div className="space-y-6">
                                        <InputField name="nomeMae" label="Nome da Mãe" placeholder="Nome completo da mãe" />
                                    </div>
                                )}

                                {/* TELA: DADOS PESSOAIS (35%) */}
                                {step === 6 && (
                                    <div className="space-y-4">
                                        <InputField name="dataNascimento" label="Data de Nascimento" placeholder="DD/MM/AAAA" mask="date" />
                                        <SelectField name="sexo" label="Sexo" options={['Masculino', 'Feminino', 'Outro']} />
                                        <SelectField name="corRaca" label="Cor/Raça" options={['Branca', 'Preta', 'Parda', 'Amarela', 'Indígena']} />
                                        <SelectField name="estadoCivil" label="Estado Civil" options={['Solteiro(a)', 'Casado(a)', 'Divorciado(a)', 'Viúvo(a)', 'União Estável']} />
                                        <SelectField name="nacionalidade" label="Nacionalidade" options={['Brasileira', 'Estrangeira']} />
                                        <div className="grid grid-cols-2 gap-4">
                                            <SelectField name="naturalidadeEstado" label="UF Nascimento" options={['SP', 'RJ', 'MG', 'RS', 'BA', 'PE', 'CE', 'PR', 'SC', 'GO', 'AM', 'PA', 'MT', 'MS', 'ES', 'PB', 'RN', 'AL', 'PI', 'MA', 'SE', 'TO', 'RO', 'AC', 'RR', 'AP', 'DF']} />
                                            <InputField name="naturalidadeMunicipio" label="Cidade Nascimento" />
                                        </div>
                                    </div>
                                )}

                                {/* Step 9: Endereco */}
                                {step === 7 && (
                                    <div className="space-y-4">
                                        <InputField name="cep" label="CEP" placeholder="00000-000" mask="cep" />
                                        <div className="grid grid-cols-2 gap-4">
                                            <InputField name="cidade" label="Cidade" />
                                            <SelectField name="estado" label="UF" options={['SP', 'RJ', 'MG', 'RS', 'BA', 'PE', 'CE', 'PR', 'SC', 'GO', 'AM', 'PA', 'MT', 'MS', 'ES', 'PB', 'RN', 'AL', 'PI', 'MA', 'SE', 'TO', 'RO', 'AC', 'RR', 'AP', 'DF']} />
                                        </div>
                                        <SelectField name="logradouroTipo" label="Tipo" options={['Rua', 'Avenida', 'Estrada', 'Rodovia', 'Alameda', 'Travessa', 'Praça']} />
                                        <InputField name="logradouroNome" label="Logradouro" />
                                        <div className="grid grid-cols-2 gap-4">
                                            <InputField name="numero" label="Número" />
                                            <InputField name="bairro" label="Bairro" />
                                        </div>
                                        <InputField name="complemento" label="Complemento" />
                                    </div>
                                )}

                                {/* Step 10: Contato */}
                                {step === 8 && (
                                    <div className="space-y-4">
                                        <div className="grid grid-cols-1 gap-4">
                                            <div className="col-span-1"><InputField name="telefone" label="Telefone/Celular" placeholder="(00) 00000-0000" mask="phone" /></div>
                                        </div>
                                        <InputField name="email" label="E-mail" placeholder="seu@email.com" />
                                    </div>
                                )}

                                {/* Step 12: Profissional */}
                                {step === 9 && (
                                    <div className="space-y-4">
                                        <SelectField name="escolaridade" label="Escolaridade" options={['SEM ESCOLARIDADE', 'Ensino Fundamental Incompleto', 'Ensino Fundamental Completo', 'Ensino Médio Incompleto', 'Ensino Médio Completo', 'Ensino Superior Incompleto', 'Ensino Superior Completo', 'Pós-graduação (ESPECIALIZAÇÃO)', 'Pós-graduação (MESTRADO)', 'Pós-graduação (DOUTORADO)']} />

                                        {/* Updated for Campaign Config */}
                                        <div className="p-4 bg-blue-50 rounded-xl mb-4 border border-blue-100">
                                            <p className="text-[#002B49] font-bold text-sm mb-2">Selecione sua categoria:</p>
                                            <SelectField
                                                name="categoriaFuncao" // Form uses this field name
                                                label="Cargo/Função"
                                                options={campaign?.professions || ['Motorista', 'Entregador', 'Outro']}
                                            />
                                        </div>
                                    </div>
                                )}

                                {/* TELA: LOGÍSTICA (60%) */}
                                {step === 10 && (
                                    <div className="space-y-6">
                                        <label className="text-xl font-bold text-[#002B49]">Tamanho de sua camisa</label>
                                        <div className="grid grid-cols-3 gap-4">
                                            {['P', 'M', 'G', 'GG', 'XG', 'XXG', 'G1', 'G2', 'G3'].map(t => (
                                                <label key={t} className="flex flex-col items-center p-4 border-2 rounded-xl cursor-pointer hover:bg-lime-50 transition-colors">
                                                    <input type="radio" {...methods.register("tamanhoCamisa")} value={t} className="mb-2 w-5 h-5 accent-[#002B49]" />
                                                    <span className="font-bold">{t}</span>
                                                </label>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Step 12: Critérios de Escolha para Produção */}
                                {step === 11 && (
                                    <div className="space-y-8">
                                        <h2 className="text-2xl font-bold text-[#002B49]">Critérios de Escolha para Produção</h2>

                                        <div className="space-y-4">
                                            <label className="block text-lg font-bold text-[#002B49]">
                                                CRITÉRIO AVALIADO: LOCALIDADE <br />
                                                <span className="text-base font-normal text-gray-700">Você mora próximo a alguma escola do seu município?</span>
                                            </label>
                                            <div className="flex gap-6">
                                                <label className="flex items-center gap-2 cursor-pointer">
                                                    <input type="radio" {...methods.register("criterioLocalidade")} value="Sim" className="w-5 h-5 accent-[#002B49]" />
                                                    <span className="text-lg">Sim</span>
                                                </label>
                                                <label className="flex items-center gap-2 cursor-pointer">
                                                    <input type="radio" {...methods.register("criterioLocalidade")} value="Não" className="w-5 h-5 accent-[#002B49]" />
                                                    <span className="text-lg">Não</span>
                                                </label>
                                            </div>
                                            {methods.formState.errors.criterioLocalidade && (
                                                <p className="text-red-500 text-sm">{methods.formState.errors.criterioLocalidade?.message?.toString()}</p>
                                            )}
                                        </div>

                                        <div className="space-y-4">
                                            <label className="block text-lg font-bold text-[#002B49]">
                                                CRITÉRIO AVALIADO: EXPERIÊNCIA <br />
                                                <span className="text-base font-normal text-gray-700">Você possui experiência para vaga a qual está se candidatando?</span>
                                            </label>
                                            <div className="flex gap-6">
                                                <label className="flex items-center gap-2 cursor-pointer">
                                                    <input type="radio" {...methods.register("criterioExperiencia")} value="Sim" className="w-5 h-5 accent-[#002B49]" />
                                                    <span className="text-lg">Sim</span>
                                                </label>
                                                <label className="flex items-center gap-2 cursor-pointer">
                                                    <input type="radio" {...methods.register("criterioExperiencia")} value="Não" className="w-5 h-5 accent-[#002B49]" />
                                                    <span className="text-lg">Não</span>
                                                </label>
                                            </div>
                                            {methods.formState.errors.criterioExperiencia && (
                                                <p className="text-red-500 text-sm">{methods.formState.errors.criterioExperiencia?.message?.toString()}</p>
                                            )}
                                        </div>

                                        <div className="space-y-4">
                                            <label className="block text-lg font-bold text-[#002B49]">
                                                CRITÉRIO AVALIADO: DISPONIBILIDADE <br />
                                                <span className="text-base font-normal text-gray-700">Você tem disponibilidade imediata para prestar o seu serviço na função em que se candidatou?</span>
                                            </label>
                                            <div className="flex gap-6">
                                                <label className="flex items-center gap-2 cursor-pointer">
                                                    <input type="radio" {...methods.register("criterioDisponibilidade")} value="Sim" className="w-5 h-5 accent-[#002B49]" />
                                                    <span className="text-lg">Sim</span>
                                                </label>
                                                <label className="flex items-center gap-2 cursor-pointer">
                                                    <input type="radio" {...methods.register("criterioDisponibilidade")} value="Não" className="w-5 h-5 accent-[#002B49]" />
                                                    <span className="text-lg">Não</span>
                                                </label>
                                            </div>
                                            {methods.formState.errors.criterioDisponibilidade && (
                                                <p className="text-red-500 text-sm">{methods.formState.errors.criterioDisponibilidade?.message?.toString()}</p>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {/* Step 13: Termos (Shifted from 12) */}
                                {step === 12 && (
                                    <div className="space-y-6">
                                        <h2 className="text-2xl font-bold text-[#002B49]">Termos de Concordância</h2>
                                        <div className="h-40 overflow-y-auto bg-gray-50 p-4 rounded-xl border border-gray-200 text-sm">
                                            <p>Declaro conhecer e concordar com as disposições estatutárias da Cooperativa de Trabalho dos Profissionais da Educação do Estado do Rio Grande do Norte (Coopedu), comprometendo-me a não praticar atos que possam colidir com as finalidades, interesses e objetivos da sociedade, caso a presente proposta seja aceita. Autorizo que seja deduzido e recolhido o valor de contribuição à Previdência Social (INSS), cuja obrigação é de minha responsabilidade, sendo os demais tributos incidentes sobre serviços por mim prestados e o percentual definido por Assembleia, para custear os gastos da Cooperativa. Declaro, ainda, conhecer que o percentual deduzido incidirá diretamente no valor bruto das faturas dos serviços por mim prestados; sendo ciente de que minhas atividades na Cooperativa não constitui vínculo trabalhalista, nos termos do artigo 90 da Lei n° 5.764. O Cooperado concorda ceder à Cooperativa os direitos de uso de sua imagem e voz, capturados por meio de fotografia, vídeo ou qualquer outro meio de gravação, durante a participação em eventos, atividades ou situações relacionadas às atividades da cooperativa. A COOPEDU tem o direito exclusivo de utilizar, reproduzir, distribuir e exibir a imagem e vídeo do Cooperado para fins promocionais, publicitários, educacionais e outros relacionados às atividades da cooperativa. Por fim, manifesto-me de forma livre, expressa e consciente que a realização da comunicação oficial da Cooperativa ou dos seus prestadores de serviço poderá ocorrer por meio de quaisquer canais de comunicação (telefone, email, SMS, WhatsApp, etc.).</p>
                                            {/* Insert Full Legal Text Here */}
                                        </div>
                                        <label className="flex items-center gap-3 bg-gray-100 p-4 rounded-xl cursor-pointer hover:bg-gray-200 transition-colors">
                                            <input type="checkbox" {...methods.register("aceiteConcordancia")} className="w-6 h-6 accent-[#002B49]" />
                                            <span className="font-bold">Li e concordo com os termos</span>
                                        </label>
                                        {methods.formState.errors.aceiteConcordancia && (
                                            <p className="text-red-500 text-sm">{methods.formState.errors.aceiteConcordancia?.message?.toString()}</p>
                                        )}

                                    </div>
                                )}

                                {/* TELA: LGPD (75%) */}
                                {step === 13 && (
                                    <div className="space-y-6 text-center">
                                        <div className="flex justify-center"><ShieldCheck size={64} className="text-[#002B49]" /></div>
                                        <h2 className="text-2xl font-bold">Privacidade de Dados</h2>
                                        <p className="text-gray-600 text-sm">Consinto que a COOPERATIVA DE TRABALHO DOS PROFISSIONAIS DA EDUCAÇÃO DO ESTADO DO RN (COOPEDU), aqui denominada como CONTROLADORA, inscrita no CNPJ sob n° 35.537.126-0001/84, em
                                            razão do Proposta de Adesão, disponha dos meus dados pessoais e dados pessoais sensíveis, de acordo com os artigos 7° e 11° da Lei n° 13.709/2018, conforme disposto neste termo, significando que o Titular (cooperado)
                                            autoriza a Controladora (Coopedu) a realizar o tratamento, ou seja, a utilizar os seguintes dados pessoais, para os fins que serão relacionados: nome, RG, CPF, sexualidade, nacionalidade, endereço, dados bancários, dados sensíveis (dado pessoal sobre origem racial ou étnica, convicção religiosa, opinião política, organização de caráter religioso, dado referente à saúde ou à vida sexual, dado genético ou biométrico), com a finalidade de Tratamento dos Dados, para: atualização cadastral, fomento do banco de dados de cooperados aptos a produzir, entrega de informações solicitadas pelo titular dos dados, e em caso de oportunidas angaridas pela cooperativa, Nº MATRÍCULA: como: planos de saúde e odontológico, parcerias educacionais e com instituições financeiras, vale alimentação, seguro de vida, plano de previdência privada, dentre outros, havendo a comunicação prévia para, querendo, o cooperado revogar o consentimento, a qualquer tempo, por e-mail ou por carta escrita, conforme o artigo 8°, § 5°, da Lei n° 13.709/2020. COMPARTILHAMENTO DE DADOS: A Controladora fica autorizada a compartilhar os dados pessoais do Titular
                                            com outros agentes de tratamento de dados, caso seja necessário para as finalidades listadas neste instrumento, desde que, sejam respeitados os princípios da boa-fé, finalidade, adequação, necessidade, livre acesso, qualidade
                                            dos dados, transparência, segurança, prevenção, não discriminação e responsabilização e prestação de contas. RESPONSABILIDADE PELA SEGURANÇA DOS DADOS: A Controladora se responsabiliza por manter medidas de segurança, técnicas e administrativas suficientes a proteger os dados pessoais do Titular e à Autoridade Nacional de Proteção de Dados (ANPD), comunicando ao Titular, caso ocorra algum incidente de segurança que
                                            possa acarretar risco ou dano relevante conforme artigo 48 da Lei n° 13.709/2020. TÉRMINO DO TRATAMENTO DOS DADOS: À Controladora, é permitido manter e utilizar os dados pessoais do Titular durante todo o período estipulado e descrito na política de descarte de documentos inativos e firmado para as finalidades relacionadas neste termo e para cumprimento de obrigação legal ou impostas por órgãos de fiscalização, nos termos do artigo 16 da Lei n° 13.709/2018. O titular fica ciente de que a Controladora deverá
                                            permanecer com os seus dados pelo período na política de descarte de documentos inativos. As partes poderão entrar em acordo, quanto aos eventuais danos causados, caso exista o vazamento de dados pessoais ou
                                            acessos não autorizados, e caso não haja acordo, a Controladora tem ciência que estará sujeita às penalidades previstas no artigo 52 da Lei n° 13.709/2018.
                                            ACORDO DE CONFIDENCIALIDADE: As partes têm entre si justo e acordado o presente (“Acordo”), que seregerá pelas seguinte cláusulas: 1. As partes em si, seus administradores, empregados e prepostos concordam esse comprometem. 2. A não divulgar as Informações Confidenciais, sem a prévia permissão por escrito da outra parte, exceto numa base confidencial, aos diretores, gerentes, representantes (inclusive contadores, advogados e
                                            agentes) e empregados da parte receptora. 2.2. A não duplicar nem distribuir a qualquer outra pessoa além de seus Representantes nenhuma Informação Confidencial para nenhum propósito. 3. Não obstante qualquer outra
                                            cláusula deste Acordo, as partes podem divulgar as Informações Confidenciais em caso de a) solicitação por ordem judicial, ou processo semelhante emitido por um tribunal da jurisdição competente ou por um órgão governamental; b) em qualquer declaração ou testemunho apresentado a qualquer órgão federal, estadual ou municipal, ou qualquer órgão regulamentador com jurisdição sobre esta parte; ou c) para atender às leis, ordens, regulamentos ou regras aplicáveis a esta parte. 4.Cada uma das partes declara-se ciente de que o manuseio
                                            inadequado das Informações Confidenciais, sua divulgação ou revelação inadvertida ou desautorizada a quaisquer terceiros, representarão, por si só, prejuízo ao patrimônio da outra parte, podendo implicar a sua responsabilização civil e/ou criminal, de acordo com a violação verificada, obrigando-se ao ressarcimento das perdas e danos decorrentes. 5. Os termos deste Acordo obrigam as partes e seus sucessores. 6. Este Acordo terá
                                            a validade de 05 (cinco) anos a contar da data de sua assinatura. 7. As PARTES declaram estar cientes das disposições previstas na Lei n. 13.709/2018 (Lei Geral de Proteção de Dados – “LGPD”) e que, desde o dia 16 de
                                            agosto de 2020, estão aptas para cumpri-las no tratamento de todos e quaisquer dados pessoais realizado em razão do presente Contrato, de forma a garantir inteiramente os plenos direitos dos titulares de dados sendo seu descumprimento fundamento para rescisão contratual, a critério da COOPERATIVA DE TRABALHO DOS PROFISSIONAIS DA EDUCAÇÃO DO ESTADO DO RN (COOPEDU).</p>
                                        <label className="flex items-center gap-3 bg-gray-100 p-4 rounded-xl cursor-pointer hover:bg-gray-200 transition-colors text-left">
                                            <input type="checkbox" {...methods.register("aceiteLGPD")} className="w-6 h-6 accent-[#002B49]" />
                                            <span className="font-bold">Estou de acordo com os termos</span>
                                        </label>
                                        {methods.formState.errors.aceiteLGPD && (
                                            <p className="text-red-500 text-sm">{methods.formState.errors.aceiteLGPD?.message?.toString()}</p>
                                        )}
                                    </div>
                                )}

                                {/* TELA: SUCESSO (100%) */}
                                {step === steps.length - 1 && (
                                    <div className="text-center space-y-6 py-10">
                                        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="flex justify-center">
                                            <CheckCircle size={100} className="text-green-500" />
                                        </motion.div>
                                        <h2 className="text-3xl font-black text-[#002B49]">Obrigado!</h2>
                                        <p className="text-xl">Sua ficha foi enviada com sucesso.</p>
                                        <div className="bg-green-50 p-6 rounded-2xl border-2 border-green-200">
                                            <p className="text-green-800 font-bold">Verifique seu WhatsApp</p>
                                            <p className="text-green-700 text-sm">Enviamos um link exclusivo para você anexar seus documentos.</p>
                                        </div>
                                        <button type="button" onClick={() => window.location.reload()} className="bg-[#002B49] text-white px-8 py-3 rounded-full font-bold mt-4">
                                            Novo Cadastro
                                        </button>
                                    </div>
                                )}
                            </motion.div>
                        </AnimatePresence>

                        {/* BARRA DE NAVEGAÇÃO INFERIOR */}
                        {step > 2 && step < steps.length - 1 && (
                            <div className="fixed bottom-0 left-0 right-0 p-6 bg-white/80 backdrop-blur-md flex justify-end items-center border-t z-40">
                                {step === 13 ? (
                                    // Should be 13 based on Logic above for LGPD being the last step before success
                                    <button
                                        type="submit"
                                        disabled={isSubmitting}
                                        className="bg-[#002B49] text-white px-10 py-4 rounded-full font-black flex items-center gap-2 shadow-xl disabled:opacity-50 disabled:cursor-not-allowed hover:bg-[#001f35] transition-colors"
                                    >
                                        {isSubmitting ? 'ENVIANDO...' : 'FINALIZAR'} <CheckCircle size={20} />
                                    </button>
                                ) : (
                                    <button type="button" onClick={handleNext} className="bg-[#002B49] text-white px-10 py-4 rounded-full font-black flex items-center gap-2 shadow-xl hover:bg-[#001f35] transition-colors">
                                        PRÓXIMO <ChevronRight size={20} />
                                    </button>
                                )}
                            </div>
                        )}
                    </form>
                </FormProvider>
            </main>
        </div>
    );
}
