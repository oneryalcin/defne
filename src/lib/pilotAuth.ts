export type PilotRole = "child" | "parent";

export type PilotSession = {
  username: string;
  role: PilotRole;
};

export const PILOT_SESSION_COOKIE = "defne-pilot-session";

const SESSION_SEPARATOR = "|";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 14;

const PILOT_USER_ROLES = {
  defne: "child",
  daria: "parent"
} as const;

export function getSessionTtlSeconds(): number {
  return SESSION_TTL_SECONDS;
}

export function normalisePilotUsername(username: string): string {
  return username.trim().toLowerCase();
}

export function resolvePilotRole(username: string): PilotRole | null {
  const normalised = normalisePilotUsername(username);
  const role = PILOT_USER_ROLES[normalised as keyof typeof PILOT_USER_ROLES];
  return role ?? null;
}

export function isPilotRole(value: string | null | undefined): value is PilotRole {
  return value === "child" || value === "parent";
}

function safeDecode(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export function serializePilotSession(session: PilotSession): string {
  return `${encodeURIComponent(session.username)}${SESSION_SEPARATOR}${session.role}`;
}

export function parsePilotSession(cookieValue: string | null | undefined): PilotSession | null {
  if (!cookieValue) return null;

  const parts = cookieValue.split(SESSION_SEPARATOR);
  if (parts.length !== 2) return null;

  const [encodedUsername, rolePart] = parts;
  if (!encodedUsername || !isPilotRole(rolePart)) return null;

  const username = safeDecode(encodedUsername);
  const resolvedRole = resolvePilotRole(username);

  if (resolvedRole !== rolePart) return null;

  return {
    username,
    role: resolvedRole
  };
}

export function roleHomePath(role: PilotRole): string {
  return role === "child" ? "/child" : "/parent";
}

export function routeRole(pathname: string): PilotRole | null {
  if (pathname === "/child" || pathname.startsWith("/child/")) return "child";
  if (pathname === "/parent" || pathname.startsWith("/parent/")) return "parent";
  return null;
}

export function readableRoleName(role: PilotRole): string {
  return role === "child" ? "child pilot" : "parent dashboard";
}
