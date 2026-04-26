import { FormEvent, useState } from "react";
import { startTransition } from "react";
import { Navigate, useNavigate } from "react-router-dom";

import deskoneLogo from "@/assets/deskone-logo.png";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/features/auth/context/useAuth";
import { EdgeClientError } from "@/lib/api-client";

export default function SetPasswordPage() {
  const navigate = useNavigate();
  const { user, changePassword, refreshSession } = useAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (user && !user.mustChangePassword) {
    return <Navigate to="/" replace />;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);

    if (newPassword !== confirmPassword) {
      setErrorMessage("The new password confirmation does not match.");
      return;
    }

    setIsSubmitting(true);

    try {
      const nextSession = await changePassword({
        currentPassword,
        newPassword,
      });

      if (!nextSession?.user.mustChangePassword) {
        startTransition(() => {
          navigate("/", { replace: true });
        });
        return;
      }

      await refreshSession();
    } catch (error) {
      if (error instanceof EdgeClientError) {
        setErrorMessage(error.message);
      } else {
        setErrorMessage("Unable to update the password right now.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.16),_transparent_34%),radial-gradient(circle_at_top_right,_rgba(245,158,11,0.12),_transparent_28%),linear-gradient(180deg,_hsl(var(--background)),_hsl(210_20%_98%))] px-4 py-8">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-5xl items-center">
        <div className="grid w-full gap-6 lg:grid-cols-[1.05fr,0.95fr]">
          <section className="rounded-[2.4rem] border border-white/60 bg-white/80 p-8 shadow-[0_24px_80px_-48px_rgba(15,23,42,0.45)] backdrop-blur sm:p-10">
            <Badge className="rounded-full bg-amber-100 px-3 py-1 text-[11px] uppercase tracking-[0.22em] text-amber-700 hover:bg-amber-100">
              First access
            </Badge>
            <h1 className="mt-6 max-w-2xl text-4xl font-semibold tracking-tight text-slate-950">
              Set a personal password before entering the workspace.
            </h1>
            <p className="mt-5 max-w-xl text-base leading-7 text-slate-600">
              Your access was activated with a temporary credential. Before continuing, choose a password that only you
              know. This step closes the activation flow and unlocks the full product.
            </p>

            <div className="mt-8 grid gap-3 text-sm text-slate-700">
              <div className="rounded-[1.3rem] border border-slate-200/70 bg-slate-50 p-4">
                Use the temporary password you received from the platform admin as the current password.
              </div>
              <div className="rounded-[1.3rem] border border-slate-200/70 bg-slate-50 p-4">
                New passwords must be at least 12 characters long and include both letters and numbers.
              </div>
              <div className="rounded-[1.3rem] border border-slate-200/70 bg-slate-50 p-4">
                Once saved, the temporary password stops being the credential of record.
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
                  <CardTitle className="text-2xl text-slate-950">Secure your account</CardTitle>
                  <CardDescription className="mt-2 text-sm leading-6 text-slate-600">
                    {user ? `Signed in as ${user.displayName || user.username}.` : "Complete the activation flow."}
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <form className="grid gap-5" onSubmit={handleSubmit}>
                <div className="grid gap-2">
                  <label className="text-sm font-medium text-slate-700" htmlFor="current-password">
                    Temporary password
                  </label>
                  <Input
                    id="current-password"
                    type="password"
                    value={currentPassword}
                    onChange={(event) => setCurrentPassword(event.target.value)}
                    placeholder="Enter the temporary password"
                    autoComplete="current-password"
                    className="h-11 rounded-xl border-slate-200"
                  />
                </div>

                <div className="grid gap-2">
                  <label className="text-sm font-medium text-slate-700" htmlFor="new-password">
                    New password
                  </label>
                  <Input
                    id="new-password"
                    type="password"
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                    placeholder="Create your new password"
                    autoComplete="new-password"
                    className="h-11 rounded-xl border-slate-200"
                  />
                </div>

                <div className="grid gap-2">
                  <label className="text-sm font-medium text-slate-700" htmlFor="confirm-password">
                    Confirm new password
                  </label>
                  <Input
                    id="confirm-password"
                    type="password"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    placeholder="Repeat the new password"
                    autoComplete="new-password"
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
                  {isSubmitting ? "Updating password..." : "Save password and continue"}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
