// UI audit harness. Drives the app in Chromium with a fake microphone, captures
// full-page screenshots of every screen/state, and collects console + page
// errors and failed network requests. Assumes backend (:8000) and Vite (:5173)
// are already running. Usage: node tools/ui-audit.mjs <outDir> [scenario]
//   scenario: "static" (default) screenshots the signed-in pages; "auth"
//   captures sign-in / sign-up / the welcome reel; "record" runs the full
//   record -> analyze -> results flow via fake audio.
//
// Every screen except the two auth pages is behind a login now, so each context
// signs in first via `authed()`.

import { chromium } from 'playwright'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const OUT = process.argv[2] || '.'
const SCENARIO = process.argv[3] || 'static'
const BASE = 'http://localhost:5173'
const here = path.dirname(fileURLToPath(import.meta.url))
const wav = path.join(here, 'fake_audio.wav')

// The throwaway account the harness drives. Registered on first run; reused
// afterwards, so repeated audits build up a history to screenshot.
const USER = {
  name: 'Audit Bot',
  email: 'audit-bot@example.com',
  password: 'orate-with-purpose-42',
}

// Upper bound on clicks needed to reach the end of the reel. Kept loose on
// purpose: src/data/voices.ts is meant to be edited, and the loop below stops
// on the button disappearing rather than on this number.
const VOICE_COUNT = 12

const problems = []
function watch(page, tag) {
  page.on('console', (m) => {
    if (m.type() === 'error') problems.push(`[${tag}] console.error: ${m.text()}`)
    if (m.type() === 'warning') problems.push(`[${tag}] console.warn: ${m.text()}`)
  })
  page.on('pageerror', (e) => problems.push(`[${tag}] PAGEERROR: ${e.message}`))
  page.on('requestfailed', (r) =>
    problems.push(`[${tag}] requestfailed: ${r.url()} ${r.failure()?.errorText ?? ''}`),
  )
  page.on('response', (r) => {
    if (r.status() >= 400) problems.push(`[${tag}] http ${r.status()}: ${r.url()}`)
  })
}

const browser = await chromium.launch({
  args: [
    '--use-fake-ui-for-media-stream',
    '--use-fake-device-for-media-stream',
    `--use-file-for-fake-audio-capture=${wav}`,
    '--autoplay-policy=no-user-gesture-required',
  ],
})

async function shot(page, name) {
  // animations:'allow' is deliberate. The app is full of infinite CSS
  // animations (the waveforms alone are ~70 animated bars); Playwright's
  // default freezing walks every one of them and routinely times out here.
  await page.screenshot({ path: path.join(OUT, name), fullPage: true, animations: 'allow' })
  console.log('shot', name)
}

/** Register-or-sign-in through the real API, so the context holds a live
 *  session cookie. Returns the context ready to visit any guarded page. */
async function signIn(ctx) {
  const api = ctx.request
  // Prime the CSRF cookie exactly as the SPA does.
  await api.get(`${BASE}/api/auth/csrf`)
  const state = await ctx.storageState()
  const csrf = state.cookies.find((c) => c.name === 'csrftoken')?.value ?? ''
  const headers = { 'X-CSRFToken': csrf, 'Content-Type': 'application/json' }

  const registered = await api.post(`${BASE}/api/auth/register`, { headers, data: USER })
  if (!registered.ok() && registered.status() !== 409) {
    throw new Error(`register failed: ${registered.status()} ${await registered.text()}`)
  }
  if (registered.status() === 409) {
    const login = await api.post(`${BASE}/api/auth/login`, {
      headers,
      data: { email: USER.email, password: USER.password, remember: true },
    })
    if (!login.ok()) throw new Error(`login failed: ${login.status()} ${await login.text()}`)
  }
  return ctx
}

async function authedContext(viewport = { width: 1280, height: 900 }, extra = {}) {
  const ctx = await browser.newContext({ viewport, ...extra })
  await signIn(ctx)
  return ctx
}

/** The signed-out screens plus the welcome reel. */
async function authRun() {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 940 } })
  const page = await ctx.newPage()
  watch(page, 'auth')

  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1200) // let the entrance animations settle
  await shot(page, 'a1-login.png')

  await page.goto(`${BASE}/register`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(900)
  await shot(page, 'a2-register-empty.png')

  // A password that fails the rules, so the checklist and meter are visible.
  await page.locator('input[name="name"]').fill(USER.name)
  await page.locator('input[name="email"]').fill(USER.email)
  await page.locator('input[name="password"]').fill('audit')
  await page.waitForTimeout(400)
  await shot(page, 'a3-register-weak-password.png')

  await page.locator('input[name="password"]').fill(USER.password)
  await page.waitForTimeout(400)
  await shot(page, 'a4-register-strong-password.png')

  // Mobile sign-in, where the stage panel collapses to the compact band.
  const m = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const mp = await m.newPage()
  watch(mp, 'auth-mobile')
  await mp.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
  await mp.waitForTimeout(1000)
  await shot(mp, 'a5-login-mobile.png')
  await m.close()

  // The reel itself, entered the way a real sign-in enters it.
  const authed = await authedContext({ width: 1440, height: 940 })
  const reel = await authed.newPage()
  watch(reel, 'welcome')
  await reel.goto(`${BASE}/welcome`, { waitUntil: 'networkidle' })
  await reel.waitForTimeout(1200)
  await shot(reel, 'a6-welcome-opening.png')
  // A fresh context has no remembered sound choice, so the reel opens on the
  // card that asks for one.
  await reel.getByRole('button', { name: /Begin without sound/i }).click()
  await reel.waitForTimeout(2500)
  await shot(reel, 'a6-welcome-slide1.png')
  await reel.getByRole('button', { name: /Next voice/i }).click()
  await reel.waitForTimeout(2200)
  await shot(reel, 'a7-welcome-slide2.png')
  // Jump to the end and capture the closing card. The controls unmount with
  // the last slide, so stop as soon as the button is gone rather than waiting
  // out a 30s click timeout.
  const nextButton = reel.getByRole('button', { name: /Next voice/i })
  for (let i = 0; i < VOICE_COUNT; i++) {
    if (!(await nextButton.count())) break
    await nextButton.click()
    await reel.waitForTimeout(250)
  }
  await reel.waitForTimeout(1500)
  await shot(reel, 'a8-welcome-outro.png')
  await authed.close()
  await ctx.close()
}

async function staticRun() {
  const ctx = await authedContext()
  const page = await ctx.newPage()
  watch(page, 'desktop')

  await page.goto(BASE, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1200)
  await shot(page, '01-practice-desktop.png')

  // Ritual overlay
  await page.getByRole('button', { name: /Start practice/i }).click()
  await page.waitForTimeout(1200)
  await shot(page, '02-ritual.png')
  // Skip into the recording state
  await page.getByRole('button', { name: /Skip warm-up/i }).click()
  await page.waitForTimeout(2500)
  await shot(page, '03-recording.png')
  // leave recording without submitting
  await ctx.close()

  // Progress (empty or populated depending on DB)
  const p2 = await (await authedContext()).newPage()
  watch(p2, 'progress')
  await p2.goto(`${BASE}/progress`, { waitUntil: 'networkidle' })
  await p2.waitForTimeout(1500)
  await shot(p2, '04-progress.png')

  // Mobile practice
  const m = await (await authedContext({ width: 390, height: 844 })).newPage()
  watch(m, 'mobile')
  await m.goto(BASE, { waitUntil: 'networkidle' })
  await m.waitForTimeout(1200)
  await shot(m, '05-practice-mobile.png')
}

async function recordRun() {
  const ctx = await authedContext({ width: 1280, height: 900 }, { permissions: ['microphone'] })
  const page = await ctx.newPage()
  watch(page, 'record')
  await page.goto(BASE, { waitUntil: 'networkidle' })
  // Skip ritual permanently for a fast path
  await page.evaluate(() => localStorage.setItem('coach.skipRitual', '1'))
  await page.getByRole('button', { name: /Start practice/i }).click()
  await page.waitForTimeout(4000) // record ~4s of fake audio
  await shot(page, '06-recording-live.png')
  await page.getByRole('button', { name: /Stop & analyze/i }).click()
  await page.waitForTimeout(800)
  await shot(page, '07-analyzing.png')
  // Wait for navigation to results (real Whisper — allow time)
  await page.waitForURL(/\/results\/\d+/, { timeout: 90000 })
  await page.waitForTimeout(1500)
  await shot(page, '08-results.png')
  await ctx.close()
}

async function dataRun() {
  const ctx = await authedContext()
  const page = await ctx.newPage()
  watch(page, 'data')
  await page.goto(`${BASE}/progress`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1800)
  await shot(page, '09-progress-populated.png')
  // Open the first session in history -> results
  const first = page.locator('a[href^="/results/"]').first()
  if (await first.count()) {
    await first.click()
    await page.waitForURL(/\/results\/\d+/, { timeout: 30000 })
    await page.waitForTimeout(1200)
    await shot(page, '10-results-populated.png')
  }
  // Mobile progress
  const m = await (await authedContext({ width: 390, height: 844 })).newPage()
  watch(m, 'data-mobile')
  await m.goto(`${BASE}/progress`, { waitUntil: 'networkidle' })
  await m.waitForTimeout(1800)
  await shot(m, '11-progress-mobile.png')
  await ctx.close()
}

try {
  if (SCENARIO === 'record') await recordRun()
  else if (SCENARIO === 'data') await dataRun()
  else if (SCENARIO === 'auth') await authRun()
  else await staticRun()
} catch (e) {
  problems.push(`FATAL: ${e.message}`)
} finally {
  await browser.close()
  console.log('\n===== PROBLEMS (' + problems.length + ') =====')
  for (const p of problems) console.log(p)
  console.log('===== END =====')
}
