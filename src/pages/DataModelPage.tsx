import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { domainTables } from "@/features/platform/data";

const importRules = [
  "v1 sessions are not migrated. Users will authenticate fresh on v2.",
  "Legacy plaintext passwords are hashed during import, then discarded.",
  "UUIDs are preserved whenever possible so relations stay stable and auditable.",
  "Assignments and reservations remain separate to keep approval and reporting logic explicit.",
  "Imported rooms must be attached to an organization before they become manageable.",
  "User profiles and identity-provider links stay separate so Entra sync can be added later without reshaping room data.",
] as const;

const governanceRules = [
  "Only super-admin manages the platform-wide user list and admin creation.",
  "Admins gain power through organization scope, not through implicit global access.",
  "Sharing groups are organization-scoped and can be reused across many rooms.",
] as const;

const officeRules = [
  "Offices belong to a separate module and stay distinct from generic rooms.",
  "Bookings are valid only on 15-minute boundaries and never exceed 8 hours.",
  "Office owners or admins can release half-day or full-day availability windows.",
] as const;

export default function DataModelPage() {
  return (
    <div className="space-y-6">
      <section className="rounded-[2.4rem] border border-white/60 bg-white/80 p-6 shadow-[0_24px_80px_-48px_rgba(15,23,42,0.45)] backdrop-blur sm:p-8">
        <p className="text-xs uppercase tracking-[0.28em] text-sky-700">Data model</p>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">A database designed to be migrated, not patched forever</h1>
        <p className="mt-4 max-w-3xl text-base leading-7 text-slate-600">
          v2 starts with a normalized core schema and explicit import rules. That keeps the database understandable now
          and makes the eventual cutover from v1 a controlled script instead of a risky manual operation.
        </p>
      </section>

      <Card className="rounded-[2rem] border-slate-200/80 bg-white/85 shadow-[0_20px_60px_-48px_rgba(15,23,42,0.6)]">
        <CardHeader>
          <CardTitle className="text-xl text-slate-950">Core tables</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 lg:grid-cols-2">
          {domainTables.map((table) => (
            <article key={table.name} className="rounded-[1.5rem] border border-slate-200/70 bg-slate-50 p-5">
              <h2 className="font-mono text-sm font-semibold text-slate-950">{table.name}</h2>
              <p className="mt-3 text-sm leading-6 text-slate-600">{table.purpose}</p>
            </article>
          ))}
        </CardContent>
      </Card>

      <Card className="rounded-[2rem] border-slate-200/80 bg-white/85 shadow-[0_20px_60px_-48px_rgba(15,23,42,0.6)]">
        <CardHeader>
          <CardTitle className="text-xl text-slate-950">Import rules for cutover</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3">
          {importRules.map((rule) => (
            <div key={rule} className="rounded-[1.4rem] bg-emerald-50 p-4 text-sm leading-6 text-emerald-950">
              {rule}
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="rounded-[2rem] border-slate-200/80 bg-white/85 shadow-[0_20px_60px_-48px_rgba(15,23,42,0.6)]">
        <CardHeader>
          <CardTitle className="text-xl text-slate-950">Governance rules in the schema</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3">
          {governanceRules.map((rule) => (
            <div key={rule} className="rounded-[1.4rem] bg-sky-50 p-4 text-sm leading-6 text-sky-950">
              {rule}
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="rounded-[2rem] border-slate-200/80 bg-white/85 shadow-[0_20px_60px_-48px_rgba(15,23,42,0.6)]">
        <CardHeader>
          <CardTitle className="text-xl text-slate-950">Office module constraints</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3">
          {officeRules.map((rule) => (
            <div key={rule} className="rounded-[1.4rem] bg-indigo-50 p-4 text-sm leading-6 text-indigo-950">
              {rule}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
