import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function NotFoundPage() {
  return (
    <div className="flex min-h-[70vh] items-center justify-center">
      <Card className="w-full max-w-xl rounded-[2rem] border-slate-200/80 bg-white/90 text-center shadow-[0_24px_80px_-48px_rgba(15,23,42,0.45)]">
        <CardHeader>
          <CardTitle className="text-2xl text-slate-950">This route does not exist in v2 yet</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <p className="text-sm leading-6 text-slate-600">
            That is intentional for now. We are bringing features back one domain at a time instead of copying v1
            complexity into the new codebase.
          </p>
          <Button asChild className="rounded-full bg-slate-950 px-5 text-white hover:bg-slate-800">
            <Link to="/">Return to the rebuild dashboard</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
