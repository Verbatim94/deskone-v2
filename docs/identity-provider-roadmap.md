# Identity Provider Roadmap

This document keeps the future Entra / Azure direction explicit without activating it before the product needs it.

## Current state

- Active provider: `local`
- Planned provider: `entra`
- Session payloads already declare:
  - supported identity providers
  - primary identity provider for the signed-in user
  - linked identities from `user_identities`

## What this solves now

- Frontend contracts do not need to change when Entra is introduced.
- Business authorization stays stable because it depends on app tables, not on provider-specific claims.
- Import, provisioning, and sync work can target `user_identities` instead of rewriting `app_users`.

## What is intentionally not enabled yet

- No Microsoft OIDC login flow
- No SCIM endpoint
- No automatic Azure group sync
- No provider switching from the login screen

## Future implementation sequence

1. Add an Entra adapter endpoint for OIDC callback handling.
2. Upsert external identities into `user_identities`.
3. Map Entra users to existing `app_users` or create them through provisioning policy.
4. Introduce optional SCIM for user and group provisioning.
5. Add feature-flagged provider selection in the login UI only when the business is ready.

## Guardrails

- `app_users.role` remains the application authority for platform role.
- `organization_memberships` remains the application authority for scope.
- External groups may suggest access, but must be reconciled into app-managed group/membership tables.
- No feature should assume that Entra is present just because the provider descriptor exists.
