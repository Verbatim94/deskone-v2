import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { platformPrinciples } from "@/features/platform/data";

export function PrinciplesCard() {
  return (
    <Card className="rounded-[2rem] border-slate-200/80 bg-white/85 shadow-[0_20px_60px_-48px_rgba(15,23,42,0.6)]">
      <CardHeader>
        <CardTitle className="text-xl text-slate-950">What stays non-negotiable</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4 md:grid-cols-3">
        {platformPrinciples.map((principle) => (
          <article key={principle.title} className="rounded-[1.5rem] border border-slate-200/70 bg-slate-50 p-5">
            <h3 className="text-base font-semibold text-slate-950">{principle.title}</h3>
            <p className="mt-3 text-sm leading-6 text-slate-600">{principle.description}</p>
          </article>
        ))}
      </CardContent>
    </Card>
  );
}
