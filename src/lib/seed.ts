"use client";

import {
  collection,
  doc,
  writeBatch,
  Firestore,
} from "firebase/firestore";

const jsonData = {
  "projects": [
    {
      "id": "GLF-2026-01",
      "name": "Ground Loading Facility Expansion",
      "deliveryMethod": "CMAR",
      "wbs": "33-00340-06-01",
      "status": "Construction",
      "currentPhase": "100% CD",
      "changeNarrative": "Initial narrative for the expansion project.",
      "financials": [
        {
          "discipline": "Infrastructure",
          "item": "Racks & UPS",
          "baseline": 15268.71,
          "shoppingCart": 25825.50,
          "po": "8000564782",
          "grStatus": "Active",
          "vendor": "CDW",
          "grStartTime": "2026-02-17T08:00:00Z"
        },
        {
          "discipline": "IT Physical Security",
          "item": "CCTV Access",
          "baseline": 239999.99,
          "shoppingCart": 218144.21,
          "po": "8000565473",
          "grStatus": "Pending",
          "vendor": "Anixter"
        }
      ],
      "changeOrders": [
        {
          "id": "CO-001",
          "description": "Additional CCTV for Gate 20",
          "amount": 5500.00,
          "status": "Approved"
        }
      ]
    }
  ]
};

export async function seedDatabase(db: Firestore) {
  const batch = writeBatch(db);

  jsonData.projects.forEach(project => {
    const projectRef = doc(db, "projects", project.id);
    batch.set(projectRef, {
      id: project.id,
      name: project.name,
      wbs: project.wbs,
      deliveryMethod: project.deliveryMethod,
      status: project.status,
      currentPhase: project.currentPhase,
      changeNarrative: project.changeNarrative || "",
    });

    if (project.financials) {
      const financialsColRef = collection(db, "projects", project.id, "financials");
      project.financials.forEach((financial) => {
        const financialDocRef = doc(financialsColRef);
        batch.set(financialDocRef, {
            projectId: project.id,
            ...financial
        });
      });
    }

    if (project.changeOrders) {
        const changeOrdersColRef = collection(db, "projects", project.id, "changeOrders");
        project.changeOrders.forEach((changeOrder) => {
            const changeOrderDocRef = doc(changeOrdersColRef, changeOrder.id);
            batch.set(changeOrderDocRef, {
                projectId: project.id,
                ...changeOrder
            });
        });
    }
  });

  await batch.commit();
}
