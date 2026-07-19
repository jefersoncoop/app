'use client';

import { useState } from 'react';
import { BriefcaseBusiness, CheckCircle2, Loader2, MapPin, MessageCircle, XCircle } from 'lucide-react';
import { sendCandidateConvocation } from '@/actions/convocation-actions';

type LatestConvocation = {
    token?: string;
    jobTitle?: string;
    location?: string;
    status?: 'sending' | 'sent' | 'send_failed' | 'confirmed';
    sentAt?: string | null;
    confirmedAt?: string | null;
};

export function ConvocationPanel({
    proposalId,
    defaultJobTitle,
    latestConvocation,
}: {
    proposalId: string;
    defaultJobTitle?: string;
    latestConvocation?: LatestConvocation | null;
}) {
    const [jobTitle, setJobTitle] = useState(latestConvocation?.jobTitle || defaultJobTitle || '');
    const [location, setLocation] = useState(latestConvocation?.location || '');
    const [current, setCurrent] = useState<LatestConvocation | null>(latestConvocation || null);
    const [submitting, setSubmitting] = useState(false);
    const [feedback, setFeedback] = useState<{ success: boolean; message: string } | null>(null);

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!confirm('Enviar esta convocação para o WhatsApp do candidato?')) return;

        setSubmitting(true);
        setFeedback(null);
        try {
            const result = await sendCandidateConvocation({ proposalId, jobTitle, location });
            setFeedback({ success: result.success, message: result.message });
            if (result.convocation) setCurrent(result.convocation);
        } catch {
            setFeedback({ success: false, message: 'Erro ao enviar a convocação.' });
        } finally {
            setSubmitting(false);
        }
    };

    const statusMeta = current?.status === 'confirmed'
        ? { label: 'Comparecimento confirmado', className: 'bg-green-100 text-green-700', icon: CheckCircle2 }
        : current?.status === 'sent'
            ? { label: 'Aguardando confirmação', className: 'bg-yellow-100 text-yellow-700', icon: MessageCircle }
            : current?.status === 'send_failed'
                ? { label: 'Falha no disparo', className: 'bg-red-100 text-red-700', icon: XCircle }
                : null;
    const StatusIcon = statusMeta?.icon;

    return (
        <section className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-4 mb-5">
                <div>
                    <h3 className="text-lg font-bold text-[#002B49] flex items-center gap-2">
                        <MessageCircle size={20} className="text-green-600" />
                        Convocação via WhatsApp
                    </h3>
                    <p className="text-sm text-gray-500 mt-1">Envie o cargo, o local e um link individual para confirmação.</p>
                </div>
                {statusMeta && StatusIcon && (
                    <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-black uppercase ${statusMeta.className}`}>
                        <StatusIcon size={15} /> {statusMeta.label}
                    </span>
                )}
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <label className="block">
                        <span className="flex items-center gap-2 text-sm font-bold text-gray-700 mb-2">
                            <BriefcaseBusiness size={16} /> Cargo
                        </span>
                        <input
                            value={jobTitle}
                            onChange={event => setJobTitle(event.target.value)}
                            required
                            maxLength={120}
                            placeholder="Ex: Professor de Matemática"
                            className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-[#002B49] outline-none focus:border-[#002B49] focus:ring-2 focus:ring-[#002B49]/10"
                        />
                    </label>
                    <label className="block">
                        <span className="flex items-center gap-2 text-sm font-bold text-gray-700 mb-2">
                            <MapPin size={16} /> Local de comparecimento
                        </span>
                        <input
                            value={location}
                            onChange={event => setLocation(event.target.value)}
                            required
                            maxLength={240}
                            placeholder="Endereço ou unidade onde deve comparecer"
                            className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-[#002B49] outline-none focus:border-[#002B49] focus:ring-2 focus:ring-[#002B49]/10"
                        />
                    </label>
                </div>

                {current && (
                    <div className="rounded-xl bg-gray-50 border border-gray-100 p-4 text-sm text-gray-600">
                        <p><strong>Cargo:</strong> {current.jobTitle}</p>
                        <p className="mt-1"><strong>Local:</strong> {current.location}</p>
                        {current.confirmedAt && (
                            <p className="mt-1"><strong>Confirmado em:</strong> {new Date(current.confirmedAt).toLocaleString('pt-BR')}</p>
                        )}
                    </div>
                )}

                {feedback && (
                    <div className={`rounded-xl border p-3 text-sm font-bold ${feedback.success ? 'border-green-200 bg-green-50 text-green-700' : 'border-red-200 bg-red-50 text-red-700'}`}>
                        {feedback.message}
                    </div>
                )}

                <button
                    type="submit"
                    disabled={submitting}
                    className="inline-flex w-full md:w-auto items-center justify-center gap-2 rounded-xl bg-green-600 px-6 py-3 font-black text-white transition-colors hover:bg-green-700 disabled:opacity-50"
                >
                    {submitting ? <Loader2 className="animate-spin" size={18} /> : <MessageCircle size={18} />}
                    {submitting ? 'ENVIANDO...' : current ? 'ENVIAR NOVA CONVOCAÇÃO' : 'ENVIAR CONVOCAÇÃO'}
                </button>
            </form>
        </section>
    );
}

