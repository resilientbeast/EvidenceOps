import type { InfrastructureContext } from "@/src/domain/incident";

export interface InfrastructureCatalog {
  getByIncidentId(incidentId: string): Promise<InfrastructureContext | null>;
}
