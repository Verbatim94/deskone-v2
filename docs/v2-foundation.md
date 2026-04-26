# Deskone v2 Foundation

## Objectives

- Keep `v1` stable in production while `v2` evolves independently.
- Rebuild the data layer so that auth, access control, and business logic have one coherent path.
- Optimize for maintainability, predictable performance, and straightforward data import from `v1`.

## Core architectural rules

1. The browser must not talk directly to business tables.
2. All reads and writes go through a service layer, preferably Edge Functions.
3. The frontend only knows typed APIs, never raw table contracts.
4. The database schema stays import-friendly by preserving UUID primary keys.
5. Authentication remains simple, but credentials are never stored in plain text.
6. Platform governance and organization scope stay separate so super-admin powers never leak into normal admin flows.

## Data access model

- `anon` browser client:
  - can call public-facing Edge Functions
  - cannot read business tables directly
- Edge Functions:
  - own authentication, authorization, and conflict checks
  - use elevated credentials server-side
- Postgres:
  - keeps RLS enabled on core tables
  - stays private by default unless a very specific browser use case requires otherwise
  - carries security state such as auth throttling and bootstrap sealing when that is safer than client-side memory

This is intentionally different from `v1`, where direct browser queries and mixed auth assumptions increased fragility.

## Session and environment model

- Auth responses carry both user identity and the list of accessible organizations.
- The frontend stores only the session token and the selected organization id.
- The backend remains the source of truth for which organizations are visible and which role the user has inside each one.
- The super-admin can see all active organizations without requiring duplicate membership rows for every environment.

## Schema design choices

### Users and sessions

- `app_users` is the only source of truth for application users.
- `app_sessions` stores hashed session tokens, not raw tokens.
- `app_users.session_version` allows global session revocation without deleting the user.
- Usernames are case-insensitive through `citext`.
- `user_profiles` stores richer people data separately from login mechanics.
- `user_identities` keeps identity-provider linkage ready for future Microsoft Entra ID integration.
- Session payloads are provider-aware, so `local` auth can stay active today while `entra` is added later without breaking the frontend contract.
- `auth_rate_limits` provides database-backed brute-force protection on login.
- `platform_security_settings` stores one-time bootstrap completion and future platform-wide hardening flags.

### Governance and scope

- `organizations` represent admin environments.
- `organization_memberships` scope admins and members to one or more environments.
- `app_users.role = super_admin` is reserved for platform governance and directory control.
- Environment admins can create and manage rooms only inside their assigned organizations.
- `audit_events` records privileged actions so governance remains reviewable.

### Rooms and memberships

- `rooms` keeps room metadata and grid dimensions.
- `rooms.organization_id` scopes every room to an environment.
- `room_memberships` manages room-level permissions.
- `sharing_groups` and `sharing_group_memberships` allow reusable team-based access.
- `room_group_memberships` grants whole groups access to rooms without duplicating entries for every user.
- `room_desks`, `desk_amenities`, `room_zones` and `room_walls` support a richer visual room designer with structured attributes.

### Bookings

- `reservations` is for user bookings.
- `desk_assignments` is for admin-managed long-running desk allocations.
- `desk_assignment_exceptions` keeps per-day exceptions without mutating historical records.
- `offices`, `office_release_windows`, and `office_bookings` cover owner-based office release and short-interval bookings.

We keep reservations and assignments separate because the domain is clearer and import from `v1` becomes much simpler.

### Offices

- `offices` belong to an organization and can have an owner.
- `office_release_windows` are declared by the owner or an admin.
- `office_bookings` are constrained to 15-minute granularity and a hard max duration of 8 hours.
- overlap prevention belongs in both schema constraints and service-layer checks.
- the overview payload is pre-joined and pre-authorized server-side so the UI can stay simple and fast.

### Reporting

- `reports` captures simple user comments and issue signals.
- reports can target a room, desk, office, reservation, office booking, or stay general.
- this keeps feedback lightweight without forcing a complex ticketing system up front.
- users only see their own reports by default, while admins see the full organization queue.

## Performance decisions

- UUID keys are preserved for low-friction import and easy cross-table joins.
- Core lookup indexes are created on:
  - usernames
  - active sessions
  - room memberships by room and user
  - desks by room and coordinates
  - reservations by desk, room, user, and date windows
  - assignments by desk, room, user, and date windows
- Mutable tables use `updated_at` triggers instead of duplicated app logic.
- Conflict detection stays in the service layer first, where rules can evolve without schema churn.
- Organization-scoped overview endpoints aggregate related data in a small number of queries to keep admin dashboards responsive.
- Security-critical state that must survive cold starts, such as login throttling, stays in Postgres rather than ephemeral memory.

## Import strategy from v1

Import will happen through scripts, not manual SQL copy-paste.

Expected mapping:

- `users` -> `app_users`
- `users extra data` -> `user_profiles`
- `room_access` -> `room_memberships`
- `room_cells` -> `room_desks`
- `fixed_assignments` -> `desk_assignments`
- `reservations` -> `reservations`
- `room_walls` -> `room_walls`

Groups are a v2-native capability, so they will start empty and be configured directly in the new system.
Offices and reports are also v2-native and can start clean without backward-compatibility baggage.

Important rules:

- keep existing UUIDs when importing
- do not import `user_sessions`
- hash legacy passwords during import into `password_hash`
- generate `rooms.slug` deterministically during import
- assign imported rooms to organizations during cutover, never leave them unscoped

CSV is acceptable as a transport format, but the real migration unit is an idempotent import script.

## Immediate implementation order

1. Apply the clean v2 schema.
2. Generate fresh Supabase types for `v2`.
3. Rebuild auth as API-first.
4. Harden auth with throttling, session revocation and bootstrap sealing.
5. Rebuild rooms listing and room viewer on top of the new APIs.
6. Rebuild reservations and admin workflows.
7. Add export/import scripts for `v1` -> `v2`.

## Non-goals for now

- perfect live sync between `v1` and `v2`
- advanced multi-tenant auth
- premature microservice split

The priority is a clean, scalable single-app architecture with a safe cutover path.

## Identity provider readiness

- `local` remains the only active sign-in provider for now.
- `entra` is modeled as a planned provider, not an enabled integration.
- The adapter seam lives in `user_identities`, session payload metadata, and provider descriptors returned by auth endpoints.
- Business authorization must remain provider-agnostic: organizations, memberships, roles, groups, bookings, and reports cannot depend on raw Entra claims.
- Future Entra work should plug into the provider seam through:
  - OIDC sign-in
  - identity upsert into `user_identities`
  - optional SCIM provisioning
  - optional group sync into app-managed sharing/group models
