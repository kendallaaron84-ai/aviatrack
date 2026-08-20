import "server-only";

import { applicationDefault, getApp, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

export interface FirebaseAdminServices {
  app: App;
  auth: Auth;
  db: Firestore;
}

let singleton: FirebaseAdminServices | undefined;

export function getFirebaseAdmin(): FirebaseAdminServices {
  if (singleton) return singleton;

  const projectId = process.env.FIREBASE_PROJECT_ID;
  if (!projectId) throw new Error("Firebase Admin requires FIREBASE_PROJECT_ID.");

  const app = getApps().length > 0
    ? getApp()
    : initializeApp({
        credential: applicationDefault(),
        projectId,
      });

  singleton = {
    app,
    auth: getAuth(app),
    db: getFirestore(app),
  };

  return singleton;
}
