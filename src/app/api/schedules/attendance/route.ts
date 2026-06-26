import { getAdminDb } from "@/lib/firebase-admin";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

export const runtime = 'nodejs';

type AttendanceRow = {
    name: string;
    cpf: string;
    time: string;
    endTime?: string;
    location: string;
};

function formatDate(date: string) {
    const [year, month, day] = date.split('-');
    return `${day}/${month}/${year}`;
}

function maskCpf(cpf: string) {
    const digits = (cpf || '').replace(/\D/g, '');
    if (digits.length !== 11) return cpf || '';
    return `${digits.slice(0, 3)}.***.***-${digits.slice(9)}`;
}

function normalizeText(value: string) {
    return String(value || '').replace(/\s+/g, ' ').trim();
}

function pdfText(value: string) {
    const text = normalizeText(value)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/ç/g, 'c')
        .replace(/Ç/g, 'C')
        .replace(/[^\x20-\x7E]/g, '')
        .replace(/\\/g, '\\\\')
        .replace(/\(/g, '\\(')
        .replace(/\)/g, '\\)');
    return `(${text})`;
}

function textOp(text: string, x: number, y: number, size = 10, font = 'F1') {
    return `BT /${font} ${size} Tf ${x} ${y} Td ${pdfText(text)} Tj ET\n`;
}

function lineOp(x1: number, y1: number, x2: number, y2: number) {
    return `${x1} ${y1} m ${x2} ${y2} l S\n`;
}

function rectOp(x: number, y: number, width: number, height: number) {
    return `${x} ${y} ${width} ${height} re S\n`;
}

function truncate(value: string, maxLength: number) {
    const text = normalizeText(value);
    return text.length > maxLength ? `${text.slice(0, maxLength - 3)}...` : text;
}

function buildPageContent(params: {
    campaignName: string;
    date: string;
    rows: AttendanceRow[];
    page: number;
    totalPages: number;
}) {
    const { campaignName, date, rows, page, totalPages } = params;
    const left = 54;
    const top = 558;
    const tableTop = 472;
    const rowHeight = 34;
    const columns = {
        time: { x: left, width: 90, title: 'Horario' },
        name: { x: left + 90, width: 280, title: 'Nome' },
        cpf: { x: left + 370, width: 126, title: 'CPF' },
        signature: { x: left + 496, width: 256, title: 'Assinatura' },
    };
    const tableWidth = 752;
    const tableHeight = 26 + rows.length * rowHeight;

    let content = '';
    content += '0.08 0.17 0.29 RG\n';
    content += textOp('Lista de Presenca', left, top, 22, 'F2');
    content += textOp(campaignName, left, top - 28, 13, 'F2');
    content += textOp(`Data: ${formatDate(date)}`, left, top - 48, 11);
    content += textOp(`Pagina ${page} de ${totalPages}`, 736, top - 48, 10);

    content += '0.76 0.76 0.76 RG\n';
    content += rectOp(left, tableTop - tableHeight, tableWidth, tableHeight);
    content += lineOp(left, tableTop - 26, left + tableWidth, tableTop - 26);
    content += lineOp(columns.name.x, tableTop, columns.name.x, tableTop - tableHeight);
    content += lineOp(columns.cpf.x, tableTop, columns.cpf.x, tableTop - tableHeight);
    content += lineOp(columns.signature.x, tableTop, columns.signature.x, tableTop - tableHeight);

    for (let index = 0; index <= rows.length; index += 1) {
        const y = tableTop - 26 - index * rowHeight;
        content += lineOp(left, y, left + tableWidth, y);
    }

    content += '0.08 0.17 0.29 RG\n';
    content += textOp(columns.time.title, columns.time.x + 8, tableTop - 18, 10, 'F2');
    content += textOp(columns.name.title, columns.name.x + 8, tableTop - 18, 10, 'F2');
    content += textOp(columns.cpf.title, columns.cpf.x + 8, tableTop - 18, 10, 'F2');
    content += textOp(columns.signature.title, columns.signature.x + 8, tableTop - 18, 10, 'F2');

    rows.forEach((row, index) => {
        const y = tableTop - 50 - index * rowHeight;
        const signatureLineY = y - 6;
        const timeRange = row.endTime ? `${row.time} - ${row.endTime}` : row.time;
        content += textOp(timeRange, columns.time.x + 8, y, 9);
        content += textOp(truncate(row.name, 42), columns.name.x + 8, y, 9);
        content += textOp(maskCpf(row.cpf), columns.cpf.x + 8, y, 9);
        content += '0.50 0.50 0.50 RG\n';
        content += lineOp(columns.signature.x + 36, signatureLineY, columns.signature.x + columns.signature.width - 36, signatureLineY);
        content += '0.08 0.17 0.29 RG\n';
    });

    content += '0.40 0.40 0.40 RG\n';
    content += textOp(`Gerado em ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Fortaleza' })}`, left, 26, 8);

    return content;
}

function buildPdf(campaignName: string, date: string, rows: AttendanceRow[]) {
    const pageSize = { width: 842, height: 595 };
    const rowsPerPage = 12;
    const pages: string[] = [];
    const totalPages = Math.max(Math.ceil(rows.length / rowsPerPage), 1);

    for (let page = 1; page <= totalPages; page += 1) {
        pages.push(buildPageContent({
            campaignName,
            date,
            rows: rows.slice((page - 1) * rowsPerPage, page * rowsPerPage),
            page,
            totalPages,
        }));
    }

    const objects: string[] = [];
    const addObject = (body: string) => {
        objects.push(body);
        return objects.length;
    };

    const fontRegularId = addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
    const fontBoldId = addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>');
    const pageIds: number[] = [];

    pages.forEach((content) => {
        const contentBuffer = Buffer.from(content, 'utf8');
        const contentId = addObject(`<< /Length ${contentBuffer.length} >>\nstream\n${content}\nendstream`);
        const pageId = addObject(`<< /Type /Page /Parent 0 0 R /MediaBox [0 0 ${pageSize.width} ${pageSize.height}] /Resources << /Font << /F1 ${fontRegularId} 0 R /F2 ${fontBoldId} 0 R >> >> /Contents ${contentId} 0 R >>`);
        pageIds.push(pageId);
    });

    const pagesId = addObject(`<< /Type /Pages /Kids [${pageIds.map(id => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`);
    const catalogId = addObject(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);

    pageIds.forEach((pageId) => {
        objects[pageId - 1] = objects[pageId - 1].replace('/Parent 0 0 R', `/Parent ${pagesId} 0 R`);
    });

    let pdf = '%PDF-1.4\n';
    const offsets = [0];
    objects.forEach((body, index) => {
        offsets.push(Buffer.byteLength(pdf, 'utf8'));
        pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
    });

    const xrefOffset = Buffer.byteLength(pdf, 'utf8');
    pdf += `xref\n0 ${objects.length + 1}\n`;
    pdf += '0000000000 65535 f \n';
    for (let index = 1; index < offsets.length; index += 1) {
        pdf += `${String(offsets[index]).padStart(10, '0')} 00000 n \n`;
    }
    pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

    return Buffer.from(pdf, 'utf8');
}

export async function GET(request: NextRequest) {
    const session = (await cookies()).get('admin_session');
    if (!session) {
        return new NextResponse('Unauthorized', { status: 401 });
    }

    const campaignId = request.nextUrl.searchParams.get('campaignId') || '';
    const date = request.nextUrl.searchParams.get('date') || '';
    if (!campaignId || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return new NextResponse('Parâmetros inválidos.', { status: 400 });
    }

    const db = getAdminDb();
    const [campaignDoc, registrationsSnapshot] = await Promise.all([
        db.collection('campaigns').doc(campaignId).get(),
        db.collection('scheduleRegistrations')
            .where('campaignId', '==', campaignId)
            .where('date', '==', date)
            .get(),
    ]);

    if (!campaignDoc.exists) {
        return new NextResponse('Campanha não encontrada.', { status: 404 });
    }

    const rows = registrationsSnapshot.docs
        .map(doc => doc.data() as AttendanceRow)
        .sort((a, b) => `${a.name} ${a.time}`.localeCompare(`${b.name} ${b.time}`, 'pt-BR'));
    const campaignName = normalizeText(String(campaignDoc.data()?.name || 'Campanha'));
    const pdf = buildPdf(campaignName, date, rows);
    const filename = `lista-presenca-${date}.pdf`;

    return new NextResponse(pdf, {
        headers: {
            'Content-Type': 'application/pdf',
            'Content-Disposition': `inline; filename="${filename}"`,
            'Cache-Control': 'no-store',
        },
    });
}
