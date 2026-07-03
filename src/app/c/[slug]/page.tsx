import { notFound } from 'next/navigation';
import { getCampaignBySlug } from '@/actions/campaign-actions';
import { Metadata } from 'next';
import CoopeduFormMaster from '@/components/coopedu-form';
import CooperaFormMaster from '@/components/coopera-form';

interface Params {
    params: Promise<{ slug: string }>;
}

export async function generateMetadata(props: Params): Promise<Metadata> {
    const params = await props.params;
    const campaign = await getCampaignBySlug(params.slug);

    if (!campaign) {
        return {
            title: 'Campanha não encontrada',
            description: 'A campanha solicitada não foi encontrada.'
        };
    }

    return {
        title: campaign.name,
        description: campaign.name,
    };
}

export default async function CampaignPage(props: Params) {
    const params = await props.params;
    const campaign = await getCampaignBySlug(params.slug);

    if (!campaign) return notFound();

    return (
        <main className="min-h-screen bg-gray-50 flex flex-col justify-center">
            {campaign.formType === 'coopera' ? (
                <CooperaFormMaster campaign={campaign} />
            ) : (
                <CoopeduFormMaster campaign={campaign} />
            )}
        </main>
    );
}
