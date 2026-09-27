# Auth setup (Supabase)

Dayman uses **password** sign-in through Supabase Auth. There is no OTP, magic
link, or social login.

## 1. Keys

`js/supabase-config.js` is git-ignored. Copy the example and fill it in:

```js
// js/supabase-config.example.js -> js/supabase-config.js
export const SUPABASE_URL = 'https://<project-ref>.supabase.co';
export const SUPABASE_ANON_KEY = '<anon public key>';
```

Never commit the real file.

## 2. Email confirmation

New accounts must confirm their email address before the app grants a session.

1. Supabase dashboard -> **Authentication -> Providers -> Email**.
2. Keep **Confirm email** enabled.
3. Set **Site URL** to your deployed origin, e.g. `https://dayman.app`
   (local dev: `http://localhost:3000`).
4. Under **Authentication -> URL Configuration -> Redirect URLs** add every
   origin you serve from:
   - `http://localhost:3000`
   - `https://<your-domain>`
   - `https://<your-domain>/`

With confirmation on, `signUp()` returns `{ needsConfirm: true }` with no
session. The UI then shows "check your inbox" with a **Resend email** button
(`resendConfirmation()`), and the congratulations screen appears on the first
sign-in after the address is confirmed.

If you want to skip email entirely (local testing), turn **Confirm email** off —
signup then returns a session immediately and the congratulations screen shows
right away.

## 3. Email template

The default Supabase template is fine. The only requirement is that the
confirmation link points back at a **Redirect URL** listed above so the user
lands in the app.

## 4. What the app does with the account

- A new account is given a generated display name (`User 1234`).
  Rename it in **Settings -> Profile**; the change propagates to the header,
  avatar, session voice lines, and the leaderboard.
- Guests are simply `Guest` and are not prompted to confirm anything.
- Password changes are done from **Settings -> Profile -> Password**. The
  current password is verified first (`changePassword()`), then
  `updateUser({ password })` runs on the live session.
