import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import pg from "pg";

const requiredEnvironment = [
  "COCKROACHDB_URL",
  "AWS_BEARER_TOKEN_BEDROCK",
  "AWS_REGION",
  "BEDROCK_EMBEDDING_MODEL_ID",
  "BEDROCK_EMBEDDING_DIMENSIONS",
];

const missingEnvironment = requiredEnvironment.filter((name) => {
  const value = process.env[name];
  return !value || value.startsWith("REPLACE_");
});

if (missingEnvironment.length > 0) {
  throw new Error(
    `Missing required environment variable(s): ${missingEnvironment.join(", ")}. Fill them in .env before seeding.`,
  );
}

const connectionString = process.env.COCKROACHDB_URL;
const bedrockBearerToken = process.env.AWS_BEARER_TOKEN_BEDROCK;
const awsRegion = process.env.AWS_REGION;
const embeddingModelId = process.env.BEDROCK_EMBEDDING_MODEL_ID;
const embeddingDimensions = Number.parseInt(process.env.BEDROCK_EMBEDDING_DIMENSIONS, 10);

if (embeddingDimensions !== 1024) {
  throw new Error(
    `BEDROCK_EMBEDDING_DIMENSIONS must be 1024 to match incidents.embedding VECTOR(1024); received ${embeddingDimensions}.`,
  );
}

if (!/^[a-z]{2}(?:-gov)?-[a-z]+-\d$/.test(awsRegion)) {
  throw new Error("AWS_REGION does not look like a valid AWS Region identifier.");
}

const seedSet = "recallops-cockroachdb-phase2-v1";

function addIntegrity(evidence) {
  const canonicalEvidence = JSON.stringify(evidence);
  const sha256 = createHash("sha256").update(canonicalEvidence).digest("hex");
  return {
    ...evidence,
    integrity: {
      algorithm: "sha256",
      sha256,
    },
  };
}

const seedRecords = [
  {
    server: {
      id: "10000000-0000-4000-8000-000000000001",
      hostname: "campaign-service.example",
      panel: "Plesk",
      region: "UK",
    },
    site: {
      id: "20000000-0000-4000-8000-000000000001",
      domain: "campaign-service.example",
      owner: "Anonymized messaging client",
      slaTier: null,
    },
    service: {
      id: "30000000-0000-4000-8000-000000000001",
      kind: "redis",
      name: "MailWizz Redis container",
      status: "healthy_after_remediation",
      metadata: {
        image: "redis:latest",
        runtime: "Plesk Docker extension",
        originalContainerMemoryMb: 256,
        remediatedContainerMemoryMb: 512,
        redisMaxmemory: "400mb",
        redisMaxmemoryPolicy: "allkeys-lru",
        redisSave: "",
        mutexDatabase: 1,
      },
    },
    incident: {
      id: "40000000-0000-4000-8000-000000000001",
      severity: "SEV-2",
      title: "MailWizz campaigns stalled under Redis container memory pressure",
      rootCause:
        "Redis memory pressure near the 256 MB container limit caused intermittent instability. It appeared first as Predis connections dropping mid-request and later as PCNTL mutex and lock confusion, but both symptoms had the same underlying cause rather than representing separate bugs.",
      resolution:
        "Raised the Redis container memory limit from 256 MB to 512 MB and applied maxmemory 400mb, maxmemory-policy allkeys-lru, and save \"\" over SSH to remove RDB snapshot pressure. No manual lock clearing or PCNTL disabling was required.",
      outcome:
        "Campaigns 5006, 5002, and 5001 resumed and completed after the Redis memory increase on 2026-07-25.",
      status: "resolved",
      openedAt: null,
      resolvedAt: null,
      evidence: addIntegrity({
        schemaVersion: 1,
        seedSet,
        seedKey: "anonymized-mailwizz-redis-2026-07",
        provenance: {
          kind: "operator_report",
          synthetic: false,
        },
        summary:
          "Multiple MailWizz campaigns stalled for several days while other campaigns and SES delivery continued. Redis was at 222.5 MB of a 256 MB container limit, Predis connections dropped mid-request, and later the Redis-backed PCNTL mutex reported previously acquired locks. Increasing Redis headroom and removing snapshot pressure allowed the already-running sends to finish.",
        timeContext: {
          timezone: "Europe/London",
          julyOffset: "+01:00",
          precision: "date_range_with_one_exact_local_observation",
          incidentWindowLocal: {
            startDate: "2026-07-22",
            endDate: "2026-07-25",
          },
          exactLocalObservations: [
            {
              at: "2026-07-23T18:32:00+01:00",
              fact:
                "Campaign 5006 was stuck at Sending (78%); sibling campaign 5005 had completed at the identical timestamp.",
            },
          ],
        },
        symptoms: [
          "Campaign 5006 remained at Sending (78%) for more than 40 hours.",
          "Campaign 5002 remained at 13% and campaign 5001 remained at 23% since 2026-07-22.",
          "Other campaigns continued to complete, so this was not a full outage.",
        ],
        diagnostics: [
          "The redis:latest container was running at 222.5 MB of a 256 MB limit, approximately 87% utilization.",
          "Application logs repeatedly showed Predis Connection ConnectionException errors on tracking routes: Redis was reachable but dropped connections mid-request.",
          "A verbose send-campaigns cron debug run on 2026-07-25 completed cycles and delivered other campaigns through SES, proving the cron itself was healthy.",
          "MailWizz's Redis-backed PCNTL mutex in database 1 reported: PCNTL processes running already, locks acquired previously!",
          "FLUSHDB did not remove the mutex condition because real PCNTL processes were genuinely holding it at that moment.",
        ],
        resolutionActions: [
          "Raised the Redis Docker container memory limit from 256 MB to 512 MB.",
          "Set maxmemory to 400mb.",
          "Set maxmemory-policy to allkeys-lru.",
          "Set save to an empty value to remove RDB snapshot pressure.",
        ],
        outcomeVerification: [
          "Campaigns 5006, 5002, and 5001 resumed and completed after the memory increase.",
          "Already-running PCNTL-managed sends completed normally.",
        ],
        doNotInfer: [
          "Do not describe this as a full MailWizz outage; other campaigns kept succeeding.",
          "Do not split the connection drops and mutex behavior into two root causes.",
          "Do not claim FLUSHDB, manual lock clearing, or disabling PCNTL resolved the incident.",
          "Do not claim a confirmed container OOM kill; the observed fact was severe memory pressure and intermittent Redis instability.",
        ],
      }),
    },
  },
  {
    server: {
      id: "10000000-0000-4000-8000-000000000002",
      hostname: "mailer.galewood.example",
      panel: "Plesk",
      region: "eu-west-2",
    },
    site: {
      id: "20000000-0000-4000-8000-000000000002",
      domain: "mailer.galewood.example",
      owner: "Galewood Publishing (synthetic)",
      slaTier: "standard",
    },
    service: {
      id: "30000000-0000-4000-8000-000000000002",
      kind: "redis",
      name: "Newsletter queue Redis",
      status: "healthy_after_remediation",
      metadata: {
        synthetic: true,
        originalContainerMemoryMb: 384,
        remediatedContainerMemoryMb: 768,
        originalPolicy: "noeviction",
        remediatedPolicy: "allkeys-lru",
      },
    },
    incident: {
      id: "40000000-0000-4000-8000-000000000002",
      severity: "SEV-3",
      title: "Newsletter workers stalled as Redis reached a noeviction ceiling",
      rootCause:
        "Synthetic incident: cache churn exhausted Redis maxmemory under the noeviction policy, causing lock and queue writes to fail while already-running workers continued.",
      resolution:
        "Synthetic resolution: raised the container limit from 384 MB to 768 MB, set maxmemory to 640mb with allkeys-lru, and verified worker leases renewed without clearing live locks.",
      outcome: "Synthetic outcome: queued newsletter segments drained normally after Redis regained write headroom.",
      status: "resolved",
      openedAt: "2026-06-14T09:10:00+01:00",
      resolvedAt: "2026-06-14T11:45:00+01:00",
      evidence: addIntegrity({
        schemaVersion: 1,
        seedSet,
        seedKey: "synthetic-galewood-redis-memory-2026-06",
        provenance: {
          kind: "synthetic_sibling",
          synthetic: true,
        },
        summary:
          "Synthetic sibling with partial newsletter stalls, Redis OOM command-not-allowed errors, a saturated container memory ceiling, and successful recovery after adding headroom and replacing noeviction with allkeys-lru.",
        symptoms: [
          "Several newsletter segments stopped advancing while existing deliveries continued.",
          "Workers logged OOM command not allowed errors when renewing leases.",
        ],
        diagnostics: [
          "Redis memory matched maxmemory and the active policy was noeviction.",
          "SMTP delivery remained healthy and only queue and lock writes failed.",
        ],
        transferNotes: {
          shared: ["partial sending stall", "Redis memory ceiling", "healthy downstream delivery"],
          changed: ["explicit write rejection rather than intermittent connection drops", "no PCNTL mutex"],
          doNotTransfer: ["Do not assume MailWizz-specific mutex semantics."],
        },
      }),
    },
  },
  {
    server: {
      id: "10000000-0000-4000-8000-000000000006",
      hostname: "not-recorded",
      panel: "Plesk Obsidian",
      region: "not-recorded",
    },
    site: {
      id: "20000000-0000-4000-8000-000000000006",
      domain: "wordpress-client.example",
      owner: "Anonymized client",
      slaTier: "single-site",
    },
    service: {
      id: "30000000-0000-4000-8000-000000000006",
      kind: "php-fpm",
      name: "WordPress PHP 8.3-FPM frontend",
      status: "healthy_after_remediation",
      metadata: {
        runtime: "Ubuntu",
        panel: "Plesk Obsidian",
        phpVersion: "8.3-FPM",
        pmMaxChildren: 10,
        incidentScope: "single-site",
        serverHostname: "not-recorded",
        serverRegion: "not-recorded",
      },
    },
    incident: {
      id: "40000000-0000-4000-8000-000000000006",
      severity: "SEV-2",
      title: "PHP-FPM pool exhausted by live Elementor regeneration on frontend requests",
      rootCause:
        "Elementor and Elementor Pro regenerated dynamic CSS and design-system assets during public frontend requests, including database writes. With pm.max_children fixed at 10, ten concurrent 5-7 second requests exhausted the PHP 8.3-FPM pool. The underlying failure was live regeneration work without full-page caching, amplified by Query Monitor running in production, rather than raw traffic volume or server capacity.",
      resolution:
        "Client confirmed the remediation worked: Query Monitor was disabled in production, Elementor CSS and design-system assets were regenerated through admin tools, Elementor uploads permissions were verified, WordPress-aware full-page caching and managed wp-cron were enabled, and pm.max_children was retained at 10 pending measurement rather than raised as a band-aid.",
      outcome:
        "Client confirmed that the recurring PHP-FPM max_children alerts stopped after remediation. The exact resolution timestamp was not recorded, and this transcript contains no confirmed 502, 503, or 504 response.",
      status: "resolved",
      openedAt: "2026-07-26T00:13:00+01:00",
      resolvedAt: null,
      evidence: addIntegrity({
        schemaVersion: 1,
        seedSet,
        seedKey: "anonymized-elementor-php-fpm-2026-07",
        provenance: {
          kind: "operator_report",
          synthetic: false,
        },
        summary:
          "A single-site Plesk Obsidian WordPress server emitted recurring PHP-FPM max_children alerts for days despite modest traffic. Slow logs captured concurrent frontend requests spending 5.4-6.7 seconds in Elementor regeneration paths that performed database writes. Client-confirmed remediation removed live regeneration and debug overhead, added caching, and stopped the alerts.",
        timeContext: {
          timezone: "Europe/London",
          precision: "first_evidenced_timestamp_with_unrecorded_resolution_time",
          firstEvidencedAt: "2026-07-26T00:13:00+01:00",
          observedThroughDate: "2026-08-01",
          resolvedAt: "not-recorded",
        },
        symptoms: [
          "Plesk monitoring reported that PHP-FPM reached pm.max_children = 10 roughly every 15-60 minutes from at least 2026-07-26 through 2026-08-01.",
          "The client pressed for a root cause while the site remained available and self-recovered between alerts.",
        ],
        diagnostics: [
          "Access-log analysis showed only 30-66 requests per minute, ruling out raw request volume as the direct cause.",
          "A five-second PHP-FPM slow-log threshold captured multiple concurrent public index.php requests running for 5.4-6.7 seconds on 2026-08-01.",
          "Captured traces showed Elementor and Elementor Pro stylesheet-manager generate/update_file paths performing live dynamic CSS and design-system regeneration, including mysqli_query and wpdb delete_option/delete_meta writes.",
          "The same traces included Elementor Pro nav-menu and dynamic-tag widgets, Virtue Premium header and Google-font processing, Yoast SEO frontend metadata generation, and Query Monitor wrapping database calls in production.",
        ],
        resolutionActions: [
          "Disabled Query Monitor in production.",
          "Regenerated Elementor CSS and design-system files once through WordPress admin tools instead of visitor requests.",
          "Verified ownership and write permissions for wp-content/uploads/elementor/.",
          "Enabled WordPress-aware full-page caching while excluding admin, cron, and dynamic routes.",
          "Moved wp-cron to Plesk-managed scheduling and kept pm.max_children at 10 until measured.",
        ],
        outcomeVerification: [
          "Client confirmed the remediation worked and the recurring max_children alerts stopped.",
          "The exact resolution time was not recorded.",
        ],
        doNotInfer: [
          "Do not describe this as a traffic-volume or generic capacity incident.",
          "Do not claim an OS-level OOM kill, full server crash, or confirmed 502, 503, or 504 response.",
          "Do not treat BackupBuddy as this incident's trigger; a separate BackupBuddy path issue was not in the slow-log capture.",
          "Do not claim a specific server hostname, region, or exact resolution timestamp; they were not recorded.",
          "Do not raise pm.max_children as the resolution without first removing live regeneration work and measuring the resulting workload.",
        ],
      }),
    },
  },
  {
    server: {
      id: "10000000-0000-4000-8000-000000000007",
      hostname: "cyberpanel-containment.example",
      panel: "CyberPanel",
      region: "synthetic-aws-region",
    },
    site: {
      id: "20000000-0000-4000-8000-000000000007",
      domain: "portfolio-containment.example",
      owner: "Synthetic multi-site customer",
      slaTier: "standard",
    },
    service: {
      id: "30000000-0000-4000-8000-000000000007",
      kind: "hosting-panel",
      name: "CyberPanel management service",
      status: "healthy_after_compromise_containment",
      metadata: {
        synthetic: true,
        hosting: "AWS Lightsail",
        affectedServer: "server-2 analogue",
        affectedComponent: "fastapi_ssh_server",
        managementPort: 8888,
      },
    },
    incident: {
      id: "40000000-0000-4000-8000-000000000007",
      severity: "SEV-2",
      title: "CyberPanel root-shell component contained after automated JWT exploit exposure",
      rootCause:
        "Synthetic incident: a vulnerable CyberPanel fastapi_ssh_server component exposed a root-shell path through a hardcoded JWT secret. Automated exploitation established the component identically across a multi-site server fleet; this record does not represent a bespoke attacker implant.",
      resolution:
        "Synthetic resolution: stopped and disabled fastapi_ssh_server, killed its process, removed the service unit and application script, reloaded systemd, installed the vendor-fixed CyberPanel release, rotated privileged credentials, and completed a clean persistence and login-history review.",
      outcome:
        "Synthetic outcome: the vulnerable listener remained absent, no persistence artifacts were found after the containment review, privileged access was restored through rotated credentials, and all hosted sites passed malware and availability validation.",
      status: "resolved",
      openedAt: "2026-06-21T09:30:00Z",
      resolvedAt: "2026-06-21T17:15:00Z",
      evidence: addIntegrity({
        schemaVersion: 1,
        seedSet,
        seedKey: "synthetic-cyberpanel-fastapi-jwt-containment-2026-06",
        provenance: {
          kind: "synthetic_sibling",
          synthetic: true,
          derivedFrom: "anonymized Server 2 containment pattern",
        },
        summary:
          "Synthetic fully resolved companion incident based on an anonymized CyberPanel containment pattern: a shipped fastapi_ssh_server component with a hardcoded JWT secret created a root-shell exposure. The record includes synthetic patching, credential rotation, deep-forensics, and website validation outcomes that must not be projected onto the original server transcript.",
        symptoms: [
          "All sites on the host displayed signs of compromise and a privileged administrator could not authenticate.",
          "A long-running fastapi_ssh_server systemd service was listening as root on the CyberPanel management port.",
        ],
        diagnostics: [
          "Service and process inspection identified CyberPanel's shipped fastapi_ssh_server component rather than a custom service name.",
          "Component source review confirmed the hardcoded JWT-secret root-shell exposure associated with vulnerable CyberPanel releases.",
          "Fleet comparison found the same component pattern on more than one server, consistent with automated mass exploitation.",
          "Synthetic post-containment review found no immutable-file, shell-history, login-history, authentication-log, or reverse-shell persistence indicators.",
        ],
        resolutionActions: [
          "Stopped and disabled fastapi_ssh_server.",
          "Killed the running process, removed its systemd unit and application script, and reloaded systemd.",
          "Installed the synthetic vendor-fixed CyberPanel release and rotated privileged credentials.",
          "Completed synthetic persistence, login-history, and website-malware validation before closing the incident.",
        ],
        outcomeVerification: [
          "ps aux and systemd both confirmed fastapi_ssh_server remained absent after remediation.",
          "Synthetic deep-forensics and website validation completed without further compromise indicators.",
          "Synthetic privileged access recovery succeeded after credential rotation.",
        ],
        doNotInfer: [
          "This is a synthetic fully resolved sibling, not evidence that the original server's deep-forensics, patching, website cleanup, or account recovery completed.",
          "Do not apply its clean persistence outcome to a server with a separate defunct.service or gsocket implant without independent verification.",
          "Do not assume all CyberPanel installations, regions, hosts, or releases share this outcome.",
        ],
      }),
    },
  },
  {
    server: {
      id: "10000000-0000-4000-8000-000000000008",
      hostname: "managed-plesk-portfolio.example",
      panel: "Plesk",
      region: "not-recorded",
    },
    site: {
      id: "20000000-0000-4000-8000-000000000008",
      domain: "managed-plesk-portfolio.example",
      owner: "Anonymized managed-services client",
      slaTier: "managed-wordpress-fleet",
    },
    service: {
      id: "30000000-0000-4000-8000-000000000008",
      kind: "wordpress-fleet",
      name: "Managed WordPress vulnerability response",
      status: "patched_and_verified",
      metadata: {
        panel: "Plesk",
        totalClientDomainAccounts: 72,
        detailedReviewDispositions: 64,
        patchedSites: 19,
        alreadyPatchedSites: 24,
        legacyOutOfRangeSites: 13,
        noSiteOrWordpressDomains: 8,
      },
    },
    incident: {
      id: "40000000-0000-4000-8000-000000000008",
      severity: "SEV-2",
      title: "WP2Shell WordPress core RCE mitigated across a managed Plesk portfolio",
      rootCause:
        "The WP2Shell WordPress core remote-code-execution disclosure (CVE-2026-60137/CVE-2026-63030) affected sites running vulnerable WordPress release branches. The server-wide response was a preventative vulnerability mitigation; no confirmed exploitation of a customer site is recorded.",
      resolution:
        "Manually updated 19 affected sites through Plesk WP Toolkit and WP-CLI/SSH to the highest patched release available for their branch (7.0.2, 6.9.5, or 6.8.6). Confirmed 24 sites were already patched, classified 13 legacy WordPress 4.x-6.2 sites as outside the affected range and queued them for rebuild, and confirmed 8 domains carried no live website or WordPress instance.",
      outcome:
        "Client-facing PDF remediation report and summary email were delivered. The known WP2Shell exposure was fully resolved across the assessed portfolio; the remaining legacy rebuild backlog and EOL PHP estate are tracked as separate lifecycle risks, not an open WP2Shell exposure.",
      status: "resolved",
      openedAt: null,
      resolvedAt: null,
      evidence: addIntegrity({
        schemaVersion: 1,
        seedSet,
        seedKey: "real-natural-ranks-wp2shell-portfolio-mitigation-2026-07",
        provenance: {
          kind: "operator_report",
          synthetic: false,
        },
        summary:
          "A Plesk-hosted managed WordPress portfolio was assessed after the July 17, 2026 WP2Shell core-RCE disclosure. Nineteen sites required manual core patching, 24 were already patched, 13 legacy sites were confirmed outside the affected range and put on a rebuild track, and eight domains were confirmed to have no live site or WordPress instance. The vulnerable exposure was closed without a confirmed exploitation finding.",
        timeContext: {
          triggerDate: "2026-07-17",
          trigger: "WP2Shell disclosure",
          openedAt: "not-recorded",
          resolvedAt: "not-recorded",
          precision: "disclosure_date_with_unrecorded_response_timestamps",
        },
        symptoms: [
          "Critical WordPress core RCE exposure required a server-wide assessment of the managed portfolio.",
          "No confirmed exploitation, website compromise, or service outage was reported in this remediation record.",
        ],
        diagnostics: [
          "Nineteen sites required manual core updates to 7.0.2, 6.9.5, or 6.8.6 according to their supported branch.",
          "Twenty-four sites were already on patched releases.",
          "Thirteen WordPress 4.x-6.2 legacy sites predated the affected range and were classified for rebuild rather than patching.",
          "Eight domains were confirmed to carry no live website or WordPress instance.",
        ],
        resolutionActions: [
          "Applied manual core updates through Plesk WP Toolkit and WP-CLI/SSH to every assessed vulnerable site.",
          "Produced a client-facing PDF remediation report and summary email.",
          "Recorded the legacy-site rebuild backlog and EOL PHP exposure as follow-up lifecycle work.",
        ],
        outcomeVerification: [
          "All 19 identified vulnerable sites were updated to an available patched release for their branch.",
          "Twenty-four assessed sites were independently confirmed already patched.",
          "The known WP2Shell exposure was declared fully resolved after the review and remediation pass.",
        ],
        relatedRisks: [
          "47 of 72 Plesk client domain accounts were reported to use EOL, unpatched PHP versions; this was documented separately and was not the WP2Shell root cause.",
          "Thirteen legacy WordPress sites remain rebuild candidates even though they were outside the WP2Shell affected range.",
        ],
        doNotInfer: [
          "Do not claim confirmed exploitation of WP2Shell; this was a preventative remediation incident.",
          "Do not treat EOL PHP exposure or the legacy rebuild backlog as unresolved WP2Shell vulnerability exposure.",
          "Do not invent exact incident start or resolution timestamps.",
          "The source reports 72 total Plesk client domain accounts and 64 detailed review dispositions; the mapping of the remaining account scope was not recorded in this incident evidence.",
        ],
      }),
    },
  },
  {
    server: {
      id: "10000000-0000-4000-8000-000000000003",
      hostname: "campaigns.blueharbor.example",
      panel: "CyberPanel",
      region: "us-east-1",
    },
    site: {
      id: "20000000-0000-4000-8000-000000000003",
      domain: "campaigns.blueharbor.example",
      owner: "Blue Harbor Events (synthetic)",
      slaTier: "standard",
    },
    service: {
      id: "30000000-0000-4000-8000-000000000003",
      kind: "redis",
      name: "MailWizz Redis session and mutex store",
      status: "healthy_after_credential_fix",
      metadata: {
        synthetic: true,
        authentication: "requirepass",
      },
    },
    incident: {
      id: "40000000-0000-4000-8000-000000000003",
      severity: "SEV-3",
      title: "MailWizz campaigns paused after a Redis password rotation",
      rootCause:
        "Synthetic incident: the Redis requirepass secret was rotated but the MailWizz worker configuration retained the previous password, causing deterministic authentication failures.",
      resolution:
        "Synthetic resolution: updated the application secret, restarted workers in a controlled sequence, and confirmed mutex acquisition and queue reads succeeded.",
      outcome: "Synthetic outcome: all paused campaigns resumed after workers authenticated with the current secret.",
      status: "resolved",
      openedAt: "2026-05-03T14:20:00-04:00",
      resolvedAt: "2026-05-03T15:05:00-04:00",
      evidence: addIntegrity({
        schemaVersion: 1,
        seedSet,
        seedKey: "synthetic-blueharbor-redis-auth-2026-05",
        provenance: {
          kind: "synthetic_sibling",
          synthetic: true,
        },
        summary:
          "Synthetic sibling with MailWizz campaign stalls and Redis-backed mutex failures, but stable memory and explicit WRONGPASS errors showed a credential mismatch rather than memory pressure.",
        symptoms: [
          "Campaigns paused immediately after a scheduled secret rotation.",
          "Every worker failed Redis operations consistently rather than intermittently.",
        ],
        diagnostics: [
          "Redis memory utilization was normal.",
          "Logs consistently reported WRONGPASS invalid username-password pair.",
        ],
        transferNotes: {
          shared: ["MailWizz campaign stall", "Redis-backed mutex unavailable"],
          changed: ["deterministic authentication errors", "normal memory utilization"],
          doNotTransfer: ["Do not increase memory or change eviction policy without memory-pressure evidence."],
        },
      }),
    },
  },
  {
    server: {
      id: "10000000-0000-4000-8000-000000000004",
      hostname: "portal.redwood.example",
      panel: "ISPConfig",
      region: "eu-central-1",
    },
    site: {
      id: "20000000-0000-4000-8000-000000000004",
      domain: "portal.redwood.example",
      owner: "Redwood Services (synthetic)",
      slaTier: "standard",
    },
    service: {
      id: "30000000-0000-4000-8000-000000000004",
      kind: "cron",
      name: "Nightly backup scheduler",
      status: "healthy_after_disk_cleanup",
      metadata: {
        synthetic: true,
        scheduler: "cron",
        affectedFilesystem: "/var",
      },
    },
    incident: {
      id: "40000000-0000-4000-8000-000000000004",
      severity: "SEV-3",
      title: "Nightly backups stopped when inode exhaustion blocked cron temporary files",
      rootCause:
        "Synthetic incident: millions of abandoned small cache files exhausted inodes on /var, so the backup cron could not create temporary manifests despite ample free bytes.",
      resolution:
        "Synthetic resolution: removed the abandoned cache files, added inode monitoring, and reran the missed backups with checksum verification.",
      outcome: "Synthetic outcome: the backup schedule recovered and all missed restore points were recreated.",
      status: "resolved",
      openedAt: "2026-04-18T02:00:00+02:00",
      resolvedAt: "2026-04-18T07:30:00+02:00",
      evidence: addIntegrity({
        schemaVersion: 1,
        seedSet,
        seedKey: "synthetic-redwood-cron-inodes-2026-04",
        provenance: {
          kind: "synthetic_sibling",
          synthetic: true,
        },
        summary:
          "Synthetic structurally different incident: cron-launched backups failed because /var had no free inodes, while memory, Redis, application queues, and network dependencies were healthy.",
        symptoms: ["Nightly backup jobs exited before creating manifests.", "Application traffic remained normal."],
        diagnostics: ["Filesystem bytes were available but inode usage was 100%.", "Redis and application workers were healthy."],
        transferNotes: {
          shared: ["scheduled work failed"],
          changed: ["filesystem inode exhaustion", "no campaign or Redis impact"],
          doNotTransfer: ["Do not apply Redis or PCNTL remediation to filesystem failures."],
        },
      }),
    },
  },
  {
    server: {
      id: "10000000-0000-4000-8000-000000000005",
      hostname: "campaigns.lumenpost.example",
      panel: "Plesk",
      region: "UK",
    },
    site: {
      id: "20000000-0000-4000-8000-000000000005",
      domain: "campaigns.lumenpost.example",
      owner: "Lumen Post (synthetic demo)",
      slaTier: "standard",
    },
    service: {
      id: "30000000-0000-4000-8000-000000000005",
      kind: "redis",
      name: "MailWizz Redis queue and mutex store",
      status: "degraded_under_investigation",
      metadata: {
        synthetic: true,
        image: "redis:latest",
        runtime: "Plesk Docker extension",
        affectedCampaigns: ["DEMO-701", "DEMO-704", "DEMO-709"],
      },
    },
    incident: {
      id: "40000000-0000-4000-8000-000000000005",
      severity: "SEV-2",
      title: "MailWizz campaigns intermittently stalled while Redis approached its container ceiling",
      rootCause: null,
      resolution: null,
      outcome: null,
      status: "open",
      openedAt: "2026-08-10T08:15:00+01:00",
      resolvedAt: null,
      evidence: addIntegrity({
        schemaVersion: 1,
        seedSet,
        seedKey: "synthetic-active-lumenpost-mailwizz-redis-2026-08",
        provenance: {
          kind: "synthetic_demo_alert",
          synthetic: true,
          memoryEligible: false,
        },
        summary:
          "Synthetic active demo incident: several MailWizz campaigns stopped advancing while other SES-backed sends continued. Redis is near its container memory ceiling, intermittent Predis disconnects are present, and a PCNTL mutex message requires live process verification before any lock action.",
        symptoms: [
          "Three synthetic campaign sends stopped advancing while other sends continued through SES.",
          "Tracking requests intermittently lost their Redis connection.",
        ],
        diagnostics: [
          "Redis is near its configured container memory ceiling; exact current headroom still requires an operator read.",
          "Predis connections are intermittently dropping rather than failing authentication consistently.",
          "A PCNTL mutex reports previously acquired locks, but lock ownership has not yet been checked against live processes.",
        ],
        hypotheses: ["Redis memory pressure", "live or stale PCNTL mutex", "downstream delivery failure"],
        doNotInfer: [
          "This is a synthetic active incident created only to exercise the live investigation path.",
          "Do not claim a confirmed root cause until current Redis and process evidence is collected.",
          "Do not clear a mutex or restart Redis while live PCNTL ownership is unknown.",
          "Do not copy a historical memory limit without checking the current workload and host capacity.",
        ],
      }),
    },
  },
];

function embeddingDocument(record) {
  const { service, incident } = record;
  return [
    `Incident title: ${incident.title}`,
    `Severity: ${incident.severity}`,
    `Service: ${service.kind} — ${service.name}`,
    `Evidence summary: ${incident.evidence.summary}`,
    `Root cause: ${incident.rootCause ?? "unresolved — hypothesis required"}`,
    `Resolution: ${incident.resolution ?? "none — active incident"}`,
    `Outcome: ${incident.outcome ?? "pending"}`,
  ].join("\n");
}

async function generateEmbedding(inputText) {
  const endpoint = `https://bedrock-runtime.${awsRegion}.amazonaws.com/model/${encodeURIComponent(embeddingModelId)}/invoke`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${bedrockBearerToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      inputText,
      dimensions: embeddingDimensions,
      normalize: true,
      embeddingTypes: ["float"],
    }),
  });

  const responseText = await response.text();
  let payload;
  try {
    payload = JSON.parse(responseText);
  } catch {
    throw new Error(`Bedrock returned a non-JSON response with HTTP ${response.status}.`);
  }

  if (!response.ok) {
    const message = typeof payload.message === "string" ? payload.message : "Bedrock invocation failed.";
    throw new Error(`Bedrock embedding request failed with HTTP ${response.status}: ${message}`);
  }

  if (!Array.isArray(payload.embedding) || payload.embedding.length !== embeddingDimensions) {
    const received = Array.isArray(payload.embedding) ? payload.embedding.length : "no float embedding";
    throw new Error(`Bedrock returned ${received} dimensions; expected ${embeddingDimensions}.`);
  }

  if (!payload.embedding.every((value) => Number.isFinite(value))) {
    throw new Error("Bedrock returned an embedding containing a non-finite value.");
  }

  return {
    embedding: payload.embedding,
    inputTextTokenCount: payload.inputTextTokenCount,
  };
}

function vectorLiteral(embedding) {
  return `[${embedding.join(",")}]`;
}

const poolOptions = {
  connectionString,
  max: 1,
  application_name: "recallops-phase2-seed",
  connectionTimeoutMillis: 15_000,
  idleTimeoutMillis: 5_000,
};

if (process.env.COCKROACHDB_CA_CERT_PATH) {
  poolOptions.ssl = {
    ca: await readFile(process.env.COCKROACHDB_CA_CERT_PATH, "utf8"),
    rejectUnauthorized: true,
  };
}

const pool = new pg.Pool(poolOptions);

try {
  await pool.query("SELECT 1");

  const preparedEmbeddings = new Map();
  for (const record of seedRecords) {
    const existing = await pool.query(
      `SELECT title,
              evidence->'integrity'->>'sha256' AS evidence_sha256,
              embedding IS NOT NULL AS has_embedding
         FROM incidents
        WHERE id = $1`,
      [record.incident.id],
    );

    if (existing.rowCount === 1) {
      const row = existing.rows[0];
      if (
        row.title !== record.incident.title ||
        row.evidence_sha256 !== record.incident.evidence.integrity.sha256
      ) {
        throw new Error(
          `Seed ID collision for ${record.incident.id}. Refusing to mutate an existing immutable incident.`,
        );
      }

      if (row.has_embedding) {
        console.log(`SEED_REUSED incident=${record.incident.id} title=${JSON.stringify(record.incident.title)}`);
        continue;
      }
    }

    const generated = await generateEmbedding(embeddingDocument(record));
    preparedEmbeddings.set(record.incident.id, generated.embedding);
    console.log(
      `BEDROCK_EMBEDDING_OK incident=${record.incident.id} dimensions=${generated.embedding.length} input_tokens=${generated.inputTextTokenCount ?? "unknown"}`,
    );
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    for (const record of seedRecords) {
      await client.query(
        `INSERT INTO servers (id, hostname, panel, region)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (id) DO UPDATE
         SET hostname = excluded.hostname,
             panel = excluded.panel,
             region = excluded.region`,
        [record.server.id, record.server.hostname, record.server.panel, record.server.region],
      );

      await client.query(
        `INSERT INTO sites (id, server_id, domain, owner, sla_tier)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (id) DO UPDATE
         SET server_id = excluded.server_id,
             domain = excluded.domain,
             owner = excluded.owner,
             sla_tier = excluded.sla_tier`,
        [
          record.site.id,
          record.server.id,
          record.site.domain,
          record.site.owner,
          record.site.slaTier,
        ],
      );

      await client.query(
        `INSERT INTO services (id, site_id, kind, name, status, metadata)
         VALUES ($1, $2, $3, $4, $5, $6::JSONB)
         ON CONFLICT (id) DO UPDATE
         SET site_id = excluded.site_id,
             kind = excluded.kind,
             name = excluded.name,
             status = excluded.status,
             metadata = excluded.metadata`,
        [
          record.service.id,
          record.site.id,
          record.service.kind,
          record.service.name,
          record.service.status,
          JSON.stringify(record.service.metadata),
        ],
      );

      const embedding = preparedEmbeddings.get(record.incident.id) ?? null;
      await client.query(
        `INSERT INTO incidents (
           id, service_id, severity, title, root_cause, resolution, outcome,
           status, opened_at, resolved_at, evidence, embedding
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::JSONB, $12::VECTOR)
         ON CONFLICT (id) DO UPDATE
         SET embedding = COALESCE(incidents.embedding, excluded.embedding)`,
        [
          record.incident.id,
          record.service.id,
          record.incident.severity,
          record.incident.title,
          record.incident.rootCause,
          record.incident.resolution,
          record.incident.outcome,
          record.incident.status,
          record.incident.openedAt,
          record.incident.resolvedAt,
          JSON.stringify(record.incident.evidence),
          embedding ? vectorLiteral(embedding) : null,
        ],
      );
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  const stored = await pool.query(
    `SELECT count(*)::INT AS seed_count,
            count(embedding)::INT AS embedded_count,
            count(*) FILTER (WHERE evidence->'provenance'->>'synthetic' = 'false')::INT AS real_count,
            count(*) FILTER (WHERE evidence->'provenance'->>'synthetic' = 'true')::INT AS synthetic_count
       FROM incidents
      WHERE evidence->>'seedSet' = $1`,
    [seedSet],
  );

  const counts = {
    seedCount: Number(stored.rows[0].seed_count),
    embeddedCount: Number(stored.rows[0].embedded_count),
    realCount: Number(stored.rows[0].real_count),
    syntheticCount: Number(stored.rows[0].synthetic_count),
  };
  if (
    counts.seedCount !== seedRecords.length ||
    counts.embeddedCount !== seedRecords.length ||
    counts.realCount !== 3 ||
    counts.syntheticCount !== seedRecords.length - 3
  ) {
    throw new Error(`Stored seed verification failed: ${JSON.stringify(counts)}`);
  }

  const demoQuery = [
    "Fresh MailWizz incident on another site.",
    "Several campaigns are stalled while other SES deliveries still succeed.",
    "A Redis Docker container is near its memory ceiling and Predis connections drop intermittently.",
    "The PCNTL mutex reports processes already running and previously acquired locks.",
    "Find the closest historical incident without assuming that lock deletion is safe.",
  ].join(" ");
  const queryEmbedding = await generateEmbedding(demoQuery);
  const queryVector = vectorLiteral(queryEmbedding.embedding);

  const matches = await pool.query(
    `SELECT id,
            title,
            severity,
            evidence->'provenance'->>'synthetic' AS synthetic,
            round((embedding <-> $1::VECTOR)::DECIMAL, 6)::STRING AS distance
       FROM incidents
      WHERE evidence->>'seedSet' = $2
        AND status = 'resolved'
      ORDER BY embedding <-> $1::VECTOR
      LIMIT 4`,
    [queryVector, seedSet],
  );

  const expectedTopMatchId = seedRecords[0].incident.id;
  if (matches.rows[0]?.id !== expectedTopMatchId) {
    throw new Error(
      `Vector retrieval did not rank the anonymized messaging incident first. Received ${matches.rows[0]?.id ?? "no match"}.`,
    );
  }

  const plan = await pool.query(
    `EXPLAIN SELECT id, title
       FROM incidents
      ORDER BY embedding <-> $1::VECTOR
      LIMIT 4`,
    [queryVector],
  );
  const planText = plan.rows.map((row) => Object.values(row)[0]).join("\n");
  if (!planText.includes("vector search") || !planText.includes("incidents_embedding_idx")) {
    throw new Error("CockroachDB query plan did not use incidents_embedding_idx for vector search.");
  }

  console.log(
    `COCKROACHDB_SEED_OK incidents=${counts.seedCount} embedded=${counts.embeddedCount} real=${counts.realCount} synthetic=${counts.syntheticCount}`,
  );
  for (const [index, match] of matches.rows.entries()) {
    console.log(
      `VECTOR_MATCH rank=${index + 1} distance=${match.distance} synthetic=${match.synthetic} title=${JSON.stringify(match.title)}`,
    );
  }
  console.log("VECTOR_INDEX_PLAN_OK index=incidents_embedding_idx operator=<->");
} finally {
  await pool.end();
}
