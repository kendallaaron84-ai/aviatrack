export const FIRST_FIELD_OBSERVATION_SEQUENCE = 1001;

export function formatReportNumber(sequence: number): string {
  if (!Number.isInteger(sequence) || sequence < FIRST_FIELD_OBSERVATION_SEQUENCE) {
    throw new Error("Invalid Field Observation sequence.");
  }
  return `FOR-${sequence}`;
}

export function formatItemNumber(reportSequence: number, itemSequence: number): string {
  if (!Number.isInteger(reportSequence) || reportSequence < FIRST_FIELD_OBSERVATION_SEQUENCE || !Number.isInteger(itemSequence) || itemSequence < 1) {
    throw new Error("Invalid Field Observation item sequence.");
  }
  return `${reportSequence}-${itemSequence}`;
}

export function legacyReportNumber(documentId: string): string {
  return `Legacy-${documentId.slice(0, 8)}`;
}
