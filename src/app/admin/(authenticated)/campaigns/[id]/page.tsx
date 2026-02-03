import CampaignForm from "@/components/admin/campaign-form";
import { getCampaignById } from "@/actions/campaign-actions";
import { notFound } from "next/navigation";

interface Params {
    params: Promise<{ id: string }>;
}

export default async function EditCampaignPage(props: Params) {
    const params = await props.params;
    const campaign = await getCampaignById(params.id);

    if (!campaign) return notFound();

    return (
        <div className="space-y-6">
            <h1 className="text-3xl font-bold text-gray-800">Editar Campanha</h1>
            <CampaignForm campaign={campaign} />
        </div>
    );
}
