import type { IncidentRepository } from "@/src/adapters/incident-repository";
import { Pool } from "pg";
import { CockroachIncidentRepository } from "@/src/adapters/cockroachdb/cockroach-incident-repository";
import { PostgresIncidentRepository } from "@/src/adapters/postgres/postgres-incident-repository";
import { HttpPostgresIncidentRepository } from "@/src/adapters/postgres/http-postgres-incident-repository";
import { fixtureIncidentRepository } from "@/src/adapters/fixture/fixture-incident-repository";

let postgresRepository: PostgresIncidentRepository | null = null;
let configuredUrl: string | null = null;
let httpPostgresRepository: HttpPostgresIncidentRepository | null = null;
let configuredHttpUrl: string | null = null;
export function getConfiguredCockroachPool(
  environment: Record<string, string | undefined> = process.env,
): Pool | null {
  const connectionString = environment.COCKROACHDB_URL;
  if (!connectionString) return null;
  return new Pool({
    connectionString,
    max: 2,
    application_name: "recallops-app",
    connectionTimeoutMillis: 15_000,
    idleTimeoutMillis: 1_000,
    allowExitOnIdle: true,
  });
}

export function getConfiguredIncidentRepository(environment: Record<string, string | undefined> = process.env): IncidentRepository {
  const configuredPool = getConfiguredCockroachPool(environment);
  if (configuredPool) {
    // The repository and its short-idle pool intentionally remain request-scoped:
    // getById() captures the active embedding used by the interface's
    // parameterless memory-list method, without sharing sockets across runtimes.
    return new CockroachIncidentRepository(configuredPool);
  }

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
