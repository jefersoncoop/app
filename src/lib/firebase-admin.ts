import "server-only";
import { initializeApp, getApps, getApp, cert, ServiceAccount } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

export const runtime = 'nodejs'; // Enforce Node.js runtime for file system access

function getServiceAccount(): ServiceAccount | undefined {
    // 1. Try Environment Variables
    if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
        return {
            projectId: process.env.FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
        };
    }

    // 2. Try Local File (account.json in project root)
    try {
        const localPath = join(process.cwd(), 'account.json');
        if (existsSync(localPath)) {
            const fileContent = readFileSync(localPath, 'utf-8');
            return JSON.parse(fileContent);
        }
    } catch (error) {
        console.warn("Failed to read account.json", error);
    }

    return undefined;
}

export function getAdminApp() {
    if (getApps().length === 0) {
        const serviceAccount = getServiceAccount();

        if (!serviceAccount) {
            console.error("Firebase Admin credentials not found. Set env vars or account.json.");
            // We might want to throw here, but for now let's hope it doesn't crash if used carefully
        }

        return initializeApp({
            credential: serviceAccount ? cert(serviceAccount) : undefined,
            storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
        });
    }
    return getApp();
}

export const getAdminDb = () => getFirestore(getAdminApp());
export const getAdminStorage = () => getStorage(getAdminApp());
