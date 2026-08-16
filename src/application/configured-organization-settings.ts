import { getConfiguredCockroachPool } from "@/src/application/configured-incident-repository";
import {
  CockroachOrganizationSlackSettingsStore,
  SettingsConfigurationError,
} from "@/src/adapters/settings/organization-slack-settings";

export function getConfiguredSlackSettingsStore(
  environment: Record<string, string | undefined> = process.env,
): CockroachOrganizationSlackSettingsStore {
  const pool = getConfiguredCockroachPool(environment);
  if (!pool) {
    throw new SettingsConfigurationError("CockroachDB is required to persist organization settings.");
  }
  return CockroachOrganizationSlackSettingsStore.fromEnvironment(pool, environment);
}
