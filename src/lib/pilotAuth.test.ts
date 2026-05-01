import { describe, expect, it } from "vitest";
import {
  parsePilotSession,
  readableRoleName,
  resolvePilotRole,
  roleHomePath,
  routeRole,
  serializePilotSession
} from "./pilotAuth";

describe("pilot role helpers", () => {
  it("maps pilot access codes to fixed roles", () => {
    expect(resolvePilotRole("arina")).toBe("child");
    expect(resolvePilotRole("Daria")).toBe("parent");
    expect(resolvePilotRole("  aRiNa  ")).toBe("child");
  });

  it("rejects unknown access codes", () => {
    expect(resolvePilotRole("guest")).toBeNull();
  });

  it("encodes and decodes a session cookie deterministically", () => {
    const value = serializePilotSession({ accessCode: "arina", role: "child" });
    expect(parsePilotSession(value)).toEqual({ accessCode: "arina", role: "child" });
  });

  it("rejects tampered role in cookie payload", () => {
    const value = `${encodeURIComponent("arina")}|parent`;
    expect(parsePilotSession(value)).toBeNull();
  });

  it("maps role-aware routes consistently", () => {
    expect(routeRole("/child")).toBe("child");
    expect(routeRole("/child/session/abc")).toBe("child");
    expect(routeRole("/parent/words/new")).toBe("parent");
    expect(routeRole("/")).toBeNull();

    expect(roleHomePath("child")).toBe("/child");
    expect(roleHomePath("parent")).toBe("/parent");
  });

  it("prints readable role labels for calm messaging", () => {
    expect(readableRoleName("child")).toBe("child pilot");
    expect(readableRoleName("parent")).toBe("parent dashboard");
  });
});
