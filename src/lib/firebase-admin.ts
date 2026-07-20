import "server-only";

import { cert, getApp, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

export interface FirebaseAdminServices {
  app: App;
  auth: Auth;
  db: Firestore;
}

let singleton: FirebaseAdminServices | undefined;

const cleanPrivateKey = (value: string) => {
  const trimmed = value.trim().replace(/^["']|["']$/g, "");
  return trimmed.replace(/\\n/g, "\n");
};

export function getFirebaseAdmin(): FirebaseAdminServices {
  if (singleton) return singleton;

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      "Firebase Admin requires FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY.",
    );
  }

  const app = getApps().length > 0
    ? getApp()
    : initializeApp({
        credential: cert({
          projectId,
          clientEmail,
          privateKey: cleanPrivateKey(privateKey),
        }),
        projectId,
      });

  singleton = {
    app,
    auth: getAuth(app),
    db: getFirestore(app),
  };

  return singleton;
}
