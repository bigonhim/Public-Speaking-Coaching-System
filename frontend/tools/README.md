# UI audit harness

A Playwright script that drives the app in Chromium with a **fake microphone**,
captures full-page screenshots of every screen/state, and reports console/page/
network errors. Used to verify the UI end-to-end without a real mic.

## One-time setup
```bash
npm install                       # installs playwright (devDependency)
npx playwright install chromium   # downloads the browser
node tools/make-fake-audio.mjs    # generates tools/fake_audio.wav (gitignored)
```

## Run (backend on :8000 and `npm run dev` on :5173 must be running)
```bash
node tools/ui-audit.mjs <outDir> static   # screenshots pages (desktop + mobile)
node tools/ui-audit.mjs <outDir> record   # full record -> analyze -> results flow
node tools/ui-audit.mjs <outDir> data     # progress + a populated results page
```
Seed demo data first for the `data` scenario:
`python manage.py seed_fake_sessions --reset --count 12`.
