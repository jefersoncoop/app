import { NextRequest, NextResponse } from "next/server";

const PLUGSIGN_API_URL = process.env.PLUGSIGN_API_URL || "https://app.plugsign.com.br";

function getPlugsignToken() {
    const token = process.env.PLUGSIGN_API_TOKEN || process.env.PLUGSIGN_TOKEN;

    if (!token) {
        throw new Error("PLUGSIGN_API_TOKEN não configurado no servidor.");
    }

    return token;
}

export async function GET(
    _req: NextRequest,
    context: { params: Promise<{ documentKey: string }> }
) {
    try {
        const { documentKey } = await context.params;
        const response = await fetch(`${PLUGSIGN_API_URL}/api/files/download/${encodeURIComponent(documentKey)}`, {
            method: "GET",
            headers: {
                "Authorization": getPlugsignToken(),
                "Accept": "application/pdf,application/octet-stream,application/json"
            }
        });

        if (!response.ok) {
            const message = await response.text().catch(() => `Erro ${response.status}`);
            return NextResponse.json({ error: message }, { status: response.status });
        }

        const contentType = response.headers.get("content-type") || "application/pdf";
        const contentDisposition = response.headers.get("content-disposition") || `attachment; filename="documento-${documentKey}.pdf"`;

        return new NextResponse(response.body, {
            status: 200,
            headers: {
                "Content-Type": contentType,
                "Content-Disposition": contentDisposition
            }
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : "Erro ao baixar documento.";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
