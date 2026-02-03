'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

export async function login(formData: FormData) {
    const user = formData.get('user');
    const pass = formData.get('pass');

    // Hardcoded credentials for simplicity as per plan
    if (user === 'admin' && pass === 'coopedu2024') {
        const expires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 1 day
        (await cookies()).set('admin_session', 'true', {
            expires,
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            path: '/'
        });
        return { success: true };
    }

    return { success: false, message: 'Credenciais inválidas' };
}

export async function logout() {
    (await cookies()).delete('admin_session');
    redirect('/admin/login');
}
