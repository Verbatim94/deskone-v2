import { invokeEdgeFunction } from "@/lib/api-client";
import { requireSessionToken } from "@/features/auth/require-session-token";

export type ReportTargetType = "general" | "room" | "desk" | "office" | "reservation" | "office_booking";
export type ReportStatus = "open" | "resolved" | "dismissed";

export type ReportItem = {
  id: string;
  organizationId: string;
  authorUserId: string | null;
  authorLabel: string | null;
  assigneeUserId: string | null;
  assigneeLabel: string | null;
  targetType: ReportTargetType;
  targetId: string | null;
  comment: string;
  status: ReportStatus;
  resolvedAt: string | null;
  createdAt: string;
  canManage: boolean;
};

export type ReportsResponse = {
  organization: {
    id: string;
    name: string;
    slug: string;
    membershipRole: "admin" | "member";
  };
  reports: ReportItem[];
};

export async function getReports(organizationId: string) {
  return invokeEdgeFunction<ReportsResponse>("reports", {
    method: "GET",
    sessionToken: requireSessionToken(),
    query: { organizationId },
  });
}

export async function createReport(input: {
  organizationId: string;
  targetType: ReportTargetType;
  targetId?: string | null;
  comment: string;
}) {
  return invokeEdgeFunction<{ report: ReportItem }>("reports", {
    method: "POST",
    sessionToken: requireSessionToken(),
    body: input,
  });
}

export async function updateReport(input: {
  organizationId: string;
  reportId: string;
  status: ReportStatus;
  assigneeUserId?: string | null;
}) {
  return invokeEdgeFunction<{ report: ReportItem }>("reports", {
    method: "PATCH",
    sessionToken: requireSessionToken(),
    body: input,
  });
}
