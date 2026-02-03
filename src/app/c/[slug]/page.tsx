import { notFound } from 'next/navigation';
import { getCampaignBySlug } from '@/actions/campaign-actions';
import CoopeduFormMaster from '@/components/coopedu-form';

interface Params {
    params: Promise<{ slug: string }>;
}

export default async function CampaignPage(props: Params) {
    const params = await props.params;
    const campaign = await getCampaignBySlug(params.slug);

    if (!campaign) return notFound();

    return (
        <main className="min-h-screen bg-gray-50 flex flex-col justify-center">
            {/* Pass campaign data to the client form */}
            <CoopeduFormMaster campaign={campaign} />
        </main>
    );
}
