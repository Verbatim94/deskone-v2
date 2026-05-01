import { CalendarRange, DoorClosed, LayoutGrid, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/features/auth/context/useAuth";

export default function PlannerPage() {
  const { activeOrganization } = useAuth();

  return (
    <div className="space-y-8">
      <section className="premium-surface overflow-hidden rounded-[3rem] p-6 sm:p-8">
        <div className="grid gap-6 xl:grid-cols-[1.15fr,0.85fr]">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="playful-chip rounded-full px-3 py-1 text-[11px] uppercase tracking-[0.22em] text-sky-700 hover:bg-sky-50">
                Planner
              </Badge>
              <Badge variant="outline" className="rounded-full border-white/80 bg-white/70 px-3 py-1 text-slate-600">
                {activeOrganization?.name ?? "No environment"}
              </Badge>
            </div>

            <h1 className="premium-display mt-5 max-w-3xl text-[2.45rem] font-semibold tracking-tight text-slate-950 sm:text-[4rem] sm:leading-[1.02]">
              The operational planning surface is coming back into focus, this time on top of the stronger v2 backend.
            </h1>
            <p className="mt-4 max-w-3xl text-base leading-7 text-slate-600">
              We are restoring the v1 information architecture first, then we will rebuild the dense planner experience
              on top of rooms, offices and governance that already exist in the v2 stack.
            </p>
          </div>

          <Card className="premium-dark rounded-[2.25rem] border-slate-900/80 text-white shadow-none">
            <CardContent className="p-6">
              <p className="text-sm font-semibold text-white">Planner parity</p>
              <div className="mt-4 grid gap-3 text-sm text-slate-100">
                <div className="rounded-[1.4rem] border border-white/10 bg-white/5 p-4">
                  Rooms availability and booking rules are already live.
                </div>
                <div className="rounded-[1.4rem] border border-white/10 bg-white/5 p-4">
                  Offices release windows and ownership are already live.
                </div>
                <div className="rounded-[1.4rem] border border-sky-400/20 bg-sky-400/10 p-4 text-sky-50">
                  The missing piece is the dense cross-room planning UI from the v1.
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
              <LayoutGrid className="h-5 w-5 text-sky-700" />
              Rooms first
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm leading-6 text-slate-600">
            <p>The new map, booking model and desk states stay as the modern foundation for planner work.</p>
            <Link to="/shared-rooms">
              <Button className="rounded-full bg-slate-950 text-white hover:bg-slate-800">Open shared rooms</Button>
            </Link>
          </CardContent>
        </Card>

        <Card className="premium-surface rounded-[2.1rem]">
          <CardHeader>
            <CardTitle className="flex items-center gap-3 text-xl text-slate-950">
              <DoorClosed className="h-5 w-5 text-sky-700" />
              Offices linked
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm leading-6 text-slate-600">
            <p>Private offices are no longer a side module. They will feed the planner once we rebuild the dense grid.</p>
            <Link to="/offices">
              <Button className="rounded-full bg-slate-950 text-white hover:bg-slate-800">Open offices</Button>
            </Link>
          </CardContent>
        </Card>

        <Card className="premium-surface rounded-[2.1rem]">
          <CardHeader>
            <CardTitle className="flex items-center gap-3 text-xl text-slate-950">
              <Sparkles className="h-5 w-5 text-sky-700" />
              Next rebuild
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm leading-6 text-slate-600">
            <p>We now have the route and module shell back. The next move is rebuilding the dense planner body from v1.</p>
            <div className="rounded-[1.4rem] border border-dashed border-slate-300 bg-white/70 p-4 text-slate-500">
              Planner grid, approval states and export flow are next.
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
