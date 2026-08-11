import type { Pool, PoolClient } from "pg";
import type { InfrastructureCatalog } from "@/src/adapters/infra-catalog";
import type { InfrastructureContext } from "@/src/domain/incident";

type Queryable = Pick<Pool, "query"> | Pick<PoolClient, "query">;

interface CatalogRow {
  server_id: string;
  hostname: string;
  panel: string | null;
  region: string | null;
  site_id: string;
  domain: string;
  owner: string | null;
  sla_tier: string | null;
  service_id: string;
  service_kind: string;
  service_name: string;
  service_status: string | null;
  service_metadata: unknown;
}

function objectValue(value: unknown): Record<string, unknown> {
  if (typeof value === "string") {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  }
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function mapCatalogRow(row: CatalogRow, observedAt = new Date().toISOString()): InfrastructureContext {
  return {
    server: {
      id: row.server_id,
      hostname: row.hostname,
      panel: row.panel,
      region: row.region,
    },
    site: {
      id: row.site_id,
      serverId: row.server_id,
      domain: row.domain,
      owner: row.owner,
      slaTier: row.sla_tier,
    },
    service: {
      id: row.service_id,
      siteId: row.site_id,
      kind: row.service_kind,
      name: row.service_name,
      status: row.service_status,
      metadata: objectValue(row.service_metadata),
    },
    observedAt,
    accessPath: "cockroachdb-sql",
  };
}

export class CockroachCatalog implements InfrastructureCatalog {
  constructor(private readonly database: Queryable) {}

  async getByIncidentId(incidentId: string): Promise<InfrastructureContext | null> {
    const result = await this.database.query<CatalogRow>(
      `SELECT srv.id::STRING AS server_id,
              srv.hostname,
              srv.panel,
              srv.region,
              site.id::STRING AS site_id,
              site.domain,
              site.owner,
              site.sla_tier,
              svc.id::STRING AS service_id,
              svc.kind AS service_kind,
              svc.name AS service_name,
              svc.status AS service_status,
              svc.metadata AS service_metadata
         FROM incidents AS inc
         JOIN services AS svc ON svc.id = inc.service_id
         JOIN sites AS site ON site.id = svc.site_id
         JOIN servers AS srv ON srv.id = site.server_id
        WHERE inc.id = $1::UUID`,
      [incidentId],
    );
    return result.rowCount ? mapCatalogRow(result.rows[0]) : null;
  }
}
