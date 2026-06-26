'use client';

import { registerScheduleCandidate } from '@/actions/schedule-actions';
import { CalendarCheck, CheckCircle, Loader2, MapPin, Phone } from 'lucide-react';
import { useMemo, useState } from 'react';

type Slot = {
    id: string;
    location?: string;
    date?: string;
    time?: string;
    endTime?: string;
    capacity?: number;
    bookedCount?: number;
};

function formatDate(date?: string) {
    if (!date) return '';
    const [year, month, day] = date.split('-');
    return `${day}/${month}/${year}`;
}

function formatCpf(value: string) {
    const digits = value.replace(/\D/g, '').slice(0, 11);
    return digits
        .replace(/(\d{3})(\d)/, '$1.$2')
        .replace(/(\d{3})(\d)/, '$1.$2')
        .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
}

function formatPhone(value: string) {
    const digits = value.replace(/\D/g, '').slice(0, 11);
    if (digits.length > 10) return digits.replace(/^(\d{2})(\d{5})(\d{4}).*/, '($1) $2-$3');
    return digits.replace(/^(\d{2})(\d{4})(\d{0,4}).*/, '($1) $2-$3');
}

export default function SchedulePublicForm({
    campaign,
    slots,
}: {
    campaign: { id: string; name?: string; bannerUrl?: string };
    slots: Slot[];
}) {
    const [name, setName] = useState('');
    const [cpf, setCpf] = useState('');
    const [phone, setPhone] = useState('');
    const [slotId, setSlotId] = useState(slots[0]?.id || '');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [message, setMessage] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const selectedSlot = useMemo(() => slots.find(slot => slot.id === slotId), [slots, slotId]);
    const inputClassName = "w-full p-4 border-2 rounded-xl text-lg text-gray-900 placeholder:text-gray-400 bg-white focus:outline-none focus:border-[#002B49]";

    const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setIsSubmitting(true);
        setError(null);
        setMessage(null);

        const result = await registerScheduleCandidate({
            campaignId: campaign.id,
            slotId,
            name,
            cpf,
            phone,
        });

        setIsSubmitting(false);

        if (!result.success) {
            setError(result.message || 'Não foi possível confirmar o agendamento.');
            return;
        }

        setMessage(result.message || 'Agendamento confirmado.');
    };

    if (message) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
                <div className="w-full max-w-xl bg-white rounded-2xl border border-gray-200 shadow-sm p-8 text-center space-y-6">
                    <div className="w-20 h-20 rounded-full bg-green-100 mx-auto flex items-center justify-center">
                        <CheckCircle className="text-green-600" size={44} />
                    </div>
                    <div>
                        <h1 className="text-3xl font-black text-[#002B49]">Agendamento Confirmado</h1>
                        <p className="text-gray-600 mt-2">{message}</p>
                    </div>
                    {selectedSlot && (
                        <div className="bg-gray-50 border rounded-xl p-5 text-left space-y-2">
                            <p className="font-black text-[#002B49]">{formatDate(selectedSlot.date)} das {selectedSlot.time}{selectedSlot.endTime ? ` às ${selectedSlot.endTime}` : ''}</p>
                            <p className="text-gray-600 flex items-center gap-2"><MapPin size={16} /> {selectedSlot.location}</p>
                        </div>
                    )}
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50">
            <header className="bg-[#002B49] text-white">
                <div className="max-w-3xl mx-auto px-6 py-8">
                    {campaign.bannerUrl && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={campaign.bannerUrl} alt={campaign.name || 'Campanha'} className="w-full max-h-64 object-contain rounded-xl mb-6 bg-white" />
                    )}
                    <p className="text-sm font-bold text-[#CCFF00] uppercase tracking-widest">Agendamento</p>
                    <h1 className="text-3xl sm:text-4xl font-black mt-2">{campaign.name}</h1>
                </div>
            </header>

            <main className="max-w-3xl mx-auto p-6">
                <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 sm:p-8 space-y-6">
                    <div className="flex items-center gap-3 border-b pb-4">
                        <CalendarCheck className="text-[#002B49]" size={28} />
                        <h2 className="text-2xl font-black text-[#002B49]">Escolha seu horário</h2>
                    </div>

                    {error && (
                        <div className="bg-red-50 border border-red-100 text-red-700 p-4 rounded-xl font-semibold text-sm">
                            {error}
                        </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="sm:col-span-2">
                            <label className="block font-bold text-gray-700 mb-2">Nome completo</label>
                            <input value={name} onChange={(event) => setName(event.target.value.toUpperCase())} required className={inputClassName} />
                        </div>
                        <div>
                            <label className="block font-bold text-gray-700 mb-2">CPF</label>
                            <input value={cpf} onChange={(event) => setCpf(formatCpf(event.target.value))} required inputMode="numeric" className={inputClassName} placeholder="000.000.000-00" />
                        </div>
                        <div>
                            <label className="block font-bold text-gray-700 mb-2">Telefone/WhatsApp</label>
                            <input value={phone} onChange={(event) => setPhone(formatPhone(event.target.value))} required inputMode="tel" className={inputClassName} placeholder="(00) 00000-0000" />
                        </div>
                    </div>

                    <div>
                        <label className="block font-bold text-gray-700 mb-3">Data, horário e local</label>
                        {slots.length > 0 ? (
                            <div className="space-y-3">
                                {slots.map(slot => {
                                    const remaining = Number(slot.capacity || 0) - Number(slot.bookedCount || 0);
                                    return (
                                        <label key={slot.id} className={`block border-2 rounded-xl p-4 cursor-pointer transition-colors ${slotId === slot.id ? 'border-[#002B49] bg-blue-50' : 'border-gray-200 hover:border-gray-300'}`}>
                                            <div className="flex items-start gap-3">
                                                <input type="radio" name="slotId" value={slot.id} checked={slotId === slot.id} onChange={() => setSlotId(slot.id)} className="mt-1 w-5 h-5 accent-[#002B49]" />
                                                <div>
                                                    <p className="font-black text-[#002B49]">{formatDate(slot.date)} das {slot.time}{slot.endTime ? ` às ${slot.endTime}` : ''}</p>
                                                    <p className="text-gray-600 flex items-center gap-2 mt-1"><MapPin size={16} /> {slot.location}</p>
                                                    <p className="text-xs font-bold text-gray-400 mt-2">{remaining} vaga(s) restante(s)</p>
                                                </div>
                                            </div>
                                        </label>
                                    );
                                })}
                            </div>
                        ) : (
                            <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 p-5 rounded-xl font-semibold">
                                Não há horários disponíveis para esta campanha no momento.
                            </div>
                        )}
                    </div>

                    <button
                        type="submit"
                        disabled={isSubmitting || slots.length === 0}
                        className="w-full bg-[#CCFF00] text-[#002B49] p-5 rounded-2xl font-black text-lg flex items-center justify-center gap-3 hover:bg-[#b8e600] disabled:opacity-50"
                    >
                        {isSubmitting ? <Loader2 className="animate-spin" /> : <Phone />}
                        Confirmar e Receber no WhatsApp
                    </button>
                </form>
            </main>
        </div>
    );
}
