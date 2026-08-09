# Hosted DataHub deployment boundary

Use a dedicated public hostname such as `https://datahub.example.com` for the
DataHub frontend. Keep GMS, Kafka, MySQL, and OpenSearch private to the same
cloud network; only the TLS-terminated frontend needs public ingress.

## Minimum demo topology

```text
Internet -> HTTPS reverse proxy -> DataHub frontend -> GMS / Kafka / MySQL / OpenSearch
Cloudflare Worker -> HTTPS DataHub GMS GraphQL API
```

Start from the repository's pinned DataHub OSS `v1.6.0` compose configuration,
then replace local-only URLs with the public hostname at the reverse proxy.
Do not expose GMS port `8080`, Kafka, MySQL, or OpenSearch directly.

## App configuration

Set these as deployment secrets on the Worker host, never as browser-visible
variables. The Worker reads GMS directly; its network path must be private or
protected by a gateway, never opened broadly to the internet:

```text
DATAHUB_GMS_URL=https://datahub-gms.example.internal
DATAHUB_GMS_TOKEN=<Reader service-account token>
DATAHUB_LIVE_SOURCE_URN=urn:li:dataset:(urn:li:dataPlatform:hive,fct_users_created,PROD)
```

`GET /api/datahub/context` uses those values server-side to return a normalized
asset and downstream-lineage context. The service account must retain only the
DataHub Reader role. Seed/reset operations use a separate, short-lived writer
token and must not run from the public Worker.

## Go-live checks

1. Confirm `https://datahub.example.com` uses valid TLS and requires sign-in.
2. Create a dedicated Reader service account and run `npm run datahub:smoke`
   against its public URL.
3. Seed the bootstrap pack through a private administrative session, then
   revoke the temporary writer token.
4. Call `/api/datahub/context` from the deployed app and confirm the response
   names `fct_users_created`, `fct_users_deleted`, and the downstream ML
   features.
5. Rotate the Reader token after the demo if it was ever displayed or copied
   into an untrusted environment.
