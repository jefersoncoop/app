import Link from 'next/link';
import { getCampaigns } from '@/actions/campaign-actions';
import { Plus, Edit, ExternalLink } from 'lucide-react';

export default async function AdminCampaignsPage() {
    const campaigns = await getCampaigns();

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h1 className="text-3xl font-bold text-gray-800">Campanhas</h1>
                <Link href="/admin/campaigns/new" className="bg-[#002B49] text-white px-6 py-3 rounded-full font-bold flex items-center gap-2 hover:bg-[#001f35]">
                    <Plus size={20} /> Nova Campanha
                </Link>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                <table className="w-full text-left">
                    <thead className="bg-gray-50 border-b">
                        <tr>
                            <th className="p-4 font-bold text-gray-600">Nome</th>
                            <th className="p-4 font-bold text-gray-600">Slug / Link</th>
                            <th className="p-4 font-bold text-gray-600">CRM Config</th>
                            <th className="p-4 font-bold text-gray-600">Status</th>
                            <th className="p-4 font-bold text-gray-600 text-right">Ações</th>
                        </tr>
                    </thead>
                    <tbody>
                        {campaigns.map((c: any) => (
                            <tr key={c.id} className="border-b last:border-0 hover:bg-gray-50">
                                <td className="p-4">
                                    <span className="font-bold text-[#002B49]">{c.name}</span>
                                </td>
                                <td className="p-4">
                                    <div className="flex items-center gap-2 text-sm text-blue-600">
                                        <span>/c/{c.slug}</span>
                                        <a href={`/c/${c.slug}`} target="_blank" className="hover:underline"><ExternalLink size={14} /></a>
                                    </div>
                                </td>
                                <td className="p-4 text-sm text-gray-500">
                                    Client: {c.clientId} <br /> Func: {c.functionId}
                                </td>
                                <td className="p-4">
                                    <span className={`px-3 py-1 rounded-full text-xs font-bold ${c.active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                        {c.active ? 'Ativa' : 'Inativa'}
                                    </span>
                                </td>
                                <td className="p-4 text-right">
                                    <Link href={`/admin/campaigns/${c.id}`} className="inline-block p-2 text-gray-500 hover:text-[#002B49] hover:bg-gray-100 rounded-lg">
                                        <Edit size={20} />
                                    </Link>
                                </td>
                            </tr>
                        ))}
                        {campaigns.length === 0 && (
                            <tr>
                                <td colSpan={5} className="p-8 text-center text-gray-400">Nenhuma campanha encontrada.</td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
