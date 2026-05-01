import Image from "next/image";
import Link from "next/link";
import { BookOpen, LineChart, Play } from "lucide-react";
import { getHomeStatus } from "@/lib/db/repository";

export const dynamic = "force-dynamic";

export default function HomePage() {
  const status = getHomeStatus();

  return (
    <main className="page">
      <section className="hero-grid">
        <div className="hero-copy">
          <h1>Vocabulary missions that make words stick.</h1>
          <p>
            A local-first practice app for short focused sessions: meaning, usage, spelling, hints, and visible
            mastery movement from red towards green.
          </p>
          <div className="action-row">
            <Link className="button" href="/child">
              <Play size={18} />
              Start child practice
            </Link>
            <Link className="button-secondary" href="/parent">
              <LineChart size={18} />
              Parent dashboard
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

      <section className="mode-grid" aria-label="Choose mode">
        <Link href="/child" className="mode-panel">
          <div>
            <BookOpen size={28} />
            <h2>Child mission</h2>
            <p>One bounded practice session with selected words, hints, and spelling checks.</p>
          </div>
          <span className="button-secondary">Open child mode</span>
        </Link>
        <Link href="/parent" className="mode-panel">
          <div>
            <LineChart size={28} />
            <h2>Parent view</h2>
            <p>Review weak words, spelling traps, recent sessions, and seed or parent-added vocabulary.</p>
          </div>
          <span className="button-secondary">Open parent mode</span>
        </Link>
      </section>
    </main>
  );
}
