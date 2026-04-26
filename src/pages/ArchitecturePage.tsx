import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const flowSteps = [
  {
    title: "UI routes",
    description: "Route components stay thin. They orchestrate state and render, but do not own business rules.",
  },
  {
    title: "Feature APIs",
    description: "Each feature gets a typed client and predictable query keys, so caching and invalidation stay local.",
  },
  {
    title: "Edge service layer",
    description: "Authorization, session validation and write rules run here, not in the browser.",
  },
  {
    title: "Postgres domain tables",
    description: "The database stays normalized, importable and optimized with indexes that match access patterns.",
  },
  {
    title: "Identity adapter",
    description: "Local auth works today, while identity linkage is kept separate so Entra/Azure can plug in later.",
  },
] as const;

const risksWeAreAvoiding = [
  "Mixed auth models that disagree on who the current user is.",
  "Direct browser writes to business tables with hidden policy coupling.",
  "Repeated fetch logic scattered through pages and dialogs.",
  "Schema changes that break production because v1 and v2 share the same runtime.",
  "Global admins acting without explicit environment scope.",
  "Tying business authorization only to identity-provider group claims.",
] as const;

const securityPillars = [
  "Super-admin controls the directory and organization assignments centrally.",
  "Admins operate only inside organizations they are explicitly assigned to.",
  "Edge Functions own privileged checks, conflict logic and scope enforcement.",
  "Identity-provider linkage is isolated from room, reservation and sharing tables.",
  "Privileged actions are expected to land in an immutable audit trail.",
] as const;

export default function ArchitecturePage() {
  return (
    <div className="space-y-6">
      <section className="rounded-[2.4rem] border border-white/60 bg-white/80 p-6 shadow-[0_24px_80px_-48px_rgba(15,23,42,0.45)] backdrop-blur sm:p-8">
        <p className="text-xs uppercase tracking-[0.28em] text-sky-700">Architecture</p>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">Service boundaries first</h1>
        <p className="mt-4 max-w-3xl text-base leading-7 text-slate-600">
          The goal is not to make the system more complex. The goal is to make each layer responsible for one thing,
          so performance tuning and future changes stay local instead of leaking through the whole app.
        </p>
      </section>

      <Card className="rounded-[2rem] border-slate-200/80 bg-white/85 shadow-[0_20px_60px_-48px_rgba(15,23,42,0.6)]">
        <CardHeader>
          <CardTitle className="text-xl text-slate-950">Target request flow</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 lg:grid-cols-4">
          {flowSteps.map((step) => (
            <article key={step.title} className="rounded-[1.5rem] border border-slate-200/70 bg-slate-50 p-5">
              <h2 className="text-base font-semibold text-slate-950">{step.title}</h2>
              <p className="mt-3 text-sm leading-6 text-slate-600">{step.description}</p>
            </article>
          ))}
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[1.15fr,0.85fr]">
        <Card className="rounded-[2rem] border-slate-200/80 bg-white/85 shadow-[0_20px_60px_-48px_rgba(15,23,42,0.6)]">
          <CardHeader>
            <CardTitle className="text-xl text-slate-950">Performance posture</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 text-sm leading-6 text-slate-600">
            <div className="rounded-[1.4rem] bg-slate-50 p-5">
              Query defaults are tuned to avoid noisy refetches and useless retries on unauthorized responses.
            </div>
            <div className="rounded-[1.4rem] bg-slate-50 p-5">
              Route-level lazy loading keeps the entry bundle slim while the product surface grows.
            </div>
            <div className="rounded-[1.4rem] bg-slate-50 p-5">
              Schema indexes were added against actual read patterns: by room, date, status and user.
            </div>
            <div className="rounded-[1.4rem] bg-slate-50 p-5">
              Tenant scoping is explicit in the schema, which keeps future query plans and authorization filters predictable.
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-[2rem] border-slate-200/80 bg-white/85 shadow-[0_20px_60px_-48px_rgba(15,23,42,0.6)]">
          <CardHeader>
            <CardTitle className="text-xl text-slate-950">Risks we are removing</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            {risksWeAreAvoiding.map((risk) => (
              <div key={risk} className="rounded-[1.4rem] border border-rose-200/70 bg-rose-50 p-4 text-sm leading-6 text-rose-900">
                {risk}
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-[2rem] border-slate-200/80 bg-white/85 shadow-[0_20px_60px_-48px_rgba(15,23,42,0.6)]">
        <CardHeader>
          <CardTitle className="text-xl text-slate-950">Security and governance posture</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 lg:grid-cols-2">
          {securityPillars.map((pillar) => (
            <article key={pillar} className="rounded-[1.5rem] border border-slate-200/70 bg-slate-50 p-5 text-sm leading-6 text-slate-600">
              {pillar}
            </article>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
