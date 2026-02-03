import { NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin';

export async function GET() {
    console.log("Testing Firebase from API Route...");
    try {
        const db = getAdminDb();
        const collections = await db.listCollections();
        const colNames = collections.map(c => c.id);
        console.log("Connected! Collections:", colNames);

        // Write test
        try {
            const res = await db.collection('test_verification').add({
                timestamp: new Date().toISOString(),
                message: "Hello from API Route"
            });
            return NextResponse.json({ success: true, collections: colNames, writtenId: res.id });
        } catch (writeErr) {
            console.error("Write error", writeErr);
            return NextResponse.json({ success: false, error: "Write failed", details: String(writeErr) }, { status: 500 });
        }

    } catch (error) {
        console.error("Connection Failed:", error);
        return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
    }
}
