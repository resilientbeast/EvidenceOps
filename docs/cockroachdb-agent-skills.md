# CockroachDB Agent Skills evidence boundary

EvidenceOps pins the official CockroachDB Agent Skills repository to commit
[`e14e86d23ce8ee2e7e40a34ce2944c2502b6eadd`](https://github.com/cockroachlabs/cockroachdb-skills/tree/e14e86d23ce8ee2e7e40a34ce2944c2502b6eadd).

Phase 8 uses exactly one skill:
[`skills/cockroachdb-observability-and-diagnostics/auditing-table-statistics/SKILL.md`](https://github.com/cockroachlabs/cockroachdb-skills/blob/e14e86d23ce8ee2e7e40a34ce2944c2502b6eadd/skills/cockroachdb-observability-and-diagnostics/auditing-table-statistics/SKILL.md).

The adapter has one fixed read-only SQL statement, with no model-provided SQL
or table identifier:

```sql
SHOW STATISTICS FOR TABLE defaultdb.public.incidents
```

Its result is added before model invocation as `EVD-TABLE-STATISTICS`, using
the same immutable incident evidence bundle as cluster health, catalog, and
historical-memory evidence. The Bedrock model remains limited to
`read_incident_evidence`; it cannot invoke skills, execute SQL, or run any
write operation.
