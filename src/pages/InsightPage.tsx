import { BarChart3, Building2, LineChart, Sparkles } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/features/auth/context/useAuth";

export default function InsightPage() {
  const { activeOrganization } = useAuth();

  return (
    <div className="space-y-8">
      <section className="premium-surface overflow-hidden rounded-[3rem] p-6 sm:p-8">
        <div className="grid gap-6 xl:grid-cols-[1.15fr,0.85fr]">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="playful-chip rounded-full px-3 py-1 text-[11px] uppercase tracking-[0.22em] text-sky-700 hover:bg-sky-50">
                Insight
              </Badge>
              <Badge variant="outline" className="rounded-full border-white/80 bg-white/70 px-3 py-1 text-slate-600">
                {activeOrganization?.name ?? "No environment"}
              </Badge>
            </div>

            <h1 className="premium-display mt-5 max-w-3xl text-[2.45rem] font-semibold tracking-tight text-slate-950 sm:text-[4rem] sm:leading-[1.02]">
              Insight is back as a destination, ready for the richer analytics layer the v2 actually deserves.
            </h1>
            <p className="mt-4 max-w-3xl text-base leading-7 text-slate-600">
              The v1 already hinted at a true analytics surface. In the v2 we can rebuild it on much cleaner rooms,
              offices, groups and organization scope instead of stitching data together page by page.
            </p>
          </div>

          <Card className="premium-dark rounded-[2.25rem] border-slate-900/80 text-white shadow-none">
            <CardContent className="p-6">
              <p className="text-sm font-semibold text-white">Insight direction</p>
              <div className="mt-4 grid gap-3 text-sm text-slate-100">
                <div className="rounded-[1.4rem] border border-white/10 bg-white/5 p-4">
                  Occupancy and room mix will come from the new room model.
                </div>
                <div className="rounded-[1.4rem] border border-white/10 bg-white/5 p-4">
                  Office usage and release patterns can join the same reporting surface.
                </div>
                <div className="rounded-[1.4rem] border border-sky-400/20 bg-sky-400/10 p-4 text-sky-50">
                  Governance data is now clean enough to support multi-organization insight.
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
              <Building2 className="h-5 w-5 text-sky-700" />
              Utilization
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm leading-6 text-slate-600">
            We can now rebuild room and office utilization on top of a much cleaner domain model.
          </CardContent>
        </Card>

        <Card className="premium-surface rounded-[2.1rem]">
          <CardHeader>
            <CardTitle className="flex items-center gap-3 text-xl text-slate-950">
              <LineChart className="h-5 w-5 text-sky-700" />
              Trends
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm leading-6 text-slate-600">
            Historical patterns no longer need to be reconstructed from fragile client-side joins.
          </CardContent>
        </Card>

        <Card className="premium-surface rounded-[2.1rem]">
          <CardHeader>
            <CardTitle className="flex items-center gap-3 text-xl text-slate-950">
              <BarChart3 className="h-5 w-5 text-sky-700" />
              Next
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm leading-6 text-slate-600">
            The route is restored; the next step is rebuilding the actual executive analytics surface from the v1.
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
