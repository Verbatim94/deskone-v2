import { CheckCircle2, Clock3, ShieldCheck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/features/auth/context/useAuth";

export default function PendingApprovalsPage() {
  const { activeOrganization } = useAuth();

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center gap-2">
        <Badge className="playful-chip rounded-full px-3 py-1 text-[11px] uppercase tracking-[0.22em] text-sky-700 hover:bg-sky-50">
          Pending approvals
        </Badge>
        <Badge variant="outline" className="rounded-full border-slate-200 bg-white px-3 py-1 text-slate-600">
          {activeOrganization?.name ?? "No environment"}
        </Badge>
      </div>

      <section className="hidden premium-surface overflow-hidden rounded-[3rem] p-6 sm:p-8">
        <div className="grid gap-6 xl:grid-cols-[1.15fr,0.85fr]">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="playful-chip rounded-full px-3 py-1 text-[11px] uppercase tracking-[0.22em] text-sky-700 hover:bg-sky-50">
                Pending approvals
              </Badge>
              <Badge variant="outline" className="rounded-full border-white/80 bg-white/70 px-3 py-1 text-slate-600">
                {activeOrganization?.name ?? "No environment"}
              </Badge>
            </div>

            <h1 className="premium-display mt-5 max-w-3xl text-[2.45rem] font-semibold tracking-tight text-slate-950 sm:text-[4rem] sm:leading-[1.02]">
              Approval flow is back in the architecture so we can rebuild it cleanly on the stronger v2 rules.
            </h1>
            <p className="mt-4 max-w-3xl text-base leading-7 text-slate-600">
              In the v1 this was a dense operational queue. In the v2 we will restore that experience once planner and
              reservation policy surfaces are fully back in place.
            </p>
          </div>

          <Card className="premium-dark rounded-[2.25rem] border-slate-900/80 text-white shadow-none">
            <CardContent className="p-6">
              <p className="text-sm font-semibold text-white">Approval direction</p>
              <div className="mt-4 grid gap-3 text-sm text-slate-100">
                <div className="rounded-[1.4rem] border border-white/10 bg-white/5 p-4">
                  Explicit policy states instead of hidden branching logic.
                </div>
                <div className="rounded-[1.4rem] border border-white/10 bg-white/5 p-4">
                  Clear operator queue linked to planner and room access.
                </div>
                <div className="rounded-[1.4rem] border border-sky-400/20 bg-sky-400/10 p-4 text-sky-50">
                  Stronger auditability than the v1.
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="premium-surface rounded-[2.1rem]">
          <CardHeader>
            <CardTitle className="flex items-center gap-3 text-xl text-slate-950">
              <Clock3 className="h-5 w-5 text-sky-700" />
              Queue model
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm leading-6 text-slate-600">
            Approval items will become a first-class queue again instead of being lost inside other pages.
          </CardContent>
        </Card>

        <Card className="premium-surface rounded-[2.1rem]">
          <CardHeader>
            <CardTitle className="flex items-center gap-3 text-xl text-slate-950">
              <ShieldCheck className="h-5 w-5 text-sky-700" />
              Policy
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm leading-6 text-slate-600">
            Approval routing will respect the new v2 security and governance model instead of bypassing it.
          </CardContent>
        </Card>

        <Card className="premium-surface rounded-[2.1rem]">
          <CardHeader>
            <CardTitle className="flex items-center gap-3 text-xl text-slate-950">
              <CheckCircle2 className="h-5 w-5 text-sky-700" />
              Next
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm leading-6 text-slate-600">
            The next concrete step is rebuilding the actual approvals table and action flow, not just the route shell.
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
