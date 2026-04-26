import { withJsonHandler, HttpError, jsonResponse } from "../_shared/http.ts";
import { createAdminClient } from "../_shared/supabase-admin.ts";
import { createPasswordHash, validatePasswordPolicy } from "../_shared/password.ts";
import { getClientIp, getUserAgent } from "../_shared/sessions.ts";
import { writeAuditEvent } from "../_shared/audit.ts";

Deno.serve((req) =>
  withJsonHandler(req, async () => {
    if (req.method !== "POST") {
      throw new HttpError(405, "bad_request", "Unsupported method.");
    }

    const bootstrapSecret = Deno.env.get("BOOTSTRAP_SECRET");

    if (!bootstrapSecret) {
      throw new HttpError(500, "internal_error", "Bootstrap secret is not configured.");
    }

    const body = (await req.json()) as {
      bootstrapSecret?: string;
      username?: string;
      password?: string;
      email?: string;
      firstName?: string;
      lastName?: string;
      displayName?: string;
      organizationName?: string;
      organizationSlug?: string;
    };

    if (body.bootstrapSecret !== bootstrapSecret) {
      throw new HttpError(403, "forbidden", "Invalid bootstrap secret.");
    }

    const username = body.username?.trim();
    const password = body.password ?? "";
    const organizationName = body.organizationName?.trim();
    const organizationSlug = body.organizationSlug?.trim().toLowerCase();
    const firstName = body.firstName?.trim() || null;
    const lastName = body.lastName?.trim() || null;
    const displayName = body.displayName?.trim() || null;
    const fullName = displayName || [firstName, lastName].filter(Boolean).join(" ") || username;

    if (!username || !password || !organizationName || !organizationSlug) {
      throw new HttpError(400, "bad_request", "Missing required bootstrap fields.");
    }

    const passwordPolicyError = validatePasswordPolicy(password);

    if (passwordPolicyError) {
      throw new HttpError(400, "bad_request", passwordPolicyError);
    }

    const supabase = createAdminClient();
    const { data: securitySettings, error: securitySettingsError } = await supabase
      .from("platform_security_settings")
      .select("bootstrap_completed_at")
      .maybeSingle();

    if (securitySettingsError) {
      throw new HttpError(
        500,
        "internal_error",
        "Failed to verify platform security settings.",
        securitySettingsError.message,
      );
    }

    if (securitySettings?.bootstrap_completed_at) {
      throw new HttpError(409, "bad_request", "Bootstrap has already been completed.");
    }

    const { count: userCount, error: countError } = await supabase
      .from("app_users")
      .select("id", { count: "exact", head: true });

    if (countError) {
      throw new HttpError(500, "internal_error", "Failed to verify bootstrap state.", countError.message);
    }

    if ((userCount ?? 0) > 0) {
      throw new HttpError(409, "bad_request", "Bootstrap has already been completed.");
    }

    const passwordHash = await createPasswordHash(password);

    const { data: user, error: userInsertError } = await supabase
      .from("app_users")
      .insert({
        username,
        full_name: fullName,
        password_hash: passwordHash,
        role: "super_admin",
        is_active: true,
      })
      .select("id, username, role")
      .single();

    if (userInsertError || !user) {
      throw new HttpError(500, "internal_error", "Failed to create super-admin user.", userInsertError?.message);
    }

    const { error: profileInsertError } = await supabase.from("user_profiles").insert({
      user_id: user.id,
      email: body.email?.trim() || null,
      first_name: firstName,
      last_name: lastName,
      display_name: displayName,
    });

    if (profileInsertError) {
      throw new HttpError(500, "internal_error", "Failed to create user profile.", profileInsertError.message);
    }

    const { data: organization, error: organizationInsertError } = await supabase
      .from("organizations")
      .insert({
        name: organizationName,
        slug: organizationSlug,
        created_by: user.id,
      })
      .select("id, name, slug")
      .single();

    if (organizationInsertError || !organization) {
      throw new HttpError(
        500,
        "internal_error",
        "Failed to create default organization.",
        organizationInsertError?.message,
      );
    }

    const { error: membershipInsertError } = await supabase.from("organization_memberships").insert({
      organization_id: organization.id,
      user_id: user.id,
      role: "admin",
    });

    if (membershipInsertError) {
      throw new HttpError(
        500,
        "internal_error",
        "Failed to assign super-admin to the default organization.",
        membershipInsertError.message,
      );
    }

    const { error: identityInsertError } = await supabase.from("user_identities").insert({
      user_id: user.id,
      provider: "local",
      provider_subject: user.id,
      login_identifier: username,
      email: body.email?.trim() || null,
      is_primary: true,
    });

    if (identityInsertError) {
      throw new HttpError(500, "internal_error", "Failed to create local identity link.", identityInsertError.message);
    }

    const { error: securitySettingsUpsertError } = await supabase.from("platform_security_settings").upsert({
      singleton_key: true,
      bootstrap_completed_at: new Date().toISOString(),
      bootstrap_completed_by_user_id: user.id,
    });

    if (securitySettingsUpsertError) {
      throw new HttpError(
        500,
        "internal_error",
        "Failed to seal bootstrap completion state.",
        securitySettingsUpsertError.message,
      );
    }

    await writeAuditEvent(supabase, {
      actorUserId: user.id,
      organizationId: organization.id,
      action: "bootstrap.super_admin.created",
      entityType: "app_user",
      entityId: user.id,
      ipAddress: getClientIp(req),
      userAgent: getUserAgent(req),
      details: {
        username,
        organizationSlug,
      },
    });

    return jsonResponse(req, {
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        fullName,
      },
      organization: {
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
      },
    });
  }),
);
