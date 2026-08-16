import Link from "next/link";

const pillars = [
  {
    number: "01",
    title: "Durable, searched memory",
    body: "Every incident is stored in CockroachDB — structured facts and a vector embedding, not a chat log. When something new happens, EvidenceOps retrieves what's actually similar, not just what matches on keywords.",
  },
  {
    number: "02",
    title: "Evidence-gated investigation",
    body: "An AI investigation runs against one immutable, server-side evidence bundle. Every hypothesis it proposes has to cite evidence that's actually in that bundle — nothing gets asserted that can't be checked.",
  },
  {
    number: "03",
    title: "Human-approved action, always",
    body: "Nothing executes on its own. Every proposed action stops at a decision gate for a person to approve, and every decision — evidence, reasoning, approval — is preserved in a full audit replay.",
  },
];

const roles = [
  ["01", "Investigator", "maps what the incident actually affects, from evidence."],
  ["02", "Historian", "retrieves the closest comparable incident from memory, and shows exactly what's shared versus what's changed since then."],
  ["03", "Planner", "drafts a cautious, simulation-only plan based on both."],
  ["04", "Reviewer", "challenges it before a human ever sees an approve button."],
];

function SignInButton({ className, compact = false }: { className: string; compact?: boolean }) {
  return (
    <form action="/dashboard" className="landing-sign-in-form">
      <button className={className} type="submit">
        Sign in <span aria-hidden="true">{compact ? "↗" : "→"}</span>
      </button>
    </form>
  );
}

export default function Home() {
  return (
    <main className="landing-shell">
      <header className="landing-nav">
        <Link className="landing-brand" href="/" aria-label="EvidenceOps home">
          <span>EO</span>
          <strong>EvidenceOps</strong>
        </Link>
        <SignInButton className="landing-nav-link" compact />
      </header>

      <section className="landing-hero" aria-labelledby="landing-title">
        <div className="landing-hero-copy">
          <p className="landing-kicker"><i /> Evidence-gated incident response</p>
          <h1 id="landing-title">Turn an infrastructure alert into a defensible next step.</h1>
          <p className="landing-lede">EvidenceOps investigates incidents on your servers and sites, checks what happened last time, and proposes a plan — validated against the evidence, and never executed without you.</p>
          <SignInButton className="landing-cta" />
        </div>

        <div className="signal-card" aria-label="Example evidence-gated investigation flow">
          <div className="signal-card-topline"><span>LIVE INCIDENT</span><b>SEV-2</b></div>
          <h2>Evidence before action.</h2>
          <div className="signal-flow">
            <div><em>01</em><span>Evidence bundle</span><i>verified</i></div>
            <div><em>02</em><span>Comparable history</span><i>reviewed</i></div>
            <div><em>03</em><span>Human decision</span><i>required</i></div>
          </div>
          <p>Every recommendation is grounded, constrained, and ready for review.</p>
        </div>
      </section>

      <section className="landing-problem" aria-labelledby="problem-title">
        <p className="landing-section-label">The response gap</p>
        <h2 id="problem-title">An alert on its own isn&apos;t an answer.</h2>
        <p>An alert on its own isn&apos;t an answer. It takes context — what the affected asset actually is, what happened here before, whether that history even applies now — before a response is worth trusting. Most tooling jumps straight from alert to action. EvidenceOps doesn&apos;t.</p>
      </section>

      <section className="landing-section" aria-labelledby="pillars-title">
        <div className="landing-section-heading">
          <p className="landing-section-label">The operating model</p>
          <h2 id="pillars-title">Built for a response you can defend.</h2>
        </div>
        <div className="pillar-grid">
          {pillars.map((pillar) => (
            <article className="pillar-card" key={pillar.number}>
              <span>{pillar.number}</span>
              <h3>{pillar.title}</h3>
              <p>{pillar.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="landing-roles" aria-labelledby="roles-title">
        <div className="landing-roles-intro">
          <p className="landing-section-label">How it works</p>
          <h2 id="roles-title">Four bounded roles, each with one job.</h2>
          <p>A past incident is a lead, not an automatic answer — the Historian&apos;s job is to show you the difference, not paper over it.</p>
        </div>
        <ol className="roles-list">
          {roles.map(([number, title, description]) => (
            <li key={number}>
              <span>{number}</span>
              <div><strong>{title}</strong><p>— {description}</p></div>
              <i aria-hidden="true">↘</i>
            </li>
          ))}
        </ol>
      </section>

      <section className="landing-real" aria-labelledby="operations-title">
        <div className="landing-real-mark" aria-hidden="true"><span>✓</span></div>
        <div>
          <p className="landing-section-label">Grounded in real operations</p>
          <h2 id="operations-title">Built from the failures that matter.</h2>
          <p>EvidenceOps&apos; incident memory isn&apos;t synthetic. It&apos;s seeded from real infrastructure failures — a cache running out of memory and quietly stalling an email platform&apos;s send queue, a PHP worker pool exhausted by unoptimized front-end code, a supply-chain vulnerability discovered live across dozens of hosted sites. Real symptoms, real root causes, real fixes — not a rented demo dataset.</p>
        </div>
      </section>

      <footer className="landing-footer">
        <div><span className="landing-footer-mark">EO</span><strong>EvidenceOps</strong></div>
        <p>Built for the CockroachDB × AWS Hackathon — CockroachDB for durable and vector-searched memory, AWS Bedrock for evidence-gated investigation.</p>
        <SignInButton className="landing-footer-cta" />
      </footer>
    </main>
  );
}
