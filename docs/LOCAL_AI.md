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
- Generation saves each question on the host. After a restart use Recover the
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
