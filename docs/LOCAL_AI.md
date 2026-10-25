# GATE Studio: local AI, offline exams and free sharing

## Open on the host

Double-click `START_GATE_STUDIO.cmd`. It starts saved Ollama and the separate,
database-free companion at `http://127.0.0.1:4001`. The original PostgreSQL
backend remains available separately; this website does not require it.

In Connection settings, leave the address blank on the host and enter
`LOCAL_ACCESS_KEY` from `gate-backend/.env`. Keep this family key private.
On another computer copy `.env.example` to `.env` and replace its placeholder key.

## Papers

- Full ECE: 65 questions, 100 marks, 180 minutes. Aptitude is 10 questions/15 marks,
  engineering mathematics is 13 marks, remaining ECE is 72 marks. Subject weights
  are a practice blueprint, not a prediction of the official distribution.
- Single subject: choose Subject practice, a subject, and 65 questions. This also
  totals 100 marks. Shorter practice sets are available.
- Generation runs a second local AI consistency check and saves each accepted question on the host. This check is not a mathematical guarantee. After a restart use Recover the
  latest host generation job, then Resume generation. Completed papers can be
  saved to the browser library or exported for your brother to import.
- Wrong MCQ answers lose one third of their marks. MSQ/NAT have no negative marks.
  MSQ uses exact set matching, without partial marks. NAT tolerance is +/-0.01,
  a practice default rather than all official GATE answer ranges.

## Offline and power cuts

Open the built website online once, until Offline-ready appears. Save or import
a complete paper before disconnecting. Every answer, review flag and timer
checkpoint saves on this browser. After a power cut reopen the same URL in the
same browser and select Resume attempt. A powered-off device cannot run a test.
Practice time pauses while closed; Exam time continues against a saved deadline.
Scoring, saved solutions and exports work offline. New generation and AI tutor
notes need the host online. Tutor notes are saved with completed results.

Clearing browser site data or losing device storage can remove attempts. Export
an attempt backup to keep a separate copy. Paper files include answer keys for
self-study. Use Export result to send an attempt back for review; the receiver
imports it through Paper library or Review & progress.

## Diagrams

Supported templates: series/parallel resistors, unloaded voltage divider, ideal
inverting op-amp. SVG drawings, values, text, keys and solutions share numeric
source data. These render offline. Suitable Networks/Analog questions use them.
Arbitrary transistor circuits, complex topologies and waveforms are not supported.
Other AI questions are instructed to be self-contained without unseen figures.

## Private PDF reference

The supplied PDF and extracted index are private under references/ and ignored
by Git. This is a 31-page sample covering Z-transforms and DTFT/DFT/FFT. Contents
pages are excluded from retrieval. Relevant excerpts with physical PDF page
numbers are supplied to the host model for generation and explanations. Equations
and diagrams can be corrupted or lost in text extraction; check the original
page before relying on a formula. This is retrieval, not model training.
See references/README.md for reindexing.

## Free sharing

GitHub Pages hosts the public frontend, not the model. Your brother can import
saved papers and return exported results even while the host is off. Browser
histories stay separate until explicitly exported.

For live AI run share-local-ai.ps1 on the host. It uses official cloudflared at
D:/VSCODE/tools/cloudflared/cloudflared.exe to create a temporary HTTPS companion
address. Share that address and the family key privately. Enter them in the
public website Connection settings. The quick-tunnel address changes on restart.
Only the companion is exposed; Ollama stays on loopback. The PDF is never served.
A host outage stops live generation/tutoring, but a saved offline test continues.

## Build, publish and verify

Run npm run build in gate-frontend to build the app and offline cache. A public
Pages build sets GITHUB_ACTIONS=true for the /ece-gate-mock/ base path.
The tracked Actions workflow publishes main when Pages uses GitHub Actions.
The initial deployment can use a static gh-pages branch instead. Only frontend
build output belongs there. Never include .env, local-data or private references.

Run npm test in gate-frontend and npm run test:local in gate-backend. Checks cover
scoring, circuit calculations, 65/100 blueprints, interrupted generation recovery
and reference coverage when the private index is present.

## Faster generation and duplicate prevention

Mixed Engineering Mathematics papers use 13 formula-based families with varied numeric givens, calculated keys and worked solutions. These are fundamentals practice variants. Specific unsupported topics continue to use the local AI. Supported circuit templates are also calculated directly.

Model-dependent questions still use sequential generation and local review on the same GPU. Each candidate is checked for duplicate stems before review. Superscripts, caret powers and appended options are normalized so the same question across MCQ/MSQ/NAT is rejected. Earlier full question text is no longer copied into retry prompts. Fresh random seeds vary attempts. The progress card reports calculated questions, model calls, duplicate rejections and generation/review time. Figures include rejected attempts and are not a prediction of remaining time.

## Generation controls

While a paper is generating, Pause generation and Stop generation cancel the active inference request. Both keep completed questions on the host. Pause marks the job as paused; Stop ends the active run and marks it stopped. Resume generation continues from the last accepted question in either case. Already completed papers need no cancellation. Formula-based papers may finish before a pause action is needed.

## Requested 65-question type mix

Full ECE and 65-question single-subject practice papers use 35 MCQ, 18 MSQ and 12 NAT. The 12 NAT comprise six 1-mark and six 2-mark questions. The full ECE paper retains 10 General Aptitude questions and 100 total marks. This is a selected practice mix; the official GATE pattern does not fix the NAT count at twelve. Shorter sets keep their existing type rotation.

## Permanent sharing link

Always share https://kanakkujur.github.io/ece-gate-mock/. The temporary Cloudflare address is now a connection detail resolved automatically from the repository's public companion.json pointer. share-local-ai.ps1 reuses an existing tunnel or starts a new one, then publishes only its HTTPS address through the already signed-in GitHub CLI. The family key remains private. START_GATE_STUDIO.cmd also runs this sharing setup when online. In website Connection settings leave Automatic host connection enabled; your brother enters the family key once. An optional manual override remains available.

GitHub Pages hosts the static website; inference still runs on the host computer. If the host is off, saved papers remain usable offline. Publishing a changed pointer requires GitHub CLI access to this repository. No new domain, account or paid hosting service is required on this configured computer.

## Score statistics

Open Statistics in the sidebar or View statistics on Overview. Completed attempts are split into Full ECE mocks, Subject tests, and Mixed practice/warm-ups. Saved papers and unfinished attempts do not count. Explicit paper-mode metadata is preserved in new exports; older results are classified using their subject and question count.

Average and best score use percentages of each paper's maximum marks, rather than mixing raw marks from short sets and 100-mark mocks. Accuracy is total correct divided by total attempted questions; skipped answers do not inflate or reduce accuracy, but they lower the score percentage. Subject breakdowns include subject questions inside full mocks. Negative marks, skipped questions, recent scores and the last twenty score points are shown. Select a history row or chart point to review an attempt.

Filter by paper type, subject (for subject tests), learner, date period, difficulty and timing mode. Results imported from another device are included and can be separated by learner. The statistics work offline and do not call the AI. This browser's stored data is the source; there is no automatic cross-device synchronization.

## Automatic family-key setup

Send gate-backend/local-data/FAMILY_SETUP.html privately to your brother, or send the private URL contained in FAMILY_SETUP_LINK.txt. He opens it once. The website stores the family key in that browser, enables automatic host lookup, removes the setup fragment from the address bar, and reconnects on future visits. The normal GitHub website link can then be used without entering the key again. Existing manually saved keys also reconnect automatically.

Connection settings includes Download private setup link for making the same invitation from a configured browser. The setup files contain the family credential and remain ignored by Git; companion.json contains only the public host address. share-local-ai.ps1 refreshes the private setup files as part of host setup. A different browser, private browsing, or cleared site data requires opening the private setup link again. Test results remain separate from connection settings.
