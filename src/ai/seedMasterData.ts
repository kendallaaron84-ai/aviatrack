// File: src/ai/seedMasterData.ts
import { getFirestore, collection, doc, writeBatch } from "firebase/firestore";
import { initializeApp, getApps, getApp } from "firebase/app";

const firebaseConfig = {
  apiKey: "AIzaSyDIC3Tnqfn7bbkbmQf3deFGE5uWDlaoT1I",
  authDomain: "aviatrack-prod.firebaseapp.com",
  projectId: "aviatrack-prod",
  storageBucket: "aviatrack-prod.firebasestorage.app",
  messagingSenderId: "743112695884",
  appId: "1:743112695884:web:6633616b6983a005e994e9"
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
const db = getFirestore(app);

export async function seedAirportMasterData() {
  const batch = writeBatch(db);

  // 1. Direct Injection of your 12 Work Packages
  const workPackages = [
    { id: "FPP001", name: "Site Support Services, Apron Demolition, SWPPP, and Temporary Fencing" },
    { id: "FPP002", name: "Mass Excavation, Utility Demolition, and Deep Foundations" },
    { id: "FPP003", name: "Design Assist for MEP and Baggage Handling Systems (BHS)" },
    { id: "FPP003b", name: "Below Level 1, Turnkey Concrete, and Hoisting (Tower Cranes)" },
    { id: "FPP004", name: "Structural Steel, Fire Protection, Elevators/Escalators, Mass Timber, Glulam, and CLT" },
    { id: "FPP004b", name: "Low Voltage Integrator" },
    { id: "WP5", name: "Underground Utilities, Concrete Structure, and Civil Utilities" },
    { id: "WP6", name: "MEP/BHS, Commercial Apron Paving, Exterior Envelope, CUP, Triturator, and Civil Earthwork" },
    { id: "WP7", name: "Building Finishes, Doors & Hardware, Equipment, Exterior Envelope/Finishes, and Pedestrian Walkway" },
    { id: "WP7a", name: "Exterior Envelope/Finishes" },
    { id: "WP7b", name: "Pedestrian Walkway" },
    { id: "WP8", name: "Terminal Roadway Expansion" }
  ];

  // 2. Direct Injection of your Facility Structural Zones
  const buildingAreas = [
    { id: "AREA_1", name: "Concourse", category: "Facilities & Interior Zones" },
    { id: "AREA_2", name: "Ticket Hall", category: "Facilities & Interior Zones" },
    { id: "AREA_3", name: "Great Hall, Terminal Connector, and GTC Tower", category: "Facilities & Interior Zones" },
    { id: "SUP_FAC", name: "Support Facilities (CUP, Triturator, WTB)", category: "Facilities & Interior Zones" },
    { id: "GATE_HS", name: "Gate Houses (North, Middle, South GH)", category: "Facilities & Interior Zones" },
    { id: "PASS_PROC", name: "Passenger Processing (SSCP, Ticketing, CBP, FIS)", category: "Facilities & Interior Zones" },
    { id: "BAGGAGE", name: "Baggage Systems (CBIS, CBRA, Domestic BC)", category: "Facilities & Interior Zones" },
    { id: "AMENITIES", name: "Passenger Amenities (Holdrooms, Concessions, Delta Club)", category: "Facilities & Interior Zones" },
    { id: "OPS_SPACES", name: "Operational Spaces (Back of House, Loading Dock)", category: "Facilities & Interior Zones" },
    { id: "EXT_APRONS", name: "Terminal & Commercial Aprons (East/West/Interim RON)", category: "Exterior Sitework" },
    { id: "ROADWAYS", name: "Roadways (Terminal, Curbside, Arrivals Lanes, Bus Lane)", category: "Exterior Sitework" },
    { id: "LANDSCAPE", name: "Landscaping & Plazas (The Paseo)", category: "Exterior Sitework" },
    { id: "INFRASTRUCTURE", name: "Infrastructure (Utility Corridor)", category: "Exterior Sitework" }
  ];

  workPackages.forEach(wp => {
    const ref = doc(collection(db, "master_work_packages"), wp.id);
    batch.set(ref, wp);
  });

  buildingAreas.forEach(ba => {
    const ref = doc(collection(db, "master_building_areas"), ba.id);
    batch.set(ref, ba);
  });

  await batch.commit();
  console.log("Database Schema Ingestion Finalized Successfully.");
}