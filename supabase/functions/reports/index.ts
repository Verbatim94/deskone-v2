import { writeAuditEvent } from "../_shared/audit.ts";
import { withJsonHandler, HttpError, jsonResponse } from "../_shared/http.ts";
import { requireOrganizationAccess } from "../_shared/organizations.ts";
import { requireActiveSession, getClientIp, getUserAgent } from "../_shared/sessions.ts";
import { createAdminClient } from "../_shared/supabase-admin.ts";
import { getUserDirectory } from "../_shared/user-directory.ts";

type ReportBody = {
  organizationId?: string;
  targetType?: "general" | "room" | "desk" | "office" | "reservation" | "office_booking";
  targetId?: string | null;
  comment?: string;
  reportId?: string;
  status?: "open" | "resolved" | "dismissed";
  assigneeUserId?: string | null;
};

function normalizeComment(comment: string | undefined) {
  return comment?.trim() ?? "";
}

Deno.serve((req) =>
  withJsonHandler(req, async () => {
    const supabase = createAdminClient();
    const session = await requireActiveSession(req, supabase);

    if (req.method === "GET") {
      const url = new URL(req.url);
      const organizationId = url.searchParams.get("organizationId");

      if (!organizationId) {
        throw new HttpError(400, "bad_request", "organizationId is required.");
      }

      const organizationScope = await requireOrganizationAccess(supabase, session.user, organizationId);
      const isOrganizationAdmin =
        session.user.role === "super_admin" || organizationScope.membershipRole === "admin";

      let query = supabase
        .from("reports")
        .select(
          `
            id,
            organization_id,
            author_user_id,
            assignee_user_id,
            target_type,
            target_id,
            comment,
            status,
            resolved_at,
            created_at
          `,
        )
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false });

      if (!isOrganizationAdmin) {
        query = query.eq("author_user_id", session.userId);
      }

      const { data: reports, error } = await query.limit(100);

      if (error) {
        throw new HttpError(500, "internal_error", "Failed to load reports.", error.message);
      }

      const directory = await getUserDirectory(
        supabase,
        (reports ?? []).flatMap((report) => {
          const values = [];

          if (report.author_user_id) {
            values.push(report.author_user_id as string);
          }

          if (report.assignee_user_id) {
            values.push(report.assignee_user_id as string);
          }

          return values;
        }),
      );

      return jsonResponse(req, {
        organization: organizationScope,
        reports: (reports ?? []).map((report) => ({
          id: report.id,
          organizationId: report.organization_id,
          authorUserId: report.author_user_id,
          authorLabel: report.author_user_id ? directory[report.author_user_id as string]?.displayName ?? "Unknown" : null,
          assigneeUserId: report.assignee_user_id,
          assigneeLabel: report.assignee_user_id
            ? directory[report.assignee_user_id as string]?.displayName ?? "Unknown"
            : null,
          targetType: report.target_type,
          targetId: report.target_id,
          comment: report.comment,
          status: report.status,
          resolvedAt: report.resolved_at,
          createdAt: report.created_at,
          canManage: isOrganizationAdmin,
        })),
      });
    }

    const body = (await req.json()) as ReportBody;
    const organizationId = body.organizationId?.trim();

    if (!organizationId) {
      throw new HttpError(400, "bad_request", "organizationId is required.");
    }

    const organizationScope = await requireOrganizationAccess(
      supabase,
      session.user,
      organizationId,
      req.method === "PATCH" ? "admin" : "member",
    );

    if (req.method === "POST") {
      const targetType = body.targetType ?? "general";
      const comment = normalizeComment(body.comment);

      if (!comment) {
        throw new HttpError(400, "bad_request", "A comment is required.");
      }

      if (comment.length > 2000) {
        throw new HttpError(400, "bad_request", "Reports are limited to 2000 characters.");
      }

      const { data: createdReport, error } = await supabase
        .from("reports")
        .insert({
          organization_id: organizationId,
          author_user_id: session.userId,
          target_type: targetType,
          target_id: body.targetId?.trim() || null,
          comment,
        })
        .select(
          `
            id,
            organization_id,
            author_user_id,
            assignee_user_id,
            target_type,
            target_id,
            comment,
            status,
            resolved_at,
            created_at
          `,
        )
        .single();

      if (error) {
        throw new HttpError(500, "internal_error", "Failed to create report.", error.message);
      }

      await writeAuditEvent(supabase, {
        actorUserId: session.userId,
        organizationId,
        action: "report.created",
        entityType: "report",
        entityId: createdReport.id as string,
        ipAddress: getClientIp(req),
        userAgent: getUserAgent(req),
        details: {
          targetType,
          targetId: body.targetId?.trim() || null,
        },
      });

      return jsonResponse(req, {
        report: {
          id: createdReport.id,
          organizationId: createdReport.organization_id,
          authorUserId: createdReport.author_user_id,
          authorLabel: session.user.fullName,
          assigneeUserId: createdReport.assignee_user_id,
          assigneeLabel: null,
          targetType: createdReport.target_type,
          targetId: createdReport.target_id,
          comment: createdReport.comment,
          status: createdReport.status,
          resolvedAt: createdReport.resolved_at,
          createdAt: createdReport.created_at,
          canManage: session.user.role === "super_admin" || organizationScope.membershipRole === "admin",
        },
      });
    }

    if (req.method === "PATCH") {
      const reportId = body.reportId?.trim();
      const status = body.status;
      const assigneeUserId = body.assigneeUserId?.trim() || null;

      if (!reportId || !status) {
        throw new HttpError(400, "bad_request", "reportId and status are required.");
      }

      const resolvedAt = status === "resolved" ? new Date().toISOString() : null;

      const { data: updatedReport, error } = await supabase
        .from("reports")
        .update({
          status,
          assignee_user_id: assigneeUserId,
          resolved_at: resolvedAt,
        })
        .eq("id", reportId)
        .eq("organization_id", organizationId)
        .select(
          `
            id,
            organization_id,
            author_user_id,
            assignee_user_id,
            target_type,
            target_id,
            comment,
            status,
            resolved_at,
            created_at
          `,
        )
        .maybeSingle();

      if (error) {
        throw new HttpError(500, "internal_error", "Failed to update report.", error.message);
      }

      if (!updatedReport) {
        throw new HttpError(404, "not_found", "Report not found.");
      }

      const directory = await getUserDirectory(
        supabase,
        [updatedReport.author_user_id as string, updatedReport.assignee_user_id as string].filter(Boolean),
      );

      await writeAuditEvent(supabase, {
        actorUserId: session.userId,
        organizationId,
        action: "report.updated",
        entityType: "report",
        entityId: reportId,
        ipAddress: getClientIp(req),
        userAgent: getUserAgent(req),
        details: {
          status,
          assigneeUserId,
        },
      });

      return jsonResponse(req, {
        report: {
          id: updatedReport.id,
          organizationId: updatedReport.organization_id,
          authorUserId: updatedReport.author_user_id,
          authorLabel: updatedReport.author_user_id
            ? directory[updatedReport.author_user_id as string]?.displayName ?? "Unknown"
            : null,
          assigneeUserId: updatedReport.assignee_user_id,
          assigneeLabel: updatedReport.assignee_user_id
            ? directory[updatedReport.assignee_user_id as string]?.displayName ?? "Unknown"
            : null,
          targetType: updatedReport.target_type,
          targetId: updatedReport.target_id,
          comment: updatedReport.comment,
          status: updatedReport.status,
          resolvedAt: updatedReport.resolved_at,
          createdAt: updatedReport.created_at,
          canManage: true,
        },
      });
    }

    throw new HttpError(405, "bad_request", "Unsupported method.");
  }),
);
