# Local operator authentication

EvidenceOps uses a local operator account with a signed, HTTP-only session
cookie. It has no dependency on Clerk or another external identity service.

Set these server-only environment values:

```env
LOCAL_AUTH_EMAIL=operator@evidenceops.local
LOCAL_AUTH_PASSWORD=use-a-unique-long-password
LOCAL_AUTH_SESSION_SECRET=use-a-random-32-byte-or-longer-secret
```

`/dashboard` and the incident/catalog APIs require the session. `/api/health`
remains public. Local browser sessions expire after 24 hours and use `Secure`
cookies automatically when served over HTTPS.
