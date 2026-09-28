# Security

How the app is protected, and where each protection is tested.

The security model has three layers:
1. **The database decides.** Row level security (RLS) on every table, read-only grants for API roles, and every write done by a `SECURITY DEFINER` function.
2. **The server re-checks.** Every page loads the signed-in user's profile on the server, and owner pages refuse other roles.
3. **The browser is hardened.** A strict Content-Security-Policy with a per-request nonce, plus the standard security headers.

## Review points and how they are addressed

| # | Point | What is in place | Proof |
|---|---|---|---|
| 1 | HTTP security headers / CSP | • `src/proxy.ts` builds a Content-Security-Policy per request with a fresh nonce and `'strict-dynamic'`.<br>• No `unsafe-inline` and no `unsafe-eval` in production.<br>• `connect-src` allows only this site and the Supabase project.<br>• `frame-ancestors 'none'`.<br>• `next.config.ts` sets X-Frame-Options `DENY`, X-Content-Type-Options `nosniff`, Referrer-Policy, Permissions-Policy (all sensors off), HSTS with preload, and COOP/CORP `same-origin`.<br>• `X-Powered-By` is removed. | securityheaders.com: **A+** for https://shamsy.vercel.app |
| 2 | Password policy | • `npm run seed:users` refuses passwords under **12 characters** or without upper case, lower case and a digit.<br>• `supabase/config.toml` enforces the same (`minimum_password_length = 12`, `lower_upper_letters_digits`). | Seed script exits on a weak password |
| 3 | Authorization tests for more users and roles | pgTAP tests cover:<br>• a second adviser can't read the first adviser's orders, lines or profile, and the reverse;<br>• a user with no role can read nothing and write nothing;<br>• only the owner can approve or change settings. | `supabase/tests/database/orders.test.sql` (74 assertions) |
| 4 | CI supply chain | • Every GitHub Action is pinned to a full commit SHA.<br>• The Supabase CLI is an exact version in `package-lock.json` (integrity-checked), not `setup-cli` with `latest`.<br>• The workflow token is read-only.<br>• CI passwords are random per run. | `.github/workflows/ci.yml` |
| 5 | Middleware is only a UX gate | That is intentional, and it is not the security boundary.<br>• Every page calls `requireProfile()` on the server, and `/approvals` and `/settings` call `requireOwner()`.<br>• The data itself is protected by RLS and the definer functions, so it doesn't matter whether a request goes through the app. | `npm run verify` check 17 calls PostgREST directly, with no app or middleware, and gets nothing |
| 6 | Predictable demo accounts | • **New sign-ups get role `pending` and no access at all**: no prices, no dealers, no orders, no writes. The owner has to assign a role.<br>• The two demo accounts use long random passwords. In the real system accounts are personal and invite-only (public sign-up off), and the owner uses MFA. | pgTAP "pending user" tests |
| 7 | RPC attack surface | Tests enforce an explicit allowlist:<br>• anon can execute **no** function;<br>• authenticated users can execute exactly `save_order`, `approve_order_line`, `update_settings`, `is_owner` and `is_member`;<br>• every definer function pins `search_path = ''`;<br>• RLS is on for every table, and no insert/update/delete policy exists.<br>New functions are not executable by default (`alter default privileges`). | pgTAP "RPC attack surface" tests; `verify` check 15 calls every internal function over the API as anon and as adviser |
| 8 | Storage | This app does not use Storage. Tests assert that:<br>• no bucket exists;<br>• no storage policy grants anon or users anything;<br>• uploads are refused. | pgTAP "Storage" tests; `verify` check 16 |

## Running the security tests

```bash
npm run verify      # 17 end-to-end checks against the live project, public key + user logins only
npm run test:db     # pgTAP (needs a local Supabase: npx supabase start)
```

## Production checklist (Supabase dashboard)

- Authentication → Sign In / Providers → **turn off "Allow new users to sign up"**. Even with it on, new users have no access (see #6).
- Authentication → Providers → Email → minimum password length **12**, with lower, upper and digits required.
- Authentication → **enable leaked password protection** and MFA for the owner.
- Rotate the database password and the service role key after handover.
