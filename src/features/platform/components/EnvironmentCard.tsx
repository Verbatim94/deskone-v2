import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { publicEnv } from "@/app/config/env";

export function EnvironmentCard() {
  return (
    <Card className="rounded-[2rem] border-slate-200/80 bg-white/85 shadow-[0_20px_60px_-48px_rgba(15,23,42,0.6)]">
      <CardHeader className="space-y-3">
        <div className="flex items-center justify-between gap-4">
          <div>
            <CardTitle className="text-xl text-slate-950">Environment status</CardTitle>
            <CardDescription className="mt-2 text-sm leading-6 text-slate-600">
              The new app is bound to its own Supabase project, so we can refactor aggressively without touching v1.
            </CardDescription>
          </div>
          <Badge
            className={
              publicEnv.isConfigured
                ? "rounded-full bg-emerald-100 px-3 py-1 text-emerald-700 hover:bg-emerald-100"
                : "rounded-full bg-rose-100 px-3 py-1 text-rose-700 hover:bg-rose-100"
            }
          >
            {publicEnv.isConfigured ? "Ready" : "Needs env"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="grid gap-4 text-sm text-slate-700 md:grid-cols-3">
        <div className="rounded-[1.5rem] bg-slate-50 p-4">
          <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Project</p>
          <p className="mt-3 font-medium text-slate-950">{publicEnv.supabaseProjectId || "Missing"}</p>
        </div>
        <div className="rounded-[1.5rem] bg-slate-50 p-4">
          <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Endpoint</p>
          <p className="mt-3 break-all font-medium text-slate-950">{publicEnv.supabaseUrl || "Missing"}</p>
        </div>
        <div className="rounded-[1.5rem] bg-slate-50 p-4">
          <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Guardrail</p>
          <p className="mt-3 font-medium text-slate-950">Service role stays server-only</p>
        </div>
      </CardContent>
    </Card>
  );
}
