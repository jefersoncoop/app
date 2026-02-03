'use client';

import { login } from '@/actions/auth-actions';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Lock } from 'lucide-react';

export default function LoginPage() {
    const [error, setError] = useState('');
    const router = useRouter();

    async function handleSubmit(formData: FormData) {
        const res = await login(formData);
        if (res.success) {
            router.push('/admin/proposals');
        } else {
            setError(res.message || 'Erro ao entrar');
        }
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-[#002B49] p-4">
            <div className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-md">
                <div className="text-center mb-8">
                    <div className="bg-lime-300 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                        <Lock className="text-[#002B49]" size={32} />
                    </div>
                    <h1 className="text-2xl font-black italic text-[#002B49]">ADMIN LOGIN</h1>
                    <p className="text-gray-500 text-sm">Acesso restrito à Coopperativa</p>
                </div>

                <form action={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1">Usuário</label>
                        <input
                            name="user"
                            type="text"
                            className="w-full p-3 border-2 border-gray-200 rounded-xl focus:border-[#CCFF00] focus:ring-2 focus:ring-[#CCFF00] outline-none transition-all uppercase"
                            placeholder="USUÁRIO"
                            required
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1">Senha</label>
                        <input
                            name="pass"
                            type="password"
                            className="w-full p-3 border-2 border-gray-200 rounded-xl focus:border-[#CCFF00] focus:ring-2 focus:ring-[#CCFF00] outline-none transition-all"
                            placeholder="••••••"
                            required
                        />
                    </div>

                    {error && <p className="text-red-500 text-sm font-bold text-center">{error}</p>}

                    <button
                        type="submit"
                        className="w-full bg-[#002B49] text-white py-4 rounded-xl font-bold hover:bg-[#001f35] transition-colors shadow-lg hover:shadow-xl transform active:scale-95 duration-200"
                    >
                        ENTRAR
                    </button>

                    <p className="text-center text-gray-400 text-xs mt-4">Cooperação Digital © 2024</p>
                </form>
            </div>
        </div>
    );
}
