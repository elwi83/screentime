# Familjens skärmtid

A Swedish, mobile-friendly app for Maximilian, Walter and one shared parent account.
Built with TypeScript, Vite and Supabase. The static site can run on GitHub Pages.

## Try it locally

Install Node.js 22 or newer, then:

```sh
npm install
npm run dev
```

Without Supabase configuration, the login screen offers a clearly labelled interactive
demo. Choose a child, submit a task, select **Byt konto**, then try the parent view
to approve it. Both children start at zero. Demo data is held only in memory,
survives demo account switches, and resets on page reload. Demo is separate from real accounts.

## Connect your new Supabase project

Use a **dedicated project for this family**. All parent profiles in this database
can see all child profiles; this is not a multi-family service.

1. Create a Supabase project. In **SQL Editor**, run
   [001_family.sql](supabase/migrations/001_family.sql) once.
2. In **Authentication → Providers → Email**, enable email/password authentication.
   Disable public sign-ups in the authentication settings. The app has no sign-up
   screen, and accounts without a database profile have no family access.
3. In **Authentication → Users → Add user**, create three users with email
   confirmation enabled/auto-confirmed:

   | Account | Email | Password |
   | --- | --- | --- |
   | Parent | Your actual email address | A strong, unique password |
   | Maximilian | `maximilian@children.screentime.invalid` | A unique numeric PIN, **at least 6 digits** |
   | Walter | `walter@children.screentime.invalid` | A different numeric PIN, **at least 6 digits** |

   The child emails are internal identifiers, not mailboxes. Children select their
   name and enter the corresponding PIN; the app signs them into Supabase Auth.
   Longer PINs are recommended. Follow any stricter password policy configured
   for your Supabase project. Keep Supabase Auth rate limits enabled; short PINs
   are less resistant to guessing than long passwords. If enabling Auth CAPTCHA,
   first add the matching CAPTCHA integration to this app.
4. In [setup-family.sql](supabase/setup-family.sql), replace
   `REPLACE_WITH_PARENT_EMAIL` with the parent's email, then run the script in
   SQL Editor. This creates the family profiles and the ten child-specific rules.
   It is safe to rerun: existing balances and rule edits are not overwritten.
5. Copy [.env.example](.env.example) to `.env.local`. Fill in your Supabase
   project URL and **publishable key or legacy anon key** from the project API
   settings. Restart the development server.

   ```dotenv
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_ANON_KEY=your-publishable-or-anon-key
   ```

   These values are public browser configuration, not secrets. **Never use a
   service-role key, secret API key, database password, or user password here.**
   Do not commit `.env.local`.
6. Under Supabase Auth URL Configuration, set the Site URL to the eventual Pages
   URL (including the repository path). This app uses password login, not OAuth
   redirects. Account/PIN management is done in the Supabase dashboard. Children
   cannot use email recovery with their internal addresses.
7. Test real login, task submission, parent approval, and deduction with the
   checklist below before letting the children rely on the balances.

## Rules and behavior

- Each child sees only their own rules, balance, requests and history.
- Parent can edit each existing task's description, reward and daily limit.
- Daily maxima: reading 3, writing 3, maths 3, outdoor 12, indoor 6.
- Rewards: writing 60 minutes; every other task 30 minutes.
- Pending and approved requests reserve a daily slot. Rejection releases it.
  Limits are checked on the server using **Europe/Stockholm**, including daylight
  saving time. Old pending requests stay assigned to the day they were submitted.
- Children tap **Klart** and may add a note (up to 500 characters).
- Only parent approval credits minutes. A request can be handled only once.
  Editing a rule does not change rewards on already-submitted requests.
- Balances start at zero, carry over indefinitely, and have no configured daily
  use cap. No automatic timer, expiration or recurring allowance is applied.
- Parents deduct actual minutes used. Regular use costs 1:1; **YouTube costs 2:1**.
  A 15-minute YouTube session removes 30 balance minutes. Overdrafts are rejected.
- Parent sees pending requests; children see their submitted requests and outcomes.
  History displays the latest 100 balance entries.
- Press **Uppdatera** to fetch other-device changes. The app also refreshes when
  its browser window regains focus. It does not promise live push updates.
- Database row-level policies restrict reads. Only validated, transactional SQL
  functions can write. Row locks protect submissions, duplicate approvals and
  deductions from racing. UI restrictions are not the authorization boundary.

## Deploy to GitHub Pages

1. Create a GitHub repository and push this project to its `main` branch.
   No repository or remote is automatically created by this project.
2. Under **Settings → Pages → Build and deployment**, choose **GitHub Actions**.
3. Under **Settings → Secrets and variables → Actions → Variables**, add:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY` (publishable or legacy anon key only)
4. Push to `main` or manually run the **Test and deploy to GitHub Pages** workflow.

The workflow runs tests, type checking and a production build before deployment.
Vite's relative base supports `https://username.github.io/repository/` as well as
a custom domain. With no Supabase variables the deployment intentionally offers
demo mode only; it does **not** save real family data.

## Validation

```sh
npm test
npm run build
```

Tests exercise the actual migration and family setup in embedded PostgreSQL
(PGlite), including RLS, role restrictions, reward snapshots, duplicate approval,
daily caps, rejection, deductions, YouTube cost and persistence across setup reruns.
The test harness supplies a minimal Supabase-style Auth schema; it does not
replace testing actual Supabase Auth configuration or live network concurrency.

### Live-project acceptance checklist

- Log in as each child and confirm only their own rules/balance are visible.
- Submit a task with a note. Confirm the balance stays unchanged.
- Log in as parent on another device, refresh, and approve. Refresh the child
  screen and confirm exactly one reward was credited.
- Reach a daily task limit, confirm another request is blocked, reject one,
  and confirm its slot becomes available again.
- Edit a reward while an older request is pending. Confirm approval uses the
  older reward and a new request uses the new reward.
- Deduct 15 YouTube minutes and confirm 30 balance minutes are removed.
- Try to deduct more than the balance; confirm the error and unchanged balance.
- Test at a narrow phone width and reload to confirm real balances persist.
- Sign out on shared devices. Supabase sessions persist in browser storage;
  use trusted devices and log out when finished.

## Privacy

Do not put credentials or child activity data in a public repository. The website
bundle and Supabase publishable key are public by design; RLS protects the data.
No analytics are included. Google Fonts supplies the display fonts; system fonts
are used if unavailable. The demo does not contact Supabase for family data.
