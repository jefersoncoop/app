import { getCampaigns } from "@/actions/campaign-actions";
import { getScheduleDashboard, ScheduleRegistration, ScheduleSlot } from "@/actions/schedule-actions";
import ScheduleAdmin from "@/components/scheduling/schedule-admin";

interface Props {
    searchParams: Promise<{ campaignId?: string }>;
}

export default async function AdminSchedulesPage(props: Props) {
    const searchParams = await props.searchParams;
    const campaigns = await getCampaigns();
    const selectedCampaignId = searchParams.campaignId;
    const dashboard = await getScheduleDashboard(selectedCampaignId);

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold text-gray-800">Agendamentos</h1>
                <p className="text-gray-500 mt-1">Cadastre horários e acompanhe os candidatos agendados por campanha.</p>
            </div>

            <ScheduleAdmin
                campaigns={campaigns as { id: string; name?: string; slug?: string }[]}
                selectedCampaignId={selectedCampaignId}
                slots={dashboard.slots as ScheduleSlot[]}
                registrations={dashboard.registrations as ScheduleRegistration[]}
            />
        </div>
    );
}
