'use client';

import { useState } from 'react';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { confirmCandidateAttendance } from '@/actions/convocation-actions';

export function ConfirmationClient({ token, alreadyConfirmed }: { token: string; alreadyConfirmed: boolean }) {
    const [confirmed, setConfirmed] = useState(alreadyConfirmed);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');

    const confirm = async () => {
        setSubmitting(true);
        setError('');
        const result = await confirmCandidateAttendance(token);
        setSubmitting(false);
        if (result.success) setConfirmed(true);
        else setError(result.message);
    };

    if (confirmed) {
        return (
            <div className="rounded-2xl border border-green-200 bg-green-50 p-5 text-center text-green-800">
                <CheckCircle2 className="mx-auto mb-2" size={36} />
                <p className="text-lg font-black">Comparecimento confirmado!</p>
                <p className="mt-1 text-sm">Sua resposta foi registrada. Aguardamos você no local informado.</p>
            </div>
        );
    }

    return (
        <div>
            <button
                type="button"
                onClick={confirm}
                disabled={submitting}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#002B49] px-6 py-4 font-black text-white hover:bg-[#001f35] disabled:opacity-50"
            >
                {submitting ? <Loader2 className="animate-spin" size={20} /> : <CheckCircle2 size={20} />}
                {submitting ? 'CONFIRMANDO...' : 'CONFIRMAR COMPARECIMENTO'}
            </button>
            {error && <p className="mt-3 rounded-lg bg-red-50 p-3 text-center text-sm font-bold text-red-700">{error}</p>}
        </div>
    );
}

