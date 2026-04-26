import { FormEvent, useState } from "react";
import { startTransition } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import deskoneLogo from "@/assets/deskone-logo.png";
import { useAuth } from "@/features/auth/context/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { EdgeClientError } from "@/lib/api-client";

type LoginState = {
  from?: string;
};

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const from = (location.state as LoginState | null)?.from ?? "/";

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      await login({ username, password });
      startTransition(() => {
        navigate(from, { replace: true });
      });
    } catch (error) {
      if (error instanceof EdgeClientError) {
        setErrorMessage(error.message);
      } else {
        setErrorMessage("Unexpected login error.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.18),_transparent_32%),radial-gradient(circle_at_top_right,_rgba(245,158,11,0.14),_transparent_26%),linear-gradient(180deg,_hsl(var(--background)),_hsl(210_20%_98%))] px-4 py-8">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-6xl items-center">
        <div className="grid w-full gap-6 lg:grid-cols-[1.1fr,0.9fr]">
          <section className="rounded-[2.4rem] border border-white/60 bg-white/80 p-8 shadow-[0_24px_80px_-48px_rgba(15,23,42,0.45)] backdrop-blur sm:p-10">
            <Badge className="rounded-full bg-sky-100 px-3 py-1 text-[11px] uppercase tracking-[0.22em] text-sky-700 hover:bg-sky-100">
              Deskone v2
            </Badge>
            <h1 className="mt-6 max-w-2xl text-4xl font-semibold tracking-tight text-slate-950">
              One clean login flow, one session model, one place to reason about access.
            </h1>
            <p className="mt-5 max-w-xl text-base leading-7 text-slate-600">
              We are rebuilding the platform without production pressure. This login flow is intentionally simple, but
              the underlying contract is much more solid than v1.
            </p>

            <div className="mt-8 grid gap-3 text-sm text-slate-700">
              <div className="rounded-[1.3rem] border border-slate-200/70 bg-slate-50 p-4">
                Passwords are stored only as hashes.
              </div>
              <div className="rounded-[1.3rem] border border-slate-200/70 bg-slate-50 p-4">
                Session tokens are hashed server-side and never persisted raw.
              </div>
              <div className="rounded-[1.3rem] border border-slate-200/70 bg-slate-50 p-4">
                Browser access goes through Edge Functions, not directly through business tables.
              </div>
            </div>
          </section>

          <Card className="rounded-[2.4rem] border-white/70 bg-white/90 shadow-[0_24px_80px_-48px_rgba(15,23,42,0.45)]">
            <CardHeader className="space-y-4">
              <div className="flex items-center gap-4">
                <img
                  src={deskoneLogo}
                  alt="Deskone"
                  className="h-14 w-14 rounded-2xl border border-slate-200/70 bg-white object-contain p-2 shadow-sm"
                />
                <div>
                  <CardTitle className="text-2xl text-slate-950">Sign in to v2</CardTitle>
                  <CardDescription className="mt-2 text-sm leading-6 text-slate-600">
                    Same practical internal access model, cleaned up for stability and future scale.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <form className="grid gap-5" onSubmit={handleSubmit}>
                <div className="grid gap-2">
                  <label className="text-sm font-medium text-slate-700" htmlFor="username">
                    Username
                  </label>
                  <Input
                    id="username"
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                    placeholder="Enter your username"
                    autoComplete="username"
                    className="h-11 rounded-xl border-slate-200"
                  />
                </div>

                <div className="grid gap-2">
                  <label className="text-sm font-medium text-slate-700" htmlFor="password">
                    Password
                  </label>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="Enter your password"
                    autoComplete="current-password"
                    className="h-11 rounded-xl border-slate-200"
                  />
                </div>

                {errorMessage ? (
                  <div className="rounded-[1.2rem] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
                    {errorMessage}
                  </div>
                ) : null}

                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="h-11 rounded-xl bg-slate-950 text-white hover:bg-slate-800"
                >
                  {isSubmitting ? "Signing in..." : "Sign in"}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
