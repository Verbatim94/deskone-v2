# Deskone v2 auth contract

Deskone v2 keeps a simple internal authentication flow, but removes the fragile parts from v1.

## Design choices

- No Supabase Auth dependency for the product login flow.
- No plaintext passwords in the database.
- No raw session tokens stored in the database.
- Browser calls Edge Functions with a standard `Authorization: Bearer <token>` header.
- Edge Functions validate sessions and own the business authorization rules.
- Platform role and organization scope are both checked for privileged operations.
- User identities are stored separately so Microsoft Entra ID can be introduced later without rewriting business tables.
- Auth responses expose the active and planned identity providers so the frontend contract stays stable when Entra is added later.
- Login is protected by database-backed throttling on username and client IP scopes.
- Session invalidation supports global revoke by rotating a per-user session version.
- Bootstrap can complete only once and seals its completion in platform security settings.

## Core endpoints

### `auth-login`

`POST /functions/v1/auth-login`

Request body:

```json
{
  "username": "alice",
  "password": "secret"
}
```

Response body:

```json
{
  "sessionToken": "raw-token-returned-once",
  "expiresAt": "2026-05-24T10:30:00.000Z",
  "identityProviders": [
    {
      "key": "local",
      "label": "Deskone Local Auth",
      "status": "active",
      "signInMode": "password",
      "canProvisionUsers": false,
      "canSyncGroups": false,
      "canUseScim": false
    },
    {
      "key": "entra",
      "label": "Microsoft Entra ID",
      "status": "planned",
      "signInMode": "oidc",
      "canProvisionUsers": true,
      "canSyncGroups": true,
      "canUseScim": true
    }
  ],
  "user": {
    "id": "uuid",
    "username": "alice",
    "role": "admin",
    "fullName": "Alice Rossi",
    "displayName": "Alice Rossi",
    "email": "alice@example.com",
    "primaryIdentityProvider": "local",
    "identities": [
      {
        "provider": "local",
        "providerSubject": "uuid",
        "providerTenantId": null,
        "loginIdentifier": "alice",
        "email": "alice@example.com",
        "isPrimary": true,
        "lastSyncedAt": null
      }
    ]
  },
  "organizations": [
    {
      "id": "uuid",
      "name": "Deskone Milan",
      "slug": "deskone-milan",
      "membershipRole": "admin"
    }
  ]
}
```

### `auth-session`

`GET /functions/v1/auth-session`

Headers:

```text
Authorization: Bearer <sessionToken>
```

Returns the authenticated user and session metadata. Used on app bootstrap and route protection.
The response also includes the organizations visible to the current user so the frontend can pick an active environment
without guessing scope client-side.

### `auth-logout`

`POST /functions/v1/auth-logout`

Headers:

```text
Authorization: Bearer <sessionToken>
```

Revokes the active session by hashing the presented token and updating `app_sessions`.

### `auth-revoke-all`

`POST /functions/v1/auth-revoke-all`

Headers:

```text
Authorization: Bearer <sessionToken>
```

Revokes every active session for the current user by rotating `app_users.session_version` and marking all existing
sessions as revoked.

## Authorization model

- `super_admin`
  - manages users, admins, organizations, and global catalogs
  - can operate across the platform
- `admin`
  - can administer only the organizations they belong to as organization admins
- `user`
  - consumes workspace access and reservations inside assigned scope

This split keeps global directory control away from normal room admins, which is safer operationally and much easier to audit.

## Domain service endpoints

### `offices-overview`

`GET /functions/v1/offices-overview?organizationId=<uuid>&date=YYYY-MM-DD&windowStart=<iso>&windowEnd=<iso>`

Returns offices, release windows, bookings, and capability flags already filtered to the current organization scope.

### `office-release-windows`

- `POST /functions/v1/office-release-windows`
- `DELETE /functions/v1/office-release-windows`

Only the office owner, an organization admin, or the super-admin can open or close release windows.

### `office-bookings`

- `POST /functions/v1/office-bookings`
- `DELETE /functions/v1/office-bookings`

Bookings require an active release window, respect 15-minute boundaries, and cannot exceed 8 hours.

### `reports`

- `GET /functions/v1/reports?organizationId=<uuid>`
- `POST /functions/v1/reports`
- `PATCH /functions/v1/reports`

Any organization member can create a report. Only organization admins and the super-admin can manage the full queue.

## Password format

Password hashes follow this format:

```text
pbkdf2_sha256$310000$<salt-base64url>$<hash-base64url>
```

This keeps the implementation portable across Edge Functions and import scripts.

## Security hardening details

- Password policy currently requires at least 12 characters, one letter, and one number.
- Responses from Edge Functions send `Cache-Control: no-store` and `X-Content-Type-Options: nosniff`.
- CORS should be restricted in production through `CORS_ALLOWED_ORIGINS`.
- The bootstrap endpoint must be left enabled only until the first super-admin is created and the initial secrets are set.

## Future Microsoft Entra ID compatibility

- Keep business authorization in app tables, not in fragile client-side token parsing.
- Map external identities into `user_identities`.
- Treat group sync as provisioning data, not as the only source of authorization truth.
- Keep `local` as the active provider until an Entra adapter is intentionally enabled.
- Introduce Entra through the provider contract, not by rewriting the session payload or business tables.
- Support future OIDC sign-in, SCIM provisioning, and group sync behind the same provider-aware user/session model.
