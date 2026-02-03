'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { campaignSchema, CampaignFormData } from '@/lib/schemas/campaign-schema';
import { createCampaign, updateCampaign } from '@/actions/campaign-actions';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Save, Loader2, ArrowLeft } from 'lucide-react';
import Link from 'next/link';

export default function CampaignForm({ campaign }: { campaign?: any }) {
    const router = useRouter();
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Convert array professions back to comma string for editing if needed
    const defaultValues: any = campaign ? {
        ...campaign,
        professions: Array.isArray(campaign.professions) ? campaign.professions.join(', ') : campaign.professions
    } : {
        active: true
    };

    const { register, handleSubmit, formState: { errors } } = useForm<CampaignFormData>({
        resolver: zodResolver(campaignSchema),
        defaultValues
    });

    const onSubmit = async (data: CampaignFormData) => {
        setIsSubmitting(true);
        console.log("Form Submitting:", data);
        try {
            const res = campaign ? await updateCampaign(campaign.id, data) : await createCampaign(data);
            console.log("Server Response:", res);

            if (res.success) {
                router.push('/admin/campaigns');
                router.refresh();
            } else {
                alert(res.message || "Erro desconhecido ao salvar");
                if (res.errors) {
                    console.error("Validation Errors:", res.errors);
                }
            }
        } catch (e: any) {
            console.error("Submission Exception:", e);
            alert("Erro de conexão ou exceção não tratada: " + e.message);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <form onSubmit={handleSubmit(onSubmit)} className="max-w-3xl space-y-8">
            <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-200 space-y-6">
                <div className="grid grid-cols-2 gap-6">
                    <div className="col-span-2">
                        <label className="block font-bold text-gray-700 mb-2">Nome da Campanha</label>
                        <input {...register('name')} className="w-full p-3 border rounded-lg" placeholder="Ex: Motoristas SP 2024" />
                        {errors.name && <p className="text-red-500 text-sm">{errors.name.message as string}</p>}
                    </div>

                    <div>
                        <label className="block font-bold text-gray-700 mb-2">Slug (URL)</label>
                        <div className="flex items-center">
                            <span className="p-3 bg-gray-100 border border-r-0 rounded-l-lg text-gray-500">/c/</span>
                            <input {...register('slug')} className="w-full p-3 border rounded-r-lg" placeholder="motoristas-sp" />
                        </div>
                        {errors.slug && <p className="text-red-500 text-sm">{errors.slug.message as string}</p>}
                    </div>

                    <div className="flex items-center pt-8">
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input type="checkbox" {...register('active')} className="w-5 h-5 accent-[#002B49]" />
                            <span className="font-bold text-gray-700">Campanha Ativa</span>
                        </label>
                    </div>
                </div>

                <div>
                    <label className="block font-bold text-gray-700 mb-2">URL do Banner</label>
                    <input {...register('bannerUrl')} className="w-full p-3 border rounded-lg" placeholder="https://..." />
                    <p className="text-xs text-gray-500 mt-1">Deixe em branco para usar o padrão.</p>
                    {errors.bannerUrl && <p className="text-red-500 text-sm">{errors.bannerUrl.message as string}</p>}
                </div>
            </div>

            <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-200 space-y-6">
                <h2 className="text-xl font-bold text-[#002B49]">Configurações do CRM</h2>
                <div className="grid grid-cols-2 gap-6">
                    <div>
                        <label className="block font-bold text-gray-700 mb-2">Client ID</label>
                        <input {...register('clientId')} className="w-full p-3 border rounded-lg" placeholder="12345" />
                        {errors.clientId && <p className="text-red-500 text-sm">{errors.clientId.message as string}</p>}
                    </div>

                    <div>
                        <label className="block font-bold text-gray-700 mb-2">Function ID</label>
                        <input {...register('functionId')} className="w-full p-3 border rounded-lg" placeholder="67890" />
                        {errors.functionId && <p className="text-red-500 text-sm">{errors.functionId.message as string}</p>}
                    </div>
                </div>
            </div>

            <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-200 space-y-6">
                <h2 className="text-xl font-bold text-[#002B49]">Profissões Permitidas</h2>
                <div>
                    <label className="block font-bold text-gray-700 mb-2">Lista de Profissões (separadas por vírgula)</label>
                    <textarea {...register('professions')} className="w-full p-3 border rounded-lg h-32" placeholder="Motorista, Entregador, Motoboy..." />
                    <p className="text-xs text-gray-500 mt-1">Estas opções aparecerão no dropdown do formulário.</p>
                    {errors.professions && <p className="text-red-500 text-sm">{errors.professions.message as string}</p>}
                </div>
            </div>

            <div className="flex gap-4">
                <Link href="/admin/campaigns" className="px-6 py-3 rounded-lg border bg-white font-bold hover:bg-gray-50">Cancelar</Link>
                <button type="submit" disabled={isSubmitting} className="flex-1 bg-[#002B49] text-white px-6 py-3 rounded-lg font-bold flex justify-center items-center gap-2 hover:bg-[#001f35]">
                    {isSubmitting ? <Loader2 className="animate-spin" /> : <Save />} Salvar Campanha
                </button>
            </div>
        </form>
    );
}
