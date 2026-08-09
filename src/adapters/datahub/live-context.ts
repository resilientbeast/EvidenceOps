export interface LiveDataHubContext {
  source: { urn: string; name: string; description: string | null; owners: string[]; schemaFieldCount: number };
  downstreams: Array<{ urn: string; name: string; type: string; degree: number }>;
  observedAt: string;
}

interface GraphqlDataset {
  urn: string;
  properties?: { name?: string; description?: string | null } | null;
  ownership?: { owners?: Array<{ owner?: { properties?: { displayName?: string | null } | null } | null }> } | null;
  schemaMetadata?: { fields?: unknown[] | null } | null;
}

interface GraphqlLineageResult {
  entity?: { urn?: string; name?: string | null; type?: string | null } | null;
  degree?: number | null;
}

export function normalizeLiveDataHubContext(input: { dataset: GraphqlDataset; lineage: GraphqlLineageResult[]; observedAt?: string }): LiveDataHubContext {
  return {
    source: {
      urn: input.dataset.urn,
      name: input.dataset.properties?.name ?? input.dataset.urn,
      description: input.dataset.properties?.description ?? null,
      owners: (input.dataset.ownership?.owners ?? []).map((entry) => entry.owner?.properties?.displayName).filter((name): name is string => Boolean(name)),
      schemaFieldCount: input.dataset.schemaMetadata?.fields?.length ?? 0,
    },
    downstreams: input.lineage.flatMap((result) => {
      if (!result.entity?.urn || !result.entity.type) return [];
      return [{ urn: result.entity.urn, name: result.entity.name ?? result.entity.urn, type: result.entity.type, degree: result.degree ?? 1 }];
    }),
    observedAt: input.observedAt ?? new Date().toISOString(),
  };
}

const contextQuery = `query RecallOpsContext($urn: String!) {
  dataset(urn: $urn) { urn properties { name description } ownership { owners { owner { ... on CorpUser { properties { displayName } } } } } schemaMetadata { fields { fieldPath } } }
  scrollAcrossLineage(input: { urn: $urn, query: "*", count: 20, direction: DOWNSTREAM }) { searchResults { entity { urn type } degree } }
}`;

export async function readLiveDataHubContext(sourceUrn: string, environment: Record<string, string | undefined> = process.env): Promise<LiveDataHubContext> {
  const baseUrl = (environment.DATAHUB_GMS_URL ?? environment.DATAHUB_FRONTEND_URL)?.replace(/\/$/, "");
  const token = environment.DATAHUB_GMS_TOKEN;
  if (!baseUrl || !token) throw new Error("Live DataHub context requires DATAHUB_GMS_URL (or DATAHUB_FRONTEND_URL) and DATAHUB_GMS_TOKEN.");

  const response = await fetch(`${baseUrl}/api/graphql`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: contextQuery, variables: { urn: sourceUrn } }),
  });
  if (!response.ok) throw new Error(`DataHub GraphQL read failed with HTTP ${response.status}.`);

  const payload = await response.json() as {
    data?: { dataset?: GraphqlDataset | null; scrollAcrossLineage?: { searchResults?: GraphqlLineageResult[] | null } | null };
    errors?: Array<{ message?: string }>;
  };
  if (payload.errors?.length || !payload.data?.dataset) throw new Error(payload.errors?.[0]?.message ?? "DataHub did not return the requested dataset.");
  return normalizeLiveDataHubContext({ dataset: payload.data.dataset, lineage: payload.data.scrollAcrossLineage?.searchResults ?? [] });
}
