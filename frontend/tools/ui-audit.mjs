// UI audit harness. Drives the app in Chromium with a fake microphone, captures
// full-page screenshots of every screen/state, and collects console + page
// errors and failed network requests. Assumes backend (:8000) and Vite (:5173)
// are already running. Usage: node tools/ui-audit.mjs <outDir> [scenario]
//   scenario: "static" (default) screenshots pages; "record" runs the full
//   record -> analyze -> results flow via fake audio.

import { chromium } from 'playwright'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const OUT = process.argv[2] || '.'
const SCENARIO = process.argv[3] || 'static'
const BASE = 'http://localhost:5173'
const here = path.dirname(fileURLToPath(import.meta.url))
const wav = path.join(here, 'fake_audio.wav')

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
  await page.screenshot({ path: path.join(OUT, name), fullPage: true })
  console.log('shot', name)
}

async function staticRun() {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
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
  const p2 = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage()
  watch(p2, 'progress')
  await p2.goto(`${BASE}/progress`, { waitUntil: 'networkidle' })
  await p2.waitForTimeout(1500)
  await shot(p2, '04-progress.png')

  // Mobile practice
  const m = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage()
  watch(m, 'mobile')
  await m.goto(BASE, { waitUntil: 'networkidle' })
  await m.waitForTimeout(1200)
  await shot(m, '05-practice-mobile.png')
}

async function recordRun() {
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    permissions: ['microphone'],
  })
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
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
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
  const m = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage()
  watch(m, 'data-mobile')
  await m.goto(`${BASE}/progress`, { waitUntil: 'networkidle' })
  await m.waitForTimeout(1800)
  await shot(m, '11-progress-mobile.png')
  await ctx.close()
}

try {
  if (SCENARIO === 'record') await recordRun()
  else if (SCENARIO === 'data') await dataRun()
  else await staticRun()
} catch (e) {
  problems.push(`FATAL: ${e.message}`)
} finally {
  await browser.close()
  console.log('\n===== PROBLEMS (' + problems.length + ') =====')
  for (const p of problems) console.log(p)
  console.log('===== END =====')
}
