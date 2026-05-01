import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LoaderCircle, MessageSquareMore, Send, ShieldAlert, Sparkles, Wrench } from "lucide-react";

import { useAuth } from "@/features/auth/context/useAuth";
import { createReport, getReports, updateReport, type ReportStatus, type ReportTargetType } from "@/features/reports/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/sonner";
import { EdgeClientError } from "@/lib/api-client";

const targetTypeLabels: Record<ReportTargetType, string> = {
  general: "General",
  room: "Room",
  desk: "Desk",
  office: "Office",
  reservation: "Reservation",
  office_booking: "Office booking",
};

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("it-IT", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function statusBadgeClasses(status: ReportStatus) {
  switch (status) {
    case "resolved":
      return "bg-emerald-100 text-emerald-800 hover:bg-emerald-100";
    case "dismissed":
      return "bg-slate-200 text-slate-700 hover:bg-slate-200";
    default:
      return "bg-amber-100 text-amber-800 hover:bg-amber-100";
  }
}

export default function ReportsPage() {
  const queryClient = useQueryClient();
  const { activeOrganization, activeOrganizationId } = useAuth();
  const [targetType, setTargetType] = useState<ReportTargetType>("general");
  const [targetId, setTargetId] = useState("");
  const [comment, setComment] = useState("");

  const reportsQuery = useQuery({
    queryKey: ["reports", activeOrganizationId],
    enabled: Boolean(activeOrganizationId),
    queryFn: () => getReports(activeOrganizationId!),
  });

  const canManageReports = useMemo(
    () => reportsQuery.data?.organization.membershipRole === "admin",
    [reportsQuery.data?.organization.membershipRole],
  );

  const createReportMutation = useMutation({
    mutationFn: async () => {
      if (!activeOrganizationId) {
        throw new Error("Missing organization.");
      }

      return createReport({
        organizationId: activeOrganizationId,
        targetType,
        targetId: targetId || null,
        comment,
      });
    },
    onSuccess: () => {
      toast.success("Support item submitted.");
      setComment("");
      setTargetId("");
      void queryClient.invalidateQueries({ queryKey: ["reports", activeOrganizationId] });
    },
    onError: (error) => {
      const message = error instanceof EdgeClientError ? error.message : "Unable to submit the support item.";
      toast.error(message);
    },
  });

  const updateReportMutation = useMutation({
    mutationFn: async ({ reportId, status }: { reportId: string; status: ReportStatus }) => {
      if (!activeOrganizationId) {
        throw new Error("Missing organization.");
      }

      return updateReport({
        organizationId: activeOrganizationId,
        reportId,
        status,
      });
    },
    onSuccess: (_, variables) => {
      toast.success(`Support item marked as ${variables.status}.`);
      void queryClient.invalidateQueries({ queryKey: ["reports", activeOrganizationId] });
    },
    onError: (error) => {
      const message = error instanceof EdgeClientError ? error.message : "Unable to update the support item.";
      toast.error(message);
    },
  });

  const reports = reportsQuery.data?.reports ?? [];
  const openReports = reports.filter((report) => report.status === "open");
  const resolvedReports = reports.filter((report) => report.status === "resolved");

  if (!activeOrganizationId || !activeOrganization) {
    return (
      <Card className="premium-surface rounded-[2.2rem]">
        <CardContent className="p-8 text-sm leading-7 text-slate-600">
          Support is tied to a specific environment. As soon as an active workspace is available, people will be able
          to leave comments here and admins will see the live queue.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-8">
      <section className="premium-surface overflow-hidden rounded-[3rem] p-6 sm:p-8">
        <div className="grid gap-6 xl:grid-cols-[1.12fr,0.88fr]">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="playful-chip inline-flex rounded-full px-3 py-1 text-[11px] uppercase tracking-[0.22em] text-sky-700">
                Support
              </span>
              <span className="inline-flex rounded-full border border-white/80 bg-white/70 px-3 py-1 text-xs text-slate-600">
                {activeOrganization.name}
              </span>
            </div>
            <h1 className="premium-display mt-5 max-w-3xl text-[2.45rem] font-semibold tracking-tight text-slate-950 sm:text-[4rem] sm:leading-[1.02]">
              Keep support lightweight for people, visible for operators and calm enough to trust every day.
            </h1>
            <p className="mt-4 max-w-3xl text-base leading-7 text-slate-600">
              Support inside <span className="font-medium text-slate-900">{activeOrganization.name}</span> should feel
              fast and low-friction. Pick a target, add a crisp comment and keep the queue readable for whoever owns the
              workspace.
            </p>
          </div>

          <div className="grid gap-3">
            <div className="rounded-[1.7rem] border border-white/80 bg-white/76 p-5 shadow-[0_20px_40px_-28px_rgba(15,23,42,0.16)] backdrop-blur">
              <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Queue shape</p>
              <p className="mt-3 text-2xl font-semibold text-slate-950">{openReports.length}</p>
              <p className="mt-2 text-sm leading-6 text-slate-600">Open items still waiting for review or resolution.</p>
            </div>
            <div className="rounded-[1.7rem] border border-white/80 bg-white/76 p-5 shadow-[0_20px_40px_-28px_rgba(15,23,42,0.16)] backdrop-blur">
              <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Resolved</p>
              <p className="mt-3 text-2xl font-semibold text-slate-950">{resolvedReports.length}</p>
              <p className="mt-2 text-sm leading-6 text-slate-600">Items already closed and preserved in the timeline.</p>
            </div>
            <div className="premium-dark rounded-[1.8rem] border border-slate-900/80 p-5 text-slate-50">
              <p className="text-[11px] uppercase tracking-[0.18em] text-slate-300">Visibility</p>
              <p className="mt-3 text-lg font-semibold text-white">
                {canManageReports ? "Full workspace moderation" : "Personal support stream"}
              </p>
              <p className="mt-2 text-sm leading-6 text-slate-300">
                {canManageReports
                  ? "You can triage, resolve and reopen support items for the whole environment."
                  : "You see only your own items, while operators keep the wider queue under control."}
              </p>
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[0.94fr,1.06fr]">
        <Card className="premium-surface rounded-[2.2rem]">
          <CardHeader>
            <CardTitle className="flex items-center gap-3 text-xl text-slate-950">
              <Sparkles className="h-5 w-5 text-sky-700" />
              New support item
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-2">
              <label className="text-sm font-medium text-slate-700" htmlFor="report-target-type">
                Target type
              </label>
              <select
                id="report-target-type"
                value={targetType}
                onChange={(event) => setTargetType(event.target.value as ReportTargetType)}
                className="h-11 rounded-2xl border border-white/80 bg-[linear-gradient(180deg,rgba(244,247,255,0.92),rgba(255,255,255,0.98))] px-3 text-sm text-slate-700 outline-none transition focus:border-sky-300"
              >
                {Object.entries(targetTypeLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid gap-2">
              <label className="text-sm font-medium text-slate-700" htmlFor="report-target-id">
                Target id
              </label>
              <Input
                id="report-target-id"
                value={targetId}
                onChange={(event) => setTargetId(event.target.value)}
                placeholder={targetType === "general" ? "Optional" : "Example: desk-a104 or office-b"}
                className="rounded-2xl border-white/80 bg-white/85"
              />
            </div>

            <div className="grid gap-2">
              <label className="text-sm font-medium text-slate-700" htmlFor="report-comment">
                Comment
              </label>
              <textarea
                id="report-comment"
                value={comment}
                onChange={(event) => setComment(event.target.value)}
                className="min-h-[170px] rounded-[1.6rem] border border-white/80 bg-white/85 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-sky-300"
                placeholder="Describe the issue in a few clear lines. Keep it simple enough for fast triage."
              />
            </div>

            <Button
              type="button"
              className="h-11 rounded-full bg-slate-950 text-white shadow-[0_24px_42px_-28px_rgba(15,23,42,0.75)] hover:bg-slate-800"
              onClick={() => createReportMutation.mutate()}
              disabled={createReportMutation.isPending}
            >
              <Send className="mr-2 h-4 w-4" />
              {createReportMutation.isPending ? "Submitting..." : "Submit support item"}
            </Button>
          </CardContent>
        </Card>

        <Card className="premium-surface rounded-[2.2rem]">
          <CardHeader>
            <CardTitle className="text-xl text-slate-950">
              {canManageReports ? "Workspace queue" : "Your support items"}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            {reportsQuery.isLoading ? (
              <div className="rounded-[1.6rem] border border-slate-200/70 bg-white/80 p-6 text-sm text-slate-600">
                <LoaderCircle className="mb-3 h-5 w-5 animate-spin text-sky-700" />
                Loading support activity...
              </div>
            ) : null}

            {!reportsQuery.isLoading && !reports.length ? (
              <div className="rounded-[1.6rem] border border-dashed border-slate-300 bg-white/70 p-6 text-sm text-slate-500">
                No support items yet for this environment.
              </div>
            ) : null}

            {reports.map((report) => (
              <article
                key={report.id}
                className="rounded-[1.65rem] border border-white/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.94),rgba(244,247,255,0.9))] p-5 shadow-[0_20px_40px_-30px_rgba(15,23,42,0.14)]"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-slate-950">
                    <MessageSquareMore className="h-4 w-4 text-sky-700" />
                    <span className="font-semibold">
                      {targetTypeLabels[report.targetType]}
                      {report.targetId ? ` · ${report.targetId}` : ""}
                    </span>
                  </div>
                  <span className={`rounded-full px-3 py-1 text-xs font-medium ${statusBadgeClasses(report.status)}`}>
                    {report.status}
                  </span>
                </div>

                <p className="mt-3 text-sm leading-6 text-slate-600">{report.comment}</p>

                <div className="mt-4 flex flex-wrap items-center gap-4 text-xs uppercase tracking-[0.16em] text-slate-500">
                  <span>{report.authorLabel ?? "Unknown author"}</span>
                  <span>{formatDateTime(report.createdAt)}</span>
                  <span className="inline-flex items-center gap-1">
                    {report.status === "open" ? (
                      <>
                        <ShieldAlert className="h-3.5 w-3.5" />
                        Needs review
                      </>
                    ) : (
                      <>
                        <Wrench className="h-3.5 w-3.5" />
                        {report.status}
                      </>
                    )}
                  </span>
                </div>

                {report.canManage ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="rounded-full border-white/80 bg-white/85"
                      onClick={() => updateReportMutation.mutate({ reportId: report.id, status: "resolved" })}
                      disabled={updateReportMutation.isPending || report.status === "resolved"}
                    >
                      Resolve
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="rounded-full border-white/80 bg-white/85"
                      onClick={() => updateReportMutation.mutate({ reportId: report.id, status: "dismissed" })}
                      disabled={updateReportMutation.isPending || report.status === "dismissed"}
                    >
                      Dismiss
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="rounded-full border-white/80 bg-white/85"
                      onClick={() => updateReportMutation.mutate({ reportId: report.id, status: "open" })}
                      disabled={updateReportMutation.isPending || report.status === "open"}
                    >
                      Reopen
                    </Button>
                  </div>
                ) : null}
              </article>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
