import { getAuth, setPersistence, browserLocalPersistence } from "firebase/auth";

export const configureAuthPersistence = async (auth: any) => {
  // This tells Firebase to keep the iPad session alive indefinitely
  await setPersistence(auth, browserLocalPersistence);
};