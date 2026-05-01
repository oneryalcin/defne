import Image from "next/image";
import Link from "next/link";
import { Play } from "lucide-react";
import { cookies } from "next/headers";
import { getHomeStatus } from "@/lib/db/repository";
import { loginAction } from "./actions";
import {
  PILOT_SESSION_COOKIE,
  parsePilotSession,
  readableRoleName,
  roleHomePath,
  type PilotRole
} from "@/lib/pilotAuth";

export const dynamic = "force-dynamic";

type HomeSearchParams = {
  error?: string;
  required?: string;
  current?: string;
};

export default async function HomePage({
  searchParams
}: {
  searchParams: Promise<HomeSearchParams> | HomeSearchParams;
}) {
  const status = getHomeStatus();
  const { error, required, current } = await Promise.resolve(searchParams);
  const cookieStore = await cookies();
  const session = parsePilotSession(cookieStore.get(PILOT_SESSION_COOKIE)?.value);
  const requiredRole = isPilotRoleValue(required) ? required : undefined;

  if (!session) {
    return (
      <main className="page">
        <section className="hero-grid">
          <div className="hero-copy">
            <p className="metric-label">Pilot auth</p>
            <h1>Enter your local access code.</h1>
            <p>
              This is local-only and intentional for the pilot: no account creation and no external identity service.
            </p>

            <form action={loginAction} className="mission-panel login-form">
              {error || required ? <p className="error-callout">{loginErrorMessage(error, requiredRole, current)}</p> : null}

              <label>
                Access code
                <input className="field" name="accessCode" autoComplete="off" required placeholder="Enter access code" />
              </label>

              {requiredRole ? <input type="hidden" name="next" value={roleHomePath(requiredRole)} /> : null}

              <div className="action-row">
                <button className="button" type="submit">
                  Continue
                </button>
              </div>
            </form>
          </div>
          <div className="visual-frame">
            <Image
              src="/assets/visual-concepts/02-child-daily-mission-loop.png"
              alt="Vocabulary mission concept with a pencil-drawn helper character"
              width={1536}
              height={1024}
              priority
            />
          </div>
        </section>

        <section className="mission-strip" aria-label="Local app status">
          <div className="metric-strip">
            <span className="metric-label">Active words</span>
            <span className="metric-value">{status.wordCount}</span>
          </div>
          <div className="metric-strip">
            <span className="metric-label">Ready for practice</span>
            <span className="metric-value">{status.completeWordCount}</span>
          </div>
        </section>
      </main>
    );
  }

  const roleHome = roleHomePath(session.role);

  return (
    <main className="page">
      <section className="hero-grid">
        <div className="hero-copy">
          <p className="metric-label">Current mode</p>
          <h1>Welcome back.</h1>
          <p>
            You are in {readableRoleName(session.role)} mode for this local session. Use the switch-user control to test
            the other role quickly.
          </p>

          <div className="action-row">
            <Link className="button" href={roleHome}>
              <Play size={18} />
              {session.role === "child" ? "Open child practice" : "Open parent dashboard"}
            </Link>
          </div>
        </div>

        <div className="visual-frame">
          <Image
            src="/assets/visual-concepts/02-child-daily-mission-loop.png"
            alt="Vocabulary mission concept with a pencil-drawn helper character"
            width={1536}
            height={1024}
            priority
          />
        </div>
      </section>

      <section className="mission-strip" aria-label="Local app status">
        <div className="metric-strip">
          <span className="metric-label">Learner</span>
          <span className="metric-value">{status.learnerName}</span>
        </div>
        <div className="metric-strip">
          <span className="metric-label">Active words</span>
          <span className="metric-value">{status.wordCount}</span>
        </div>
        <div className="metric-strip">
          <span className="metric-label">Ready for practice</span>
          <span className="metric-value">{status.completeWordCount}</span>
        </div>
      </section>
    </main>
  );
}

function isPilotRoleValue(value: string | undefined): value is PilotRole {
  return value === "child" || value === "parent";
}

function loginErrorMessage(error?: string, required?: PilotRole, current?: string): string {
  if (error === "unknown_user") {
    return "That access code is not recognised.";
  }

  if (error === "wrong_role" && required && current) {
    return `You are signed in as ${current}. Switch user to open ${required} mode.`;
  }

  if (error === "not_logged_in" && required) {
    return `Please sign in to open ${required} mode.`;
  }

  return "Sign in to continue.";
}
