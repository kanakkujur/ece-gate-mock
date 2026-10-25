# Private server Google Drive setup

Google Drive API and Google Picker API are enabled in project `gate-studio` (number `37816807595`). The website OAuth client is created for `https://kanakkujur.github.io` and `http://127.0.0.1:4001`.

The app now uses Google's authorization-code popup model. Google client secrets and access/refresh tokens stay on the host. No Picker API key is created, requested or published. The public OAuth client ID identifies the application and is not a secret. The browser receives a temporary app session to authorize requests to the host, never a Google token.

## Finish the host setup

1. In Google Auth Platform > Clients > GATE Studio website, obtain the client secret privately. If Google no longer offers the original secret, the account owner must create a replacement secret. Do not paste it into chat or commit it to GitHub.
2. Store these settings in `gate-backend/.env`:

   ```env
   GOOGLE_CLIENT_ID=37816807595-89m574va0vdlatnnrvsnlc1br90d6d67.apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=your-private-client-secret
   GOOGLE_ALLOWED_EMAILS=your-google-email,brothers-google-email
   ```
3. In Google Auth Platform > Audience, keep Testing and add the same learner emails as test users. The host allowlist is enforced separately after Google verifies the account. Sharing the Drive folder alone does not add a test user or allowlist entry.
4. Restart GATE Studio, visit the permanent website > Profiles & Drive, and sign in. Each user consents to app-file access in their own Drive. Real Google sign-in and cloud restore must be verified after the private secret is configured.

## How it works

- Google returns a one-use authorization code to the browser. The host exchanges it with the private client secret, checking a single-use state bound to the registered origin.
- The browser holds only a temporary GATE Studio session in memory. Host sessions expire after 12 hours and disappear on restart. Google refresh tokens are only in host memory. A restart requires signing in again.
- The host operator is trusted with each connected learner's tokens and synced progress. Local profiles are offline workspaces, not protected local accounts.
- The host supplies completed papers from its own saved library and the family connection to signed-in, allowlisted learners. It does not automatically read arbitrary files from GATE_STUDIO in Drive. Existing Drive JSON papers still support download and manual import.
- Backups use the narrow drive.file scope and are stored in each learner's own GATE_STUDIO_MY_PROGRESS folder, one file per device. Restore merges completed attempts and preserves existing unfinished work.
- Google sign-in, Drive backup/restore and shared host papers require the host and internet. Saved tests and local scoring remain offline-capable.
- No Google Picker SDK or browser API key remains in this implementation. Do not configure a Picker key for this flow.

Reference: https://developers.google.com/identity/oauth2/web/guides/use-code-model
