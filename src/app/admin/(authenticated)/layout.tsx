import Link from 'next/link';
import { LayoutDashboard, Users, Settings, LogOut } from 'lucide-react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { logout } from '@/actions/auth-actions';

export default async function AdminLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    // 1. Server-Side Protection
    const session = (await cookies()).get('admin_session');
    if (!session) {
        redirect('/admin/login');
    }

    return (
        <div className="min-h-screen bg-gray-100 flex font-sans">
            {/* Sidebar */}
            <aside className="w-64 bg-[#002B49] text-white flex flex-col">
                <div className="p-6">
                    <h1 className="text-2xl font-black italic text-[#CCFF00]">ADMIN</h1>
                    <p className="text-xs text-gray-400">Cooperação Digital</p>
                </div>

                <nav className="flex-1 px-4 space-y-2">
                    <Link href="/admin/campaigns" className="flex items-center gap-3 p-3 rounded-lg hover:bg-white/10 transition-colors text-gray-100">
                        <LayoutDashboard size={20} />
                        <span className="font-bold">Campanhas</span>
                    </Link>
                    <Link href="/admin/proposals" className="flex items-center gap-3 p-3 rounded-lg hover:bg-white/10 transition-colors text-gray-100">
                        <Users size={20} />
                        <span className="font-bold">Propostas</span>
                    </Link>
                    <div className="pt-4 border-t border-white/10 mt-4">
                        <form action={logout}>
                            <button type="submit" className="flex items-center gap-3 p-3 rounded-lg hover:bg-white/10 transition-colors text-gray-400 hover:text-white w-full text-left">
                                <LogOut size={20} />
                                <span>Sair</span>
                            </button>
                        </form>
                    </div>
                </nav>
            </aside>

            {/* Main Content */}
            <main className="flex-1 p-8 overflow-y-auto">
                {children}
            </main>
        </div>
    );
}
