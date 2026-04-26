# Import users from v1

This importer is intentionally conservative.

## Why it exists

- `v1` exposes a legacy user directory that can be read from the old Supabase project.
- `v2` uses stronger password policy and provider-aware identities.
- A one-off manual copy would be fragile and hard to repeat.

## Current migration constraint

At the time this script was added:

- source users discovered in `v1`: `81`
- source passwords compatible with the `v2` password policy: `0`

That means the importer does **not** migrate legacy passwords.
Instead it creates:

- the same username
- the same role mapping
- a default membership in the chosen `v2` organization
- a generated temporary password for each imported user

## Role mapping

- `v1 admin` -> `v2 admin` + organization membership `admin`
- `v1 user` -> `v2 user` + organization membership `member`

## Required environment variables

```powershell
$env:V1_SUPABASE_URL="https://qoovfnxhsvghdftbmcrt.supabase.co"
$env:V1_SUPABASE_PUBLISHABLE_KEY="..."
$env:V2_SUPABASE_URL="https://eafgrurtyjupvzvtjdue.supabase.co"
$env:V2_SUPABASE_PUBLISHABLE_KEY="..."
$env:V2_SUPERADMIN_USERNAME="superadmin"
$env:V2_SUPERADMIN_PASSWORD="..."
$env:V2_DEFAULT_ORGANIZATION_ID="60eca049-bcc3-45b5-a5fc-626ada1eead5"
```

## Usage

Dry run:

```powershell
node .\scripts\import-v1-users.mjs
```

Apply import:

```powershell
node .\scripts\import-v1-users.mjs --apply
```

Custom report output:

```powershell
node .\scripts\import-v1-users.mjs --apply --output=tmp\v1-user-import-report.json
```

## Output

The script writes a JSON report with:

- created users
- skipped users
- generated temporary passwords
- source user ids

This report is the handoff artifact you can use for:

- first-login communication
- password reset campaign
- post-import validation
