import {
  authenticateLocalRequest,
  createLocalSessionCookie,
  isLocalAuthConfigured,
  verifyLocalCredentials,
} from "@/src/adapters/auth/local-auth";

export const dynamic = "force-dynamic";

export function GET(request: Request): Response {
  const authentication = authenticateLocalRequest(request);
  if (authentication.kind === "authenticated") {
    return Response.redirect(new URL(destination(request), request.url));
  }
  if (!isLocalAuthConfigured()) {
    return new Response("Local authentication is not configured.", { status: 503 });
  }
  return new Response(signInPage(request), {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}

export async function POST(request: Request): Promise<Response> {
  if (!isLocalAuthConfigured()) {
    return new Response("Local authentication is not configured.", { status: 503 });
  }
  const form = await request.formData();
  const email = String(form.get("email") ?? "");
  const password = String(form.get("password") ?? "");
  const redirectUrl = String(form.get("redirect_url") ?? "");
  if (!verifyLocalCredentials(email, password)) {
    const signInUrl = new URL("/sign-in", request.url);
    signInUrl.searchParams.set("redirect_url", redirectUrl);
    signInUrl.searchParams.set("error", "invalid-credentials");
    return Response.redirect(signInUrl, 303);
  }
  const cookie = createLocalSessionCookie(request);
  if (!cookie) return new Response("Local authentication is not configured.", { status: 503 });
  return new Response(null, {
    status: 303,
    headers: {
      location: new URL(destination(request, redirectUrl), request.url).toString(),
      "set-cookie": cookie,
    },
  });
}

function destination(request: Request, requested?: string): string {
  const candidate = requested ?? new URL(request.url).searchParams.get("redirect_url") ?? "";
  try {
    const target = new URL(candidate, request.url);
    if (target.origin === new URL(request.url).origin && target.pathname.startsWith("/") && !target.pathname.startsWith("/sign-in")) {
      return `${target.pathname}${target.search}`;
    }
  } catch {
    // Use the dashboard default below.
  }
  return "/dashboard";
}

function signInPage(request: Request): string {
  const redirectUrl = escapeHtml(new URL(request.url).searchParams.get("redirect_url") ?? "/dashboard");
  const error = new URL(request.url).searchParams.get("error") === "invalid-credentials"
    ? '<p role="alert">The email or password is incorrect.</p>'
    : "";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Sign in | EvidenceOps</title><style>body{font-family:system-ui,sans-serif;background:#f6f7fb;margin:0;display:grid;min-height:100vh;place-items:center}.card{background:#fff;border:1px solid #d8dce6;border-radius:12px;padding:2rem;width:min(24rem,calc(100vw - 3rem));box-shadow:0 12px 35px #20305018}label{display:grid;gap:.45rem;margin:1rem 0}input,button{font:inherit;padding:.7rem;border-radius:7px;border:1px solid #aeb6c7}button{background:#5a35e8;color:#fff;border:0;width:100%;font-weight:700;cursor:pointer}p[role=alert]{color:#b42318}</style></head><body><main class="card"><h1>EvidenceOps</h1><p>Sign in to the local development account.</p>${error}<form method="post" action="/sign-in"><input type="hidden" name="redirect_url" value="${redirectUrl}"><label>Email address<input required type="email" name="email" autocomplete="username"></label><label>Password<input required type="password" name="password" autocomplete="current-password"></label><button type="submit">Sign in</button></form></main></body></html>`;
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
