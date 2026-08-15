import { authenticateLocalRequest } from "@/src/adapters/auth/local-auth";

export type AuthenticatedApiUser = {
  userId: string;
};

export async function requireAuthenticatedApiUser(
  request: Request,
): Promise<AuthenticatedApiUser | Response> {
  const authentication = authenticateLocalRequest(request);
  if (authentication.kind === "authenticated") {
    return { userId: authentication.userId };
  }

  if (authentication.kind === "configuration-error") {
    return Response.json(
      { error: "Local authentication is not configured." },
      { status: 503 },
    );
  }

  return Response.json({ error: "Authentication is required." }, { status: 401 });
}
