import { BriefcaseBusiness, MapPin, MessageCircle } from 'lucide-react';
import { notFound } from 'next/navigation';
import { getPublicConvocation } from '@/actions/convocation-actions';
import { ConfirmationClient } from '@/components/convocations/confirmation-client';

export const dynamic = 'force-dynamic';

export default async function ConvocationPage({ params }: { params: Promise<{ token: string }> }) {
    const { token } = await params;
    const convocation = await getPublicConvocation(token);
    if (!convocation) notFound();

    return (
        <main className="min-h-screen bg-slate-100 px-4 py-10 text-[#002B49]">
            <div className="mx-auto max-w-xl overflow-hidden rounded-3xl bg-white shadow-xl">
                <header className="bg-[#002B49] p-7 text-white">
                    <div className="mb-4 inline-flex rounded-2xl bg-[#CCFF00] p-3 text-[#002B49]">
                        <MessageCircle size={28} />
                    </div>
                    <p className="text-sm font-bold uppercase tracking-widest text-[#CCFF00]">COOPEDU</p>
                    <h1 className="mt-2 text-3xl font-black">Convocação</h1>
                    <p className="mt-2 text-sm text-slate-300">Olá, {convocation.candidateName}. Confira abaixo os dados do seu comparecimento.</p>
                </header>

                <section className="space-y-6 p-7">
                    <div className="rounded-2xl border border-slate-200 p-5">
                        <div className="flex items-start gap-3">
                            <BriefcaseBusiness className="mt-0.5 shrink-0 text-[#002B49]" />
                            <div>
                                <p className="text-xs font-black uppercase tracking-wider text-slate-400">Cargo</p>
                                <p className="mt-1 text-lg font-black">{convocation.jobTitle}</p>
                            </div>
                        </div>
                        <div className="mt-5 flex items-start gap-3 border-t border-slate-100 pt-5">
                            <MapPin className="mt-0.5 shrink-0 text-[#002B49]" />
                            <div>
                                <p className="text-xs font-black uppercase tracking-wider text-slate-400">Local de comparecimento</p>
                                <p className="mt-1 whitespace-pre-wrap font-bold">{convocation.location}</p>
                            </div>
                        </div>
                    </div>

                    <ConfirmationClient token={token} alreadyConfirmed={convocation.status === 'confirmed'} />
                    <p className="text-center text-xs text-slate-400">Este link é individual. Não compartilhe com outras pessoas.</p>
                </section>
            </div>
        </main>
    );
}

