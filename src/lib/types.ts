export type DeliveryMethod = "CMAR" | "DB" | "DBB";
export type ITDiscipline = "Networking" | "Cabling" | "Security Systems" | "Audiovisual" | "DAS/Cellular";

export type Financial = {
    id: string;
    projectId: string;
    discipline: string;
    item: string;
    baseline: number;
    shoppingCart: number;
    po: string;
    grStatus: string;
    grStartTime?: string;
    grEndTime?: string;
    vendor?: string;
};

export type Dependency = {
    id: string;
    projectId: string;
    task: string;
    gcMilestoneDate: string;
    itTargetDate: string;
    status: string;
};

export type ChangeOrder = {
    id: string;
    projectId: string;
    description: string;
    amount: number;
    status: string;
};

export type FieldObservation = {
  id?: string;
  projectId?: string;
  stage: string;
  programName: string;
  projectName: string;
  location: string;
  buildingLevel: string;
  priority: "Critical" | "High" | "Medium" | "Low";
  weather: string;
  description: string;
  photoUrl?: string;
  submittedAt?: string;
  status?: string;
};

export type Project = {
  id: string;
  name: string;
  wbs: string;
  deliveryMethod: DeliveryMethod;
  status?: string;
  currentPhase?: string;
  itDisciplines?: ITDiscipline[];
  glCode?: string;
  glCodeComputerEquipmentOver5k?: string;
  glCodeComputerEquipmentUnder5k?: string;
  glCodeNonComputerEquipmentOver5k?: string;
  glCodeNonComputerEquipmentUnder5k?: string;
  glCodeInstallation?: string;
  changeNarrative?: string;
  [key: string]: any;
};
