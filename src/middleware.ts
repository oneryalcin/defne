import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  PILOT_SESSION_COOKIE,
  parsePilotSession,
  routeRole
} from "@/lib/pilotAuth";

export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const requiredRole = routeRole(pathname);

  if (!requiredRole) {
    return NextResponse.next();
  }

  const session = parsePilotSession(request.cookies.get(PILOT_SESSION_COOKIE)?.value);

  if (!session) {
    const loginUrl = new URL("/", request.url);
    loginUrl.searchParams.set("error", "not_logged_in");
    loginUrl.searchParams.set("required", requiredRole);
    return NextResponse.redirect(loginUrl);
  }

  if (session.role !== requiredRole) {
    const loginUrl = new URL("/", request.url);
    loginUrl.searchParams.set("error", "wrong_role");
    loginUrl.searchParams.set("required", requiredRole);
    loginUrl.searchParams.set("current", session.role);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/child/:path*", "/parent/:path*"]
};
