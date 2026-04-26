import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { deliveryPhases } from "@/features/platform/data";

const phaseTone: Record<(typeof deliveryPhases)[number]["status"], string> = {
  "in-progress": "bg-sky-100 text-sky-700 hover:bg-sky-100",
  next: "bg-amber-100 text-amber-700 hover:bg-amber-100",
  planned: "bg-slate-100 text-slate-700 hover:bg-slate-100",
};

export function DeliveryPhases() {
  return (
    <Card className="rounded-[2rem] border-slate-200/80 bg-white/85 shadow-[0_20px_60px_-48px_rgba(15,23,42,0.6)]">
      <CardHeader>
        <CardTitle className="text-xl text-slate-950">Delivery phases</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        {deliveryPhases.map((phase, index) => (
          <div
            key={phase.name}
            className="grid gap-4 rounded-[1.5rem] border border-slate-200/70 bg-slate-50 p-5 md:grid-cols-[auto,1fr,auto]"
          >
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-950 text-sm font-semibold text-white">
              {index + 1}
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <h3 className="text-base font-semibold text-slate-950">{phase.name}</h3>
                <Badge className={`rounded-full px-3 py-1 ${phaseTone[phase.status]}`}>{phase.status}</Badge>
              </div>
              <p className="mt-3 text-sm leading-6 text-slate-600">{phase.focus}</p>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
