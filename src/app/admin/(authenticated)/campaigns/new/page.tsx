import CampaignForm from "@/components/admin/campaign-form";

export default function NewCampaignPage() {
    return (
        <div className="space-y-6">
            <h1 className="text-3xl font-bold text-gray-800">Nova Campanha</h1>
            <CampaignForm />
        </div>
    );
}
