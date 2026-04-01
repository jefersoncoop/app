'use client';

import React, { useState, useEffect } from 'react';
import { useForm, FormProvider, useFormContext } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight, CheckCircle, Info, ShieldCheck } from 'lucide-react';
import { proposalSchema, ProposalFormData } from '@/lib/schemas/proposal-schema';
import { submitProposal, checkExistingProposalByCPF, updateProposal } from '@/actions/proposal-actions';
import statesCitiesData from '@/data/ibge-states-cities.json';

// --- COMPONENTES AUXILIARES DE UI ---
interface FieldProps {
    name: string;
    label: string;
    placeholder?: string;
    mask?: string;
}

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
        let d = v.replace(/\D/g, '').slice(0, 8);
        if (d.length >= 2) {
            const day = parseInt(d.slice(0, 2));
            if (day > 31) d = '31' + d.slice(2);
        }
        if (d.length >= 4) {
            const month = parseInt(d.slice(2, 4));
            if (month > 12) d = d.slice(0, 2) + '12' + d.slice(4);
        }
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
    maxLength: (v) => v
};

const InputField = ({ name, label, placeholder, mask, maxLength }: FieldProps & { mask?: keyof typeof formatters | string, maxLength?: number }) => {
    const { register, setValue, watch, formState: { errors } } = useFormContext();
    const error = errors[name]?.message as string | undefined;

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        let val = e.target.value;
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
                className={`w-full p-4 border-2 rounded-xl text-xl transition-all ${error ? 'border-red-500 bg-red-50' : 'border-gray-200 focus:border-[#002B49] focus:ring-2 focus:ring-[#002B49] focus:outline-none'}`}
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

const BRAZIL_STATES = [
    'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'
].sort();

const SelectField = ({ name, label, options }: SelectProps) => {
    const { register, formState: { errors } } = useFormContext();
    const error = errors[name]?.message as string | undefined;

    return (
        <div className="w-full space-y-2">
            <label className="text-lg font-bold text-[#002B49] block">{label}</label>
            <select {...register(name)} className={`w-full p-4 border-2 rounded-xl text-lg bg-white transition-all ${error ? 'border-red-500 bg-red-50' : 'border-gray-200 focus:border-[#002B49] focus:ring-2 focus:ring-[#002B49] focus:outline-none'}`}>
                <option value="">Selecione...</option>
                {options.map((opt: string) => <option key={opt} value={opt}>{opt}</option>)}
            </select>
            {error && <p className="text-red-500 text-sm font-semibold">{error}</p>}
        </div>
    );
};

const CitySelectField = ({ name, label, stateFieldName }: { name: string, label: string, stateFieldName: string }) => {
    const { register, watch, formState: { errors } } = useFormContext();
    const selectedState = watch(stateFieldName);
    const cities = selectedState ? (statesCitiesData as Record<string, string[]>)[selectedState] || [] : [];
    const error = errors[name]?.message as string | undefined;

    return (
        <div className="w-full space-y-2">
            <label className="text-lg font-bold text-[#002B49] block">{label}</label>
            <select
                {...register(name)}
                disabled={!selectedState}
                className={`w-full p-4 border-2 rounded-xl text-lg bg-white transition-all ${error ? 'border-red-500 bg-red-50' : 'border-gray-200 focus:border-[#002B49] focus:ring-2 focus:ring-[#002B49] focus:outline-none disabled:bg-gray-100'}`}
            >
                <option value="">{!selectedState ? 'Selecione o estado primeiro...' : 'Selecione a cidade...'}</option>
                {cities.map((city) => (
                    <option key={city} value={city}>{city}</option>
                ))}
            </select>
            {error && <p className="text-red-500 text-sm font-semibold">{error}</p>}
        </div>
    );
};

export default function CooperaFormMaster({ campaign }: { campaign?: any }) {
    const [step, setStep] = useState(0);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isCheckingCPF, setIsCheckingCPF] = useState(false);
    const [submitError, setSubmitError] = useState<string | null>(null);
    const [existingProposal, setExistingProposal] = useState<any>(null);
    const [uploadToken, setUploadToken] = useState<string | null>(null);

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
        { id: 'intro', progress: 5 }, // Passo 3 do usuário (Step 2 aqui)
        { id: 'cpf', progress: 10, fields: ['cpf', 'pis'] },
        { id: 'nome', progress: 15, fields: ['nomeCompleto'] },
        { id: 'mae', progress: 20, fields: ['nomeMae'] },
        { id: 'pessoais', progress: 30, fields: ['dataNascimento', 'sexo', 'corRaca', 'estadoCivil', 'nacionalidade', 'naturalidadeEstado', 'naturalidadeMunicipio'] },
        { id: 'endereco', progress: 40, fields: ['cep', 'cidade', 'estado', 'logradouroNome', 'numero'] },
        { id: 'contato', progress: 50, fields: ['telefone', 'email'] },
        { id: 'profissional', progress: 60, fields: ['escolaridade', 'categoriaFuncao'] },
        { id: 'logistica', progress: 70, fields: ['tamanhoCamisa'] },
        { id: 'criterios', progress: 85, fields: ['criterioFormacao', 'criterioLocalidade', 'criterioExperiencia', 'criterioDisponibilidade'] },
        { id: 'termos', progress: 90, fields: ['aceiteConcordancia'] },
        { id: 'lgpd', progress: 95, fields: ['aceiteLGPD'] },
        { id: 'success', progress: 100 }
    ];

    const handleNext = async () => {
        const currentStepConfig = steps[step];
        if (currentStepConfig && currentStepConfig.fields) {
            const isValid = await methods.trigger(currentStepConfig.fields as any);
            if (!isValid) return;

            if (currentStepConfig.id === 'cpf' && !existingProposal) {
                const cpfValue = methods.getValues('cpf');
                setIsCheckingCPF(true);
                try {
                    const checkResult = await checkExistingProposalByCPF(cpfValue);
                    if (checkResult.success && checkResult.existingProposal) {
                        setExistingProposal(checkResult.existingProposal);
                        setIsCheckingCPF(false);
                        return;
                    }
                } catch (e) {
                    console.error("Error checking CPF", e);
                }
                setIsCheckingCPF(false);
            }
        }
        setStep(s => s + 1);
    };

    const onSubmit = async (data: ProposalFormData) => {
        setIsSubmitting(true);
        setSubmitError(null);
        try {
            const phoneClean = data.telefone.replace(/\D/g, '');
            const derivedDDD = phoneClean.substring(0, 2);

            const payload = {
                ...data,
                ddd: derivedDDD,
                campaignId: campaign?.id,
                clientId: campaign?.clientId,
                functionId: campaign?.functionId
            };

            let result;
            if (existingProposal && existingProposal.id) {
                result = await updateProposal(existingProposal.id, payload as any);
            } else {
                result = await submitProposal(payload as any);
            }

            if (result.success) {
                if (result.uploadToken) {
                    setUploadToken(result.uploadToken);
                }
                setStep(steps.length - 1);
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
                <div className="font-bold tracking-tighter text-xl">FORMULÁRIO DIGITAL</div>
                <div className="relative w-14 h-14">
                    <svg className="w-full h-full -rotate-90">
                        <circle cx="28" cy="28" r="24" stroke="#1a4d70" strokeWidth="4" fill="none" />
                        <circle cx="28" cy="28" r="24" stroke="#00AEEF" strokeWidth="4" fill="none"
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
                                            {campaign ? campaign.name : 'Formulário de Inscrição'}
                                        </p>
                                        <button type="button" onClick={() => setStep(1)} className="bg-[#002B49] text-white w-full py-5 rounded-full text-2xl font-black shadow-lg hover:bg-[#001f35] transition-colors">
                                            INSCREVA-SE
                                        </button>
                                    </div>
                                )}

                                {/* Passo 2 removido, vamos direto para o Passo 3 do usuário (Intro nova) */}
                                {step === 1 && (
                                    <div className="space-y-6">
                                        <div className="bg-blue-50 p-6 rounded-2xl border-l-8 border-[#002B49]">
                                            <h2 className="text-2xl font-bold text-[#002B49] mb-4">Formulário de Inscrição para Mediadores Pedagógicos (Betim/MG)</h2>
                                            <p className="text-gray-700 leading-relaxed">
                                                Destacamos que as informações do formulário estão nos termos da Lei Geral de Proteção de Dados (Lei nº 13.709/18); e que serão tratados com as finalidades específicas, prevista nas bases legais da respectiva lei.
                                                <br /><br />
                                                <strong>Atenção!</strong> O preenchimento do formulário e envio da documentação não garantem ao participante vaga ou contratação imediata.
                                            </p>
                                        </div>
                                        <button type="button" onClick={handleNext} className="w-full bg-[#002B49] text-white py-4 rounded-xl font-bold hover:bg-[#001f35] transition-colors">COMEÇAR</button>
                                    </div>
                                )}

                                {/* TELA: CPF */}
                                {step === 2 && (
                                    <div className="space-y-6">
                                        {existingProposal ? (
                                            <div className="bg-yellow-50 p-6 rounded-2xl border-l-8 border-yellow-500 space-y-4">
                                                <h2 className="text-xl font-bold text-yellow-800">Inscrição já existente</h2>
                                                <p className="text-gray-700">Identificamos que você já possui uma inscrição cadastrada com este CPF.</p>
                                                <div className="space-y-3 pt-4">
                                                    <button type="button" onClick={() => { methods.reset({ ...methods.getValues(), ...existingProposal }); setStep(3); }} className="w-full bg-[#002B49] text-white py-3 rounded-xl font-bold hover:bg-[#001f35] transition-colors">MODIFICAR MEUS DADOS</button>
                                                    {existingProposal.status === 'pending_documents' && existingProposal.uploadToken && (
                                                        <button type="button" onClick={() => window.location.href = `/upload/${existingProposal.uploadToken}`} className="w-full bg-white border-2 border-[#002B49] text-[#002B49] py-3 rounded-xl font-bold hover:bg-gray-50 transition-colors">ENVIAR DOCUMENTAÇÃO PENDENTE</button>
                                                    )}
                                                </div>
                                            </div>
                                        ) : (
                                            <>
                                                <InputField name="cpf" label="Informe seu CPF" placeholder="000.000.000-00" mask="cpf" />
                                                <InputField name="pis" label="PIS/NIT" placeholder="000.00000.00-0" mask="pis" />
                                            </>
                                        )}
                                    </div>
                                )}

                                {/* TELA: NOME */}
                                {step === 3 && (
                                    <div className="space-y-6">
                                        <InputField name="nomeCompleto" label="Seu nome completo" placeholder="Ex: João da Silva Sauro" />
                                        <div className="bg-blue-50 p-4 rounded-lg flex gap-3 text-blue-800 text-sm">
                                            <Info size={20} className="shrink-0" /> <p>Não utilize abreviações para evitar problemas na emissão de contratos.</p>
                                        </div>
                                    </div>
                                )}

                                {step === 4 && (
                                    <div className="space-y-6">
                                        <InputField name="nomeMae" label="Nome da Mãe" placeholder="Nome completo da mãe" />
                                    </div>
                                )}

                                {step === 5 && (
                                    <div className="space-y-4">
                                        <InputField name="dataNascimento" label="Data de Nascimento" placeholder="DD/MM/AAAA" mask="date" />
                                        <SelectField name="sexo" label="Sexo" options={['Masculino', 'Feminino', 'Outro']} />
                                        <SelectField name="corRaca" label="Cor/Raça" options={['Branca', 'Preta', 'Parda', 'Amarela', 'Indigena']} />
                                        <SelectField name="estadoCivil" label="Estado Civil" options={['Solteiro(a)', 'Casado(a)', 'Divorciado(a)', 'Viúvo(a)', 'União Estável']} />
                                        <SelectField name="nacionalidade" label="Nacionalidade" options={['Brasileira', 'Estrangeira']} />
                                        <div className="grid grid-cols-2 gap-4">
                                            <SelectField name="naturalidadeEstado" label="UF Nascimento" options={BRAZIL_STATES} />
                                            <CitySelectField name="naturalidadeMunicipio" label="Cidade Nascimento" stateFieldName="naturalidadeEstado" />
                                        </div>
                                    </div>
                                )}

                                {step === 6 && (
                                    <div className="space-y-4">
                                        <InputField name="cep" label="CEP" placeholder="00000-000" mask="cep" />
                                        <div className="grid grid-cols-2 gap-4">
                                            <SelectField name="estado" label="UF" options={BRAZIL_STATES} />
                                            <CitySelectField name="cidade" label="Cidade" stateFieldName="estado" />
                                        </div>
                                        <SelectField name="logradouroTipo" label="Tipo" options={['Rua', 'Avenida', 'Estrada', 'Rodovia', 'Alameda', 'Travessa', 'Praça', 'Comunidade', 'Sitio', 'Viela', 'Vila']} />
                                        <InputField name="logradouroNome" label="Endereço" />
                                        <div className="grid grid-cols-2 gap-4">
                                            <InputField name="numero" label="Número" />
                                            <InputField name="bairro" label="Bairro" />
                                        </div>
                                        <InputField name="complemento" label="Complemento" />
                                    </div>
                                )}

                                {step === 7 && (
                                    <div className="space-y-4">
                                        <InputField name="telefone" label="Telefone/Celular" placeholder="(00) 00000-0000" mask="phone" />
                                        <InputField name="email" label="E-mail" placeholder="seu@email.com" />
                                    </div>
                                )}

                                {step === 8 && (
                                    <div className="space-y-4">
                                        <SelectField name="escolaridade" label="Escolaridade" options={['SEM ESCOLARIDADE', 'Ensino Fundamental Incompleto', 'Ensino Fundamental Completo', 'Ensino Médio Incompleto', 'Ensino Médio Completo', 'Ensino Superior Incompleto', 'Ensino Superior Completo', 'Pós-graduação (ESPECIALIZAÇÃO)', 'Pós-graduação (MESTRADO)', 'Pós-graduação (DOUTORADO)']} />
                                        <SelectField name="categoriaFuncao" label="Cargo/Função" options={campaign?.professions || []} />
                                    </div>
                                )}

                                {step === 9 && (
                                    <div className="space-y-6">
                                        <label className="text-xl font-bold text-[#002B49]">Tamanho de sua camisa</label>
                                        <div className="grid grid-cols-3 gap-4">
                                            {['P', 'M', 'G', 'GG', 'XG', 'XXG', 'G1', 'G2', 'G3'].map(t => (
                                                <label key={t} className="flex flex-col items-center p-4 border-2 rounded-xl cursor-pointer hover:bg-blue-50 transition-colors">
                                                    <input type="radio" {...methods.register("tamanhoCamisa")} value={t} className="mb-2 w-5 h-5 accent-[#002B49]" />
                                                    <span className="font-bold">{t}</span>
                                                </label>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {step === 10 && (
                                    <div className="space-y-8">
                                        <h2 className="text-2xl font-bold text-[#002B49]">Critérios de Escolha para Produção</h2>

                                        <div className="space-y-4">
                                            <label className="block text-lg font-bold text-[#002B49]">
                                                CRITÉRIO AVALIADO: FORMAÇÃO <br />
                                                <span className="text-base font-normal text-gray-700">Você possuí formação específica para a vaga?</span>
                                            </label>
                                            <div className="flex gap-6">
                                                <label className="flex items-center gap-2 cursor-pointer"><input type="radio" {...methods.register("criterioFormacao")} value="Sim" className="w-5 h-5 accent-[#002B49]" /> <span className="text-lg">Sim</span></label>
                                                <label className="flex items-center gap-2 cursor-pointer"><input type="radio" {...methods.register("criterioFormacao")} value="Não" className="w-5 h-5 accent-[#002B49]" /> <span className="text-lg">Não</span></label>
                                            </div>
                                        </div>

                                        <div className="space-y-4">
                                            <label className="block text-lg font-bold text-[#002B49]">
                                                CRITÉRIO AVALIADO: EXPERIÊNCIA <br />
                                                <span className="text-base font-normal text-gray-700">Você possui experiência para vaga a qual está se candidatando?</span>
                                            </label>
                                            <div className="flex gap-6">
                                                <label className="flex items-center gap-2 cursor-pointer"><input type="radio" {...methods.register("criterioExperiencia")} value="Sim" className="w-5 h-5 accent-[#002B49]" /> <span className="text-lg">Sim</span></label>
                                                <label className="flex items-center gap-2 cursor-pointer"><input type="radio" {...methods.register("criterioExperiencia")} value="Não" className="w-5 h-5 accent-[#002B49]" /> <span className="text-lg">Não</span></label>
                                            </div>
                                        </div>

                                        <div className="space-y-4">
                                            <label className="block text-lg font-bold text-[#002B49]">
                                                CRITÉRIO AVALIADO: LOCALIDADE <br />
                                                <span className="text-base font-normal text-gray-700">Você mora próximo a alguma escola do seu município?</span>
                                            </label>
                                            <div className="flex gap-6">
                                                <label className="flex items-center gap-2 cursor-pointer"><input type="radio" {...methods.register("criterioLocalidade")} value="Sim" className="w-5 h-5 accent-[#002B49]" /> <span className="text-lg">Sim</span></label>
                                                <label className="flex items-center gap-2 cursor-pointer"><input type="radio" {...methods.register("criterioLocalidade")} value="Não" className="w-5 h-5 accent-[#002B49]" /> <span className="text-lg">Não</span></label>
                                            </div>
                                        </div>

                                        <div className="space-y-4">
                                            <label className="block text-lg font-bold text-[#002B49]">
                                                CRITÉRIO AVALIADO: DISPONIBILIDADE <br />
                                                <span className="text-base font-normal text-gray-700">Você tem disponibilidade imediata para prestar o seu serviço na função em que se candidatou?</span>
                                            </label>
                                            <div className="flex gap-6">
                                                <label className="flex items-center gap-2 cursor-pointer"><input type="radio" {...methods.register("criterioDisponibilidade")} value="Sim" className="w-5 h-5 accent-[#002B49]" /> <span className="text-lg">Sim</span></label>
                                                <label className="flex items-center gap-2 cursor-pointer"><input type="radio" {...methods.register("criterioDisponibilidade")} value="Não" className="w-5 h-5 accent-[#002B49]" /> <span className="text-lg">Não</span></label>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {step === 11 && (
                                    <div className="space-y-6">
                                        <h2 className="text-2xl font-bold text-[#002B49]">Termos de Concordância</h2>
                                        <div className="h-40 overflow-y-auto bg-gray-50 p-4 rounded-xl border border-gray-200 text-sm text-gray-600">
                                            <p>Declaro conhecer e concordar com as disposições estatutárias da Cooperativa de Trabalho dos Profissionais da Educação do Estado do Rio Grande do Norte (Coopedu), comprometendo-me a não praticar atos que possam colidir com as finalidades, interesses e objetivos da sociedade, caso a presente proposta seja aceita. Autorizo que seja deduzido e recolhido o valor de contribuição à Previdência Social (INSS), cuja obrigação é de minha responsabilidade, sendo os demais tributos incidentes sobre serviços por mim prestados e o percentual definido por Assembleia, para custear os gastos da Cooperativa. Declaro, ainda, conhecer que o percentual deduzido incidirá diretamente no valor bruto das faturas dos serviços por mim prestados; sendo ciente de que minhas atividades na Cooperativa não constitui vínculo trabalhalista, nos termos do artigo 90 da Lei n° 5.764. O Cooperado concorda ceder à Cooperativa os direitos de uso de sua imagem e voz, capturados por meio de fotografia, vídeo ou qualquer outro meio de gravação, durante a participação em eventos, atividades ou situações relacionadas às atividades da cooperativa. A COOPEDU tem o direito exclusivo de utilizar, reproduzir, distribuir e exibir a imagem e vídeo do Cooperado para fins promocionais, publicitários, educacionais e outros relacionados às atividades da cooperativa. Por fim, manifesto-me de forma livre, expressa e consciente que a realização da comunicação oficial da Cooperativa ou dos seus prestadores de serviço poderá ocorrer por meio de quaisquer canais de comunicação (telefone, email, SMS, WhatsApp, etc.).</p>
                                        </div>
                                        <label className="flex items-center gap-3 bg-gray-100 p-4 rounded-xl cursor-pointer hover:bg-gray-200 transition-colors">
                                            <input type="checkbox" {...methods.register("aceiteConcordancia")} className="w-6 h-6 accent-[#002B49]" />
                                            <span className="font-bold">Li e concordo com os termos</span>
                                        </label>
                                    </div>
                                )}

                                {step === 12 && (
                                    <div className="space-y-6">
                                        <div className="flex justify-center"><ShieldCheck size={64} className="text-[#002B49]" /></div>
                                        <h2 className="text-2xl font-bold">Privacidade de Dados</h2>
                                        <div className="h-40 overflow-y-auto bg-gray-50 p-4 rounded-xl border border-gray-200 text-sm text-gray-600">
                                            <p>Consinto que a CONTROLADORA disponha dos meus dados pessoais conforme a LGPD...</p>
                                        </div>
                                        <label className="flex items-center gap-3 bg-gray-100 p-4 rounded-xl cursor-pointer hover:bg-gray-200 transition-colors text-left">
                                            <input type="checkbox" {...methods.register("aceiteLGPD")} className="w-6 h-6 accent-[#002B49]" />
                                            <span className="font-bold">Estou de acordo com os termos</span>
                                        </label>
                                    </div>
                                )}

                                {step === 13 && (
                                    <div className="text-center space-y-6 py-10">
                                        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="flex justify-center"><CheckCircle size={100} className="text-green-500" /></motion.div>
                                        <h2 className="text-3xl font-black text-[#002B49]">Inscrição Realizada!</h2>
                                        <p className="text-xl">Obrigado por se inscrever.</p>
                                        <button type="button" onClick={() => window.location.reload()} className="bg-transparent border-2 border-[#002B49] text-[#002B49] px-8 py-3 rounded-full font-bold mt-4 hover:bg-gray-50 transition-colors">Nova Inscrição</button>
                                    </div>
                                )}
                            </motion.div>
                        </AnimatePresence>

                        {step < steps.length - 1 && (
                            <div className="fixed bottom-0 left-0 right-0 p-6 bg-white/80 backdrop-blur-md flex justify-end items-center border-t z-40">
                                {step === 12 ? (
                                    <button type="submit" disabled={isSubmitting} className="bg-[#002B49] text-white px-10 py-4 rounded-full font-black flex items-center gap-2 shadow-xl disabled:opacity-50 hover:bg-[#001f35] transition-colors">{isSubmitting ? 'ENVIANDO...' : 'FINALIZAR'} <CheckCircle size={20} /></button>
                                ) : (
                                    <button type="button" onClick={handleNext} disabled={isCheckingCPF} className="bg-[#002B49] text-white px-10 py-4 rounded-full font-black flex items-center gap-2 shadow-xl hover:bg-[#001f35] transition-colors disabled:opacity-50">{isCheckingCPF ? 'VERIFICANDO...' : 'PRÓXIMO'} <ChevronRight size={20} /></button>
                                )}
                            </div>
                        )}
                    </form>
                </FormProvider>
            </main>
        </div>
    );
}
