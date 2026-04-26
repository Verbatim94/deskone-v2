export const platformPrinciples = [
  {
    title: "API-first flows",
    description:
      "The browser should talk to a small service layer, not directly to business tables. That keeps auth, caching and authorization coherent.",
  },
  {
    title: "Importable data model",
    description:
      "UUID preservation and explicit business tables make the v1 to v2 migration scriptable instead of manual and fragile.",
  },
  {
    title: "Operational clarity",
    description:
      "One auth model, one session model, one place for policy decisions. Simplicity is a feature when it stays consistent.",
  },
  {
    title: "Group-based sharing",
    description:
      "Users can belong to reusable groups, so room and desk access scales without repetitive per-user configuration.",
  },
  {
    title: "Tenant-aware governance",
    description:
      "Super-admin governs the platform, while organization admins operate only inside their assigned environment.",
  },
  {
    title: "Directory portability",
    description:
      "Profiles and identities are separated so local auth can later coexist with Microsoft Entra ID and Azure-based directory sync.",
  },
] as const;

export const deliveryPhases = [
  {
    name: "Foundation",
    focus: "Schema, providers, routing, and development guardrails.",
    status: "in-progress",
  },
  {
    name: "Auth",
    focus: "Simple secure login with hashed passwords and hashed session tokens.",
    status: "next",
  },
  {
    name: "Rooms",
    focus: "Room directory, memberships, and layout read models via API endpoints.",
    status: "planned",
  },
  {
    name: "Reservations",
    focus: "Booking, assignment rules, and approval workflows with stable contracts.",
    status: "planned",
  },
  {
    name: "Groups",
    focus: "Reusable groups and room-group access rules to speed up workstation sharing.",
    status: "planned",
  },
  {
    name: "Governance",
    focus: "Organizations, scoped admins, richer user profiles and identity-provider mappings.",
    status: "planned",
  },
  {
    name: "Offices",
    focus: "Owner-managed office spaces released in half-day or full-day windows and bookable every 15 minutes.",
    status: "planned",
  },
  {
    name: "Reports",
    focus: "Simple feedback and issue reporting linked to rooms, desks, offices and bookings.",
    status: "planned",
  },
  {
    name: "Cutover",
    focus: "Import scripts, validation, and controlled switch from v1 to v2.",
    status: "planned",
  },
] as const;

export const domainTables = [
  {
    name: "app_users",
    purpose: "Internal users with global platform role, kept minimal so auth data stays separate from profiles.",
  },
  {
    name: "app_sessions",
    purpose: "Custom sessions with hashed tokens, expiry and revocation metadata.",
  },
  {
    name: "organizations",
    purpose: "Admin environments that scope rooms, sharing groups, catalogs and operational ownership.",
  },
  {
    name: "organization_memberships",
    purpose: "Defines which users belong to which environment and whether they are admins or members there.",
  },
  {
    name: "user_profiles",
    purpose: "Richer user directory data such as display name, email, department, title, location and phone.",
  },
  {
    name: "user_identities",
    purpose: "Maps local users to identity providers like local login today and Microsoft Entra ID later.",
  },
  {
    name: "rooms",
    purpose: "Room metadata and grid dimensions, scoped by organization and stable enough for imports and future features.",
  },
  {
    name: "room_memberships",
    purpose: "Access rules for which user can manage or reserve in a room.",
  },
  {
    name: "sharing_groups",
    purpose: "Reusable internal groups used to share room access and future workstation workflows faster.",
  },
  {
    name: "sharing_group_memberships",
    purpose: "Bridge table connecting users to sharing groups.",
  },
  {
    name: "room_group_memberships",
    purpose: "Room permissions granted to entire groups instead of being duplicated user by user.",
  },
  {
    name: "room_desks",
    purpose: "Desk coordinates, default status and visual attributes kept separate from walls for clearer rendering and mutation flows.",
  },
  {
    name: "amenities",
    purpose: "Amenity catalog for desks and room designer tags such as monitors, standing desks and docking stations.",
  },
  {
    name: "desk_amenities",
    purpose: "Join table linking desks to amenity tags for search, sharing rules and admin editing.",
  },
  {
    name: "room_walls",
    purpose: "Entrances and walls isolated so layout math stays clean and scalable.",
  },
  {
    name: "room_zones",
    purpose: "Named layout areas such as neighborhoods, restricted sections, kitchens or conference corners.",
  },
  {
    name: "offices",
    purpose: "Special office spaces owned by a person and scoped to an organization.",
  },
  {
    name: "office_release_windows",
    purpose: "Half-day, full-day or custom release windows opened by the office owner or an admin.",
  },
  {
    name: "office_bookings",
    purpose: "15-minute office reservations with hard duration limits and overlap protection.",
  },
  {
    name: "reservations",
    purpose: "Time-based bookings with explicit status and time segment.",
  },
  {
    name: "desk_assignments",
    purpose: "Longer-lived desk allocations that stay distinct from ad-hoc reservations.",
  },
  {
    name: "desk_assignment_exceptions",
    purpose: "Specific date overrides without mutating the assignment history itself.",
  },
  {
    name: "reports",
    purpose: "Simple comments and issue reports linked to a target resource or submitted as general feedback.",
  },
] as const;
