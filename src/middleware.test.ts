import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "./middleware";
import {
  PILOT_SESSION_COOKIE,
  serializePilotSession
} from "./lib/pilotAuth";

function requestCookieValue(accessCode: string, role: "child" | "parent"): string {
  return `${PILOT_SESSION_COOKIE}=${serializePilotSession({ accessCode, role })}`;
}

describe("pilot middleware route guards", () => {
  it("redirects unauthenticated child routes to login with not_logged_in", () => {
    const request = new NextRequest("http://localhost/child/session/abc");
    const response = middleware(request);

    const location = response.headers.get("location");
    expect(location).not.toBeNull();

    const redirectUrl = new URL(location as string);
    expect(redirectUrl.pathname).toBe("/");
    expect(redirectUrl.searchParams.get("error")).toBe("not_logged_in");
    expect(redirectUrl.searchParams.get("required")).toBe("child");
  });

  it("redirects unauthenticated parent routes to login with not_logged_in", () => {
    const request = new NextRequest("http://localhost/parent/words");
    const response = middleware(request);

    const location = response.headers.get("location");
    expect(location).not.toBeNull();

    const redirectUrl = new URL(location as string);
    expect(redirectUrl.pathname).toBe("/");
    expect(redirectUrl.searchParams.get("error")).toBe("not_logged_in");
    expect(redirectUrl.searchParams.get("required")).toBe("parent");
  });

  it("redirects wrong-role sessions with an explicit error", () => {
    const response = middleware(
      new NextRequest("http://localhost/parent/words/new", {
        headers: {
          cookie: requestCookieValue("arina", "child")
        }
      })
    );

    const location = response.headers.get("location");
    expect(location).not.toBeNull();

    const redirectUrl = new URL(location as string);
    expect(redirectUrl.pathname).toBe("/");
    expect(redirectUrl.searchParams.get("error")).toBe("wrong_role");
    expect(redirectUrl.searchParams.get("required")).toBe("parent");
    expect(redirectUrl.searchParams.get("current")).toBe("child");
  });

  it("lets parent sessions access parent routes", () => {
    const response = middleware(
      new NextRequest("http://localhost/parent", {
        headers: {
          cookie: requestCookieValue("daria", "parent")
        }
      })
    );

    expect(response.headers.get("location")).toBeNull();
  });

  it("does not block non-role routes", () => {
    const response = middleware(new NextRequest("http://localhost/"));

    expect(response.headers.get("location")).toBeNull();
  });
});
