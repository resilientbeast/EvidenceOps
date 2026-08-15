import { NextResponse, type NextRequest } from "next/server";
import { authenticateLocalRequest } from "@/src/adapters/auth/local-auth";

const PUBLIC_PATHS = new Set(["/", "/api/health"]);

export function proxy(request: NextRequest): Response {
  const { pathname } = request.nextUrl;
  if (isPublicPath(pathname)) return NextResponse.next();

  const authentication = authenticateLocalRequest(request);
  if (authentication.kind === "authenticated") {
    return NextResponse.next();
  }
  if (authentication.kind === "configuration-error") {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { error: "Local authentication is not configured." },
        { status: 503 },
      );
    }
    return new NextResponse("Local authentication is not configured.", { status: 503 });
  }

  const signInUrl = new URL("/sign-in", request.url);
  signInUrl.searchParams.set("redirect_url", request.url);
  return NextResponse.redirect(signInUrl);
}

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.has(pathname)
    || pathname.startsWith("/_next/")
    || pathname.startsWith("/_vinext/")
    || pathname === "/favicon.svg"
    || pathname === "/sign-in"
    || pathname.startsWith("/sign-in/")
}
