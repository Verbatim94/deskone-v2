type SupabaseAdminClient = ReturnType<typeof import("./supabase-admin.ts").createAdminClient>;

type AuditEventInput = {
  actorUserId?: string | null;
  organizationId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  details?: Record<string, unknown>;
};

export async function writeAuditEvent(supabase: SupabaseAdminClient, input: AuditEventInput) {
  const { error } = await supabase.from("audit_events").insert({
    actor_user_id: input.actorUserId ?? null,
    organization_id: input.organizationId ?? null,
    action: input.action,
    entity_type: input.entityType,
    entity_id: input.entityId ?? null,
    ip_address: input.ipAddress ?? null,
    user_agent: input.userAgent ?? null,
    details: input.details ?? {},
  });

  if (error) {
    console.error("Failed to write audit event", error);
  }
}
