# Google sign-in and Drive setup for GATE Studio

The owner's Drive folder is already created:

https://drive.google.com/drive/folders/1n2ahSJrqpC1zLMd792zDYFY0iWkEl_cZ

It contains Setup, Papers and Results. The private setup HTML, family-connection.json,
shared-paper-library.json and Mathematics paper have been uploaded. Do not make the
folder public: the setup files contain the family access credential.

## One-time owner registration

The Google Drive connection in Codex belongs to Codex. The website needs its own
Google app registration; connector tokens cannot be reused as website sign-in.

1. Open Google Cloud Console with the account that will own this app. Create or
   select a project. If Google asks for terms or account setup, complete that yourself.
2. Enable Google Drive API and Google Picker API for this project.
3. Configure Google Auth Platform branding and audience for GATE Studio. For a
   private testing app, add your and your brother's Google emails as test users.
4. Create an OAuth client of type Web application. Authorize JavaScript origins:
   - `https://kanakkujur.github.io`
   - `http://127.0.0.1:4001` if you also want Google sign-in on the local website
   - Any explicitly used development origin, separately, during testing.
5. Create a browser API key for Google Picker. Restrict it to the Picker and Drive
   APIs and website referrers `https://kanakkujur.github.io/*` and
   `https://docs.google.com/*` (Google Picker uses a docs.google.com iframe).
6. Put the public OAuth client ID, restricted browser API key and Google project
   number into `gate-frontend/public/google-app.json`, then rebuild and publish.
   The website uses the popup token model. No client secret or service-account
   credential belongs in this file or in the website.

The public config shape is:

```json
{
  "clientId": "YOUR_WEB_CLIENT_ID.apps.googleusercontent.com",
  "apiKey": "YOUR_RESTRICTED_BROWSER_PICKER_KEY",
  "projectNumber": "YOUR_GOOGLE_CLOUD_PROJECT_NUMBER",
  "sharedFolderUrl": "https://drive.google.com/drive/folders/1n2ahSJrqpC1zLMd792zDYFY0iWkEl_cZ"
}
```

Until those values are configured, Profiles & Drive clearly shows that Google
sign-in needs owner setup. Local profiles, offline exams and private setup links
work without this registration. No Google sign-in has been live-verified yet.

## First visit for each learner

1. Share the GATE_STUDIO folder privately with the learner's Google email.
2. Open the permanent website and go to Profiles & Drive.
3. Sign in with Google and grant access to selected app files.
4. Choose family-connection.json and shared-paper-library.json in Google's Picker.
   With the narrow drive.file permission, a file created outside the website must
   be explicitly selected before the website can read it. Folder access alone is
   not treated as a grant to read every file inside it.
5. The family key and papers save on the device. Selected file IDs are remembered
   for later sign-ins. The private setup link is also available as an alternative.

Google OAuth access tokens stay in memory and expire. The user may need to click
Reconnect/Sign in again to use Drive in a later session. This does not erase the
saved family key or local work. We do not persist refresh tokens or access tokens.

## Profiles and backups

- Each local or Google profile has separate history and unfinished attempts.
- Existing work stays in the original Local profile. Copy existing local results
  here is explicit and never deletes the original records.
- The question-paper library is shared on the device for family practice.
- Each Google account's private progress is stored in GATE_STUDIO_MY_PROGRESS in
  that account's Drive, using one backup file per device to avoid overwrites.
- Submitted results back up automatically while the matching Google Drive session
  is connected, unless disabled. Back up now also includes the saved unfinished test.
- Restore merges result IDs, ignores another profile's snapshots and preserves an
  existing unfinished local attempt. Family keys are excluded from progress backups.
- Local profiles are offline workspaces, not password-protected accounts. Google
  permissions control cloud-file access. The local AI still runs on the host PC.

## Google references

- https://developers.google.com/identity/oauth2/web/guides/use-token-model
- https://developers.google.com/workspace/drive/picker/guides/web-picker
- https://developers.google.com/workspace/drive/api/guides/api-specific-auth
