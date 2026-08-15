import { createHmac, timingSafeEqual } from "node:crypto";

const SESSION_COOKIE = "evidenceops_session";
const TEST_AUTH_HEADER = "x-evidenceops-test-auth";
const SESSION_LIFETIME_SECONDS = 60 * 60 * 24;

export type LocalAuthentication =
  | { kind: "authenticated"; userId: string }
  | { kind: "signed-out" }
  | { kind: "configuration-error" };

export function isLocalAuthConfigured(environment = process.env): boolean {
  return Boolean(
    environment.LOCAL_AUTH_EMAIL
      && environment.LOCAL_AUTH_PASSWORD
      && environment.LOCAL_AUTH_SESSION_SECRET,
  );
}

export function authenticateLocalRequest(
  request: Request,
  environment = process.env,
): LocalAuthentication {
  if (isFixtureTestRequest(request, environment)) {
    return { kind: "authenticated", userId: "test-operator" };
  }

  const secret = environment.LOCAL_AUTH_SESSION_SECRET;
  if (!isLocalAuthConfigured(environment) || !secret) {
    return { kind: "configuration-error" };
  }

  const session = readCookie(request.headers.get("cookie"), SESSION_COOKIE);
  if (!session) return { kind: "signed-out" };

  const [userId, expiresAt, signature] = session.split(".");
  if (!userId || !expiresAt || !signature || Number(expiresAt) <= Date.now()) {
    return { kind: "signed-out" };
  }

  const expectedSignature = signSession(userId, expiresAt, secret);
  if (!safeEqual(signature, expectedSignature)) return { kind: "signed-out" };

  return { kind: "authenticated", userId };
}

export function verifyLocalCredentials(
  email: string,
  password: string,
  environment = process.env,
): boolean {
  if (!isLocalAuthConfigured(environment)) return false;
  return safeEqual(email, environment.LOCAL_AUTH_EMAIL ?? "")
    && safeEqual(password, environment.LOCAL_AUTH_PASSWORD ?? "");
}

export function createLocalSessionCookie(
  request: Request,
  environment = process.env,
): string | null {
  const secret = environment.LOCAL_AUTH_SESSION_SECRET;
  if (!secret) return null;

  const userId = "local-operator";
  const expiresAt = String(Date.now() + SESSION_LIFETIME_SECONDS * 1000);
  const value = `${userId}.${expiresAt}.${signSession(userId, expiresAt, secret)}`;
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${SESSION_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_LIFETIME_SECONDS}${secure}`;
}

function signSession(userId: string, expiresAt: string, secret: string): string {
  return createHmac("sha256", secret)
    .update(`${userId}.${expiresAt}`)
    .digest("base64url");
}

function readCookie(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) return null;
  const entry = cookieHeader.split(";").find((part) => part.trim().startsWith(`${name}=`));
  return entry ? entry.trim().slice(name.length + 1) : null;
}

function safeEqual(left: string, right: string): boolean {
  const leftValue = Buffer.from(left);
  const rightValue = Buffer.from(right);
  return leftValue.length === rightValue.length
    && timingSafeEqual(leftValue, rightValue);
}

function isFixtureTestRequest(
  request: Request,
  environment: NodeJS.ProcessEnv,
): boolean {
  return environment.NODE_ENV === "test"
    && request.headers.get(TEST_AUTH_HEADER) === "fixture";
}
