import { getCampaignBySlug } from "@/actions/campaign-actions";
import { getAvailableScheduleSlots } from "@/actions/schedule-actions";
import SchedulePublicForm from "@/components/scheduling/schedule-public-form";
import { Metadata } from "next";
import { notFound } from "next/navigation";

interface Params {
    params: Promise<{ slug: string }>;
}

export async function generateMetadata(props: Params): Promise<Metadata> {
    const params = await props.params;
    const campaign = await getCampaignBySlug(params.slug);

    if (!campaign) {
        return {
            title: 'Agendamento não encontrado',
        };
    }

    return {
        title: `Agendamento - ${campaign.name}`,
        description: `Escolha seu horário para ${campaign.name}`,
    };
}

export default async function PublicSchedulePage(props: Params) {
    const params = await props.params;
    const campaign = await getCampaignBySlug(params.slug);
    if (!campaign) return notFound();

    const slots = await getAvailableScheduleSlots(campaign.id);

    return (
        <SchedulePublicForm
            campaign={campaign}
            slots={slots}
        />
    );
}

