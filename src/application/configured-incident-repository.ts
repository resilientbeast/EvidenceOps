import type { IncidentRepository } from "@/src/adapters/incident-repository";
import { PostgresIncidentRepository } from "@/src/adapters/postgres/postgres-incident-repository";
import { HttpPostgresIncidentRepository } from "@/src/adapters/postgres/http-postgres-incident-repository";
import { fixtureIncidentRepository } from "@/src/adapters/fixture/fixture-incident-repository";

let postgresRepository: PostgresIncidentRepository | null = null;
let configuredUrl: string | null = null;
let httpPostgresRepository: HttpPostgresIncidentRepository | null = null;
let configuredHttpUrl: string | null = null;

export function getConfiguredIncidentRepository(environment: Record<string, string | undefined> = process.env): IncidentRepository {
  const httpUrl = environment.POSTGRES_MEMORY_API_URL;
  if (httpUrl) {
    if (!httpPostgresRepository || configuredHttpUrl !== httpUrl) {
      httpPostgresRepository = new HttpPostgresIncidentRepository(httpUrl);
      configuredHttpUrl = httpUrl;
    }
    return httpPostgresRepository;
  }

  const connectionString = environment.POSTGRES_MEMORY_URL;
  if (!connectionString) return fixtureIncidentRepository;

  if (!postgresRepository || configuredUrl !== connectionString) {
    postgresRepository = new PostgresIncidentRepository(connectionString);
    configuredUrl = connectionString;
  }
  return postgresRepository;
}
