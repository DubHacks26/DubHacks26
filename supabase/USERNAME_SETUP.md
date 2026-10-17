# Username and password recovery setup

1. Run `supabase/migrations/20261017_usernames.sql` in your Supabase project's SQL Editor. It creates a unique, case-insensitive username directory with no browser access and a trigger that reserves usernames when accounts are created.
2. Add `SUPABASE_SECRET_KEY=...` to `.env.development`. Get the secret key (or legacy service-role key) from your Supabase dashboard. This key stays on the Express server: never prefix it with `NEXT_PUBLIC_` or commit it.
3. In Supabase Authentication → URL Configuration, allow `http://localhost:8000/auth?reset=1` as a redirect URL. Add the equivalent URL for deployment later.
4. Restart `npm run dev` after changing backend code or environment settings.

New users choose a unique username and provide an email for confirmation and password recovery. Username sign-in ignores capitalization. Existing users can continue signing in with email; accounts without a username display their existing name or “Shopper”.

Verify with a new account: sign up, confirm the email if required, sign out, sign in with the username, then request a password reset and follow the email link to save a new password. Supabase's email rate limits and delivery configuration apply.
