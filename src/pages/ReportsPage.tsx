import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LoaderCircle, MessageSquareMore, Send, ShieldAlert, Wrench } from "lucide-react";

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
      toast.success("Report submitted.");
      setComment("");
      setTargetId("");
      void queryClient.invalidateQueries({ queryKey: ["reports", activeOrganizationId] });
    },
    onError: (error) => {
      const message = error instanceof EdgeClientError ? error.message : "Unable to submit the report.";
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
      toast.success(`Report marked as ${variables.status}.`);
      void queryClient.invalidateQueries({ queryKey: ["reports", activeOrganizationId] });
    },
    onError: (error) => {
      const message = error instanceof EdgeClientError ? error.message : "Unable to update the report.";
      toast.error(message);
    },
  });

  if (!activeOrganizationId || !activeOrganization) {
    return (
      <Card className="rounded-[2rem] border-slate-200/80 bg-white/90 shadow-[0_20px_60px_-48px_rgba(15,23,42,0.6)]">
        <CardContent className="p-8 text-sm leading-7 text-slate-600">
          Reports are organization-scoped. Once your active environment is available, users will be able to leave
          comments and admins will see the moderation queue here.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-[2.5rem] border border-white/60 bg-[linear-gradient(135deg,rgba(255,255,255,0.96),rgba(248,250,252,0.88)_52%,rgba(240,249,255,0.62))] p-6 shadow-[0_24px_80px_-48px_rgba(15,23,42,0.45)] backdrop-blur sm:p-8">
        <div className="grid gap-6 xl:grid-cols-[1.12fr,0.88fr]">
          <div>
            <p className="text-xs uppercase tracking-[0.28em] text-sky-700">Support</p>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
              Make support feel effortless for people and immediately actionable for workspace operators.
            </h1>
            <p className="mt-4 max-w-3xl text-base leading-7 text-slate-600">
              Support inside <span className="font-medium text-slate-900">{activeOrganization.name}</span> is meant to
              be quick: choose the target, leave a clear comment and keep the queue visible to whoever owns the
              workspace.
            </p>
          </div>

          <div className="grid gap-3 text-sm text-slate-700">
            <div className="rounded-[1.4rem] border border-white/70 bg-white/80 p-4 shadow-sm">
              People can report rooms, desks, offices or leave general feedback without switching tools.
            </div>
            <div className="rounded-[1.4rem] border border-white/70 bg-white/80 p-4 shadow-sm">
              Admins see the full workspace queue, while regular users only see their own items.
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[0.95fr,1.05fr]">
        <Card className="rounded-[2rem] border-slate-200/80 bg-white/90 shadow-[0_20px_60px_-48px_rgba(15,23,42,0.6)]">
          <CardHeader>
            <CardTitle className="text-xl text-slate-950">New support item</CardTitle>
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
                className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-sky-300"
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
                className="rounded-xl border-slate-200"
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
                className="min-h-[160px] rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none focus:border-sky-300"
                placeholder="Describe the issue or request in a few clear lines."
              />
            </div>

            <Button
              type="button"
              className="h-11 rounded-xl bg-slate-950 text-white hover:bg-slate-800"
              onClick={() => createReportMutation.mutate()}
              disabled={createReportMutation.isPending}
            >
              <Send className="mr-2 h-4 w-4" />
              {createReportMutation.isPending ? "Submitting..." : "Submit report"}
            </Button>
          </CardContent>
        </Card>

        <Card className="rounded-[2rem] border-slate-200/80 bg-white/90 shadow-[0_20px_60px_-48px_rgba(15,23,42,0.6)]">
          <CardHeader>
            <CardTitle className="text-xl text-slate-950">
              {canManageReports ? "Workspace queue" : "Your support items"}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            {reportsQuery.isLoading ? (
              <div className="rounded-[1.5rem] border border-slate-200/70 bg-slate-50 p-6 text-sm text-slate-600">
                <LoaderCircle className="mb-3 h-5 w-5 animate-spin text-sky-700" />
                Loading reports...
              </div>
            ) : null}

            {!reportsQuery.isLoading && !reportsQuery.data?.reports.length ? (
              <div className="rounded-[1.5rem] border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-500">
                No reports yet for this organization.
              </div>
            ) : null}

            {reportsQuery.data?.reports.map((report) => (
              <article
                key={report.id}
                className="rounded-[1.5rem] border border-slate-200/70 bg-slate-50 p-5"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-slate-950">
                    <MessageSquareMore className="h-4 w-4 text-sky-700" />
                    <span className="font-semibold">
                      {targetTypeLabels[report.targetType]}
                      {report.targetId ? ` · ${report.targetId}` : ""}
                    </span>
                  </div>
                  <span className="rounded-full bg-slate-950 px-3 py-1 text-xs font-medium text-white">
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
                      className="rounded-xl border-slate-200 bg-white"
                      onClick={() => updateReportMutation.mutate({ reportId: report.id, status: "resolved" })}
                      disabled={updateReportMutation.isPending || report.status === "resolved"}
                    >
                      Resolve
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="rounded-xl border-slate-200 bg-white"
                      onClick={() => updateReportMutation.mutate({ reportId: report.id, status: "dismissed" })}
                      disabled={updateReportMutation.isPending || report.status === "dismissed"}
                    >
                      Dismiss
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="rounded-xl border-slate-200 bg-white"
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
