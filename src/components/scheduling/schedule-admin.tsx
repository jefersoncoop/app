'use client';

import { createScheduleSlot, deleteScheduleRegistration, deleteScheduleSlot } from '@/actions/schedule-actions';
import { CalendarClock, FileText, Loader2, MapPin, Trash2, Users } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

type CampaignOption = {
    id: string;
    name?: string;
    slug?: string;
};

type Slot = {
    id: string;
    location?: string;
    date?: string;
    time?: string;
    endTime?: string;
    capacity?: number;
    bookedCount?: number;
    active?: boolean;
};

type Registration = {
    id: string;
    name?: string;
    cpf?: string;
    phone?: string;
    location?: string;
    date?: string;
    time?: string;
    endTime?: string;
    createdAt?: string;
};

function formatDate(date?: string) {
    if (!date) return '';
    const [year, month, day] = date.split('-');
    return `${day}/${month}/${year}`;
}

function formatCpf(cpf?: string) {
    const digits = (cpf || '').replace(/\D/g, '');
    return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
}

function maskCpf(cpf?: string) {
    const digits = (cpf || '').replace(/\D/g, '');
    if (digits.length !== 11) return cpf || '';
    return `${digits.slice(0, 3)}.***.***-${digits.slice(9)}`;
}

export default function ScheduleAdmin({
    campaigns,
    selectedCampaignId,
    slots,
    registrations,
}: {
    campaigns: CampaignOption[];
    selectedCampaignId?: string;
    slots: Slot[];
    registrations: Registration[];
}) {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const selectedCampaign = campaigns.find(campaign => campaign.id === selectedCampaignId);
    const inputClassName = "w-full p-3 border rounded-lg text-gray-900 placeholder:text-gray-400 bg-white";
    const attendanceDates = Array.from(new Set(registrations.map(registration => registration.date).filter(Boolean) as string[]))
        .sort((a, b) => a.localeCompare(b));

    const handleCampaignChange = (campaignId: string) => {
        router.push(campaignId ? `/admin/schedules?campaignId=${campaignId}` : '/admin/schedules');
    };

    const handleCreate = async (formData: FormData) => {
        if (!selectedCampaignId) {
            alert('Selecione uma campanha.');
            return;
        }

        setIsSubmitting(true);
        const result = await createScheduleSlot({
            campaignId: selectedCampaignId,
            location: String(formData.get('location') || ''),
            date: String(formData.get('date') || ''),
            time: String(formData.get('time') || ''),
            endTime: String(formData.get('endTime') || ''),
            capacity: Number(formData.get('capacity') || 1),
            active: true,
        });
        setIsSubmitting(false);

        if (!result.success) {
            alert(result.message || 'Erro ao cadastrar horário.');
            return;
        }

        const form = document.getElementById('schedule-slot-form') as HTMLFormElement | null;
        form?.reset();
        router.refresh();
    };

    const handleDelete = (slotId: string) => {
        if (!confirm('Excluir este horário?')) return;

        startTransition(async () => {
            const result = await deleteScheduleSlot(slotId);
            if (!result.success) {
                alert(result.message || 'Erro ao excluir horário.');
                return;
            }
            router.refresh();
        });
    };

    const handleDeleteRegistration = (registrationId: string) => {
        if (!confirm('Excluir este agendamento? A vaga será liberada novamente.')) return;

        startTransition(async () => {
            const result = await deleteScheduleRegistration(registrationId);
            if (!result.success) {
                alert(result.message || 'Erro ao excluir agendamento.');
                return;
            }
            router.refresh();
        });
    };

    return (
        <div className="space-y-6">
            <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
                <label className="block text-sm font-bold text-gray-600 mb-2">Campanha</label>
                <select
                    value={selectedCampaignId || ''}
                    onChange={(event) => handleCampaignChange(event.target.value)}
                    className="w-full max-w-xl p-3 border rounded-lg bg-white text-[#002B49] font-bold"
                >
                    <option value="">Selecione uma campanha...</option>
                    {campaigns.map(campaign => (
                        <option key={campaign.id} value={campaign.id}>{campaign.name}</option>
                    ))}
                </select>
                {selectedCampaign?.slug && (
                    <div className="flex flex-wrap items-center gap-4 mt-4">
                        <a
                            href={`/a/${selectedCampaign.slug}`}
                            target="_blank"
                            className="inline-flex items-center gap-2 text-sm font-bold text-blue-600 hover:underline"
                        >
                            Link público: /a/{selectedCampaign.slug}
                        </a>
                        {attendanceDates.length > 0 && (
                            <div className="flex flex-wrap items-center gap-2">
                                <span className="text-sm font-bold text-gray-500">Lista de presença:</span>
                                {attendanceDates.map(date => (
                                    <a
                                        key={date}
                                        href={`/api/schedules/attendance?campaignId=${selectedCampaignId}&date=${date}`}
                                        target="_blank"
                                        className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs font-black text-[#002B49] hover:bg-gray-100"
                                    >
                                        <FileText size={14} />
                                        {formatDate(date)}
                                    </a>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {selectedCampaignId && (
                <div className="grid grid-cols-1 xl:grid-cols-[420px_1fr] gap-6 items-start">
                    <form
                        id="schedule-slot-form"
                        action={handleCreate}
                        className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm space-y-5"
                    >
                        <div className="flex items-center gap-3 border-b pb-4">
                            <CalendarClock className="text-[#002B49]" />
                            <h2 className="text-xl font-black text-[#002B49]">Novo Horário</h2>
                        </div>

                        <div>
                            <label className="block font-bold text-gray-700 mb-2">Local</label>
                            <input name="location" required className={inputClassName} placeholder="Ex: Escola Municipal..." />
                        </div>

                        <div className="grid grid-cols-3 gap-4">
                            <div>
                                <label className="block font-bold text-gray-700 mb-2">Data</label>
                                <input name="date" type="date" required className={inputClassName} />
                            </div>
                            <div>
                                <label className="block font-bold text-gray-700 mb-2">Horário</label>
                                <input name="time" type="time" required className={inputClassName} />
                            </div>
                            <div>
                                <label className="block font-bold text-gray-700 mb-2">Fim</label>
                                <input name="endTime" type="time" required className={inputClassName} />
                            </div>
                        </div>

                        <div>
                            <label className="block font-bold text-gray-700 mb-2">Quantidade de vagas</label>
                            <input name="capacity" type="number" min="1" defaultValue="1" required className={inputClassName} />
                        </div>

                        <button
                            type="submit"
                            disabled={isSubmitting}
                            className="w-full bg-[#002B49] text-white p-4 rounded-xl font-black flex items-center justify-center gap-2 hover:bg-[#001f35] disabled:opacity-50"
                        >
                            {isSubmitting ? <Loader2 className="animate-spin" /> : <CalendarClock />}
                            Cadastrar Horário
                        </button>
                    </form>

                    <div className="space-y-6">
                        <section className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
                            <div className="p-5 border-b flex items-center justify-between">
                                <h2 className="text-xl font-black text-[#002B49]">Horários Disponíveis</h2>
                                <span className="text-sm font-bold text-gray-500">{slots.length} cadastrado(s)</span>
                            </div>
                            <div className="divide-y">
                                {slots.map(slot => {
                                    const booked = Number(slot.bookedCount || 0);
                                    const capacity = Number(slot.capacity || 0);
                                    return (
                                        <div key={slot.id} className="p-5 flex items-center justify-between gap-4">
                                            <div>
                                                <p className="font-black text-[#002B49]">{formatDate(slot.date)} das {slot.time}{slot.endTime ? ` às ${slot.endTime}` : ''}</p>
                                                <p className="text-sm text-gray-500 flex items-center gap-1 mt-1">
                                                    <MapPin size={14} /> {slot.location}
                                                </p>
                                                <p className="text-sm text-gray-500 flex items-center gap-1 mt-1">
                                                    <Users size={14} /> {booked}/{capacity} inscritos
                                                </p>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => handleDelete(slot.id)}
                                                disabled={isPending || booked > 0}
                                                title={booked > 0 ? 'Horários com inscritos não podem ser excluídos' : 'Excluir horário'}
                                                className="p-3 rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-gray-400"
                                            >
                                                <Trash2 size={20} />
                                            </button>
                                        </div>
                                    );
                                })}
                                {slots.length === 0 && (
                                    <p className="p-8 text-center text-gray-400">Nenhum horário cadastrado para esta campanha.</p>
                                )}
                            </div>
                        </section>

                        <section className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
                            <div className="p-5 border-b flex items-center justify-between">
                                <h2 className="text-xl font-black text-[#002B49]">Inscritos</h2>
                                <span className="text-sm font-bold text-gray-500">{registrations.length} agendamento(s)</span>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full text-left">
                                    <thead className="bg-gray-50 text-sm text-gray-600">
                                        <tr>
                                            <th className="p-4">Nome</th>
                                            <th className="p-4">CPF</th>
                                            <th className="p-4">Telefone</th>
                                            <th className="p-4">Data/Hora</th>
                                            <th className="p-4">Local</th>
                                            <th className="p-4 text-right">Ações</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {registrations.map(registration => (
                                            <tr key={registration.id} className="border-t">
                                                <td className="p-4 font-bold text-[#002B49]">{registration.name}</td>
                                                <td className="p-4 text-sm text-gray-600" title={formatCpf(registration.cpf)}>{maskCpf(registration.cpf)}</td>
                                                <td className="p-4 text-sm text-gray-600">{registration.phone}</td>
                                                <td className="p-4 text-sm text-gray-600">{formatDate(registration.date)} das {registration.time}{registration.endTime ? ` às ${registration.endTime}` : ''}</td>
                                                <td className="p-4 text-sm text-gray-600">{registration.location}</td>
                                                <td className="p-4 text-right">
                                                    <button
                                                        type="button"
                                                        onClick={() => handleDeleteRegistration(registration.id)}
                                                        disabled={isPending}
                                                        title="Excluir agendamento"
                                                        className="inline-flex rounded-lg p-2 text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
                                                    >
                                                        <Trash2 size={18} />
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                        {registrations.length === 0 && (
                                            <tr>
                                                <td colSpan={6} className="p-8 text-center text-gray-400">Nenhum candidato agendado ainda.</td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </section>
                    </div>
                </div>
            )}
        </div>
    );
}
