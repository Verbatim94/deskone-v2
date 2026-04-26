import { writeAuditEvent } from "../_shared/audit.ts";
import { requireOrganizationAccess } from "../_shared/organizations.ts";
import {
  assertOrganizationUserIds,
  listOrganizationMembers,
  normalizeOptionalText,
  normalizePositiveInteger,
  normalizeRequiredName,
  normalizeSlug,
} from "../_shared/organization-admin.ts";
import { withJsonHandler, HttpError, jsonResponse } from "../_shared/http.ts";
import { createAdminClient } from "../_shared/supabase-admin.ts";
import { getClientIp, getUserAgent, requireActiveSession } from "../_shared/sessions.ts";
import { getUserDirectory } from "../_shared/user-directory.ts";

type OfficeBody = {
  organizationId?: string;
  officeId?: string;
  ownerUserId?: string | null;
  name?: string;
  slug?: string;
  description?: string | null;
  floorLabel?: string | null;
  locationLabel?: string | null;
  capacity?: number;
  isActive?: boolean;
};

async function buildOfficeViews(
  supabase: ReturnType<typeof createAdminClient>,
  organizationId: string,
) {
  const [{ data: offices, error: officesError }, organizationMembers] = await Promise.all([
    supabase
      .from("offices")
      .select(
        "id, organization_id, owner_user_id, name, slug, description, floor_label, location_label, capacity, is_active, created_at, updated_at",
      )
      .eq("organization_id", organizationId)
      .order("name", { ascending: true }),
    listOrganizationMembers(supabase, organizationId),
  ]);

  if (officesError) {
    throw new HttpError(500, "internal_error", "Failed to load offices.", officesError.message);
  }

  const ownerDirectory = await getUserDirectory(
    supabase,
    (offices ?? []).flatMap((office) => (office.owner_user_id ? [office.owner_user_id as string] : [])),
  );

  return {
    availableOwners: organizationMembers,
    offices: (offices ?? []).map((office) => ({
      id: office.id as string,
      organizationId: office.organization_id as string,
      ownerUserId: (office.owner_user_id as string | null | undefined) ?? null,
      ownerLabel: office.owner_user_id ? ownerDirectory[office.owner_user_id as string]?.displayName ?? "Unknown" : null,
      name: office.name as string,
      slug: office.slug as string,
      description: (office.description as string | null | undefined) ?? null,
      floorLabel: (office.floor_label as string | null | undefined) ?? null,
      locationLabel: (office.location_label as string | null | undefined) ?? null,
      capacity: office.capacity as number,
      isActive: office.is_active as boolean,
      createdAt: office.created_at as string,
      updatedAt: office.updated_at as string,
    })),
  };
}

Deno.serve((req) =>
  withJsonHandler(req, async () => {
    const supabase = createAdminClient();
    const session = await requireActiveSession(req, supabase);

    if (req.method === "GET") {
      const organizationId = new URL(req.url).searchParams.get("organizationId")?.trim();

      if (!organizationId) {
        throw new HttpError(400, "bad_request", "organizationId is required.");
      }

      const organization = await requireOrganizationAccess(supabase, session.user, organizationId, "admin");
      const payload = await buildOfficeViews(supabase, organizationId);

      return jsonResponse(req, {
        organization,
        ...payload,
      });
    }

    if (req.method !== "POST" && req.method !== "PATCH") {
      throw new HttpError(405, "bad_request", "Unsupported method.");
    }

    const body = (await req.json()) as OfficeBody;
    const organizationId = body.organizationId?.trim();

    if (!organizationId) {
      throw new HttpError(400, "bad_request", "organizationId is required.");
    }

    const organization = await requireOrganizationAccess(supabase, session.user, organizationId, "admin");
    const ownerUserId = typeof body.ownerUserId === "string" && body.ownerUserId.trim() ? body.ownerUserId.trim() : null;

    if (ownerUserId) {
      await assertOrganizationUserIds(supabase, organizationId, [ownerUserId]);
    }

    if (req.method === "POST") {
      const name = normalizeRequiredName("Office name", body.name);
      const slug = normalizeSlug(body.slug, name);
      const description = normalizeOptionalText(body.description, 500);
      const floorLabel = normalizeOptionalText(body.floorLabel, 120);
      const locationLabel = normalizeOptionalText(body.locationLabel, 160);
      const capacity = normalizePositiveInteger("capacity", body.capacity ?? 1, 1, 100);

      const { data: createdOffice, error: createdOfficeError } = await supabase
        .from("offices")
        .insert({
          organization_id: organizationId,
          owner_user_id: ownerUserId,
          name,
          slug,
          description,
          floor_label: floorLabel,
          location_label: locationLabel,
          capacity,
          is_active: true,
        })
        .select("id")
        .single();

      if (createdOfficeError || !createdOffice) {
        throw new HttpError(
          createdOfficeError?.code === "23505" ? 409 : 500,
          createdOfficeError?.code === "23505" ? "conflict" : "internal_error",
          createdOfficeError?.code === "23505"
            ? "An office with this slug already exists in the organization."
            : "Failed to create office.",
          createdOfficeError?.message,
        );
      }

      await writeAuditEvent(supabase, {
        actorUserId: session.userId,
        organizationId,
        action: "office.created",
        entityType: "office",
        entityId: createdOffice.id as string,
        ipAddress: getClientIp(req),
        userAgent: getUserAgent(req),
        details: {
          slug,
          ownerUserId,
          capacity,
        },
      });

      const payload = await buildOfficeViews(supabase, organizationId);
      const office = payload.offices.find((entry) => entry.id === createdOffice.id);

      return jsonResponse(req, {
        organization,
        office,
      });
    }

    const officeId = body.officeId?.trim();

    if (!officeId) {
      throw new HttpError(400, "bad_request", "officeId is required.");
    }

    const { data: existingOffice, error: existingOfficeError } = await supabase
      .from("offices")
      .select("id, name, slug, description, floor_label, location_label, capacity, is_active")
      .eq("id", officeId)
      .eq("organization_id", organizationId)
      .maybeSingle();

    if (existingOfficeError) {
      throw new HttpError(500, "internal_error", "Failed to load office.", existingOfficeError.message);
    }

    if (!existingOffice) {
      throw new HttpError(404, "not_found", "Office not found.");
    }

    const name = normalizeRequiredName("Office name", body.name ?? existingOffice.name);
    const slug = normalizeSlug(body.slug, name);
    const description = normalizeOptionalText(
      body.description === undefined ? existingOffice.description : body.description,
      500,
    );
    const floorLabel = normalizeOptionalText(
      body.floorLabel === undefined ? existingOffice.floor_label : body.floorLabel,
      120,
    );
    const locationLabel = normalizeOptionalText(
      body.locationLabel === undefined ? existingOffice.location_label : body.locationLabel,
      160,
    );
    const capacity = normalizePositiveInteger("capacity", body.capacity ?? existingOffice.capacity, 1, 100);
    const isActive = typeof body.isActive === "boolean" ? body.isActive : (existingOffice.is_active as boolean);

    const { error: updateOfficeError } = await supabase
      .from("offices")
      .update({
        owner_user_id: ownerUserId,
        name,
        slug,
        description,
        floor_label: floorLabel,
        location_label: locationLabel,
        capacity,
        is_active: isActive,
      })
      .eq("id", officeId)
      .eq("organization_id", organizationId);

    if (updateOfficeError) {
      throw new HttpError(
        updateOfficeError.code === "23505" ? 409 : 500,
        updateOfficeError.code === "23505" ? "conflict" : "internal_error",
        updateOfficeError.code === "23505"
          ? "An office with this slug already exists in the organization."
          : "Failed to update office.",
        updateOfficeError.message,
      );
    }

    await writeAuditEvent(supabase, {
      actorUserId: session.userId,
      organizationId,
      action: "office.updated",
      entityType: "office",
      entityId: officeId,
      ipAddress: getClientIp(req),
      userAgent: getUserAgent(req),
      details: {
        slug,
        ownerUserId,
        capacity,
        isActive,
      },
    });

    const payload = await buildOfficeViews(supabase, organizationId);
    const office = payload.offices.find((entry) => entry.id === officeId);

    return jsonResponse(req, {
      organization,
      office,
    });
  }),
);
