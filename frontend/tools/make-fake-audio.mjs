// Generates tools/fake_audio.wav — speech-like tone bursts used as Chromium's
// fake microphone input for the UI audit (see ui-audit.mjs). Run once:
//   node tools/make-fake-audio.mjs
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const SR = 48000
const samples = []
let t = 0
for (let k = 0; k < 11; k++) {
  const freq = 140 + (k % 5) * 40
  for (let i = 0; i < SR * 0.4; i++) {
    samples.push(Math.round(6000 * Math.sin(2 * Math.PI * freq * t)))
    t += 1 / SR
  }
  for (let i = 0; i < SR * 0.15; i++) {
    samples.push(0)
    t += 1 / SR
  }
}

const dataLen = samples.length * 2
const buf = Buffer.alloc(44 + dataLen)
buf.write('RIFF', 0)
buf.writeUInt32LE(36 + dataLen, 4)
buf.write('WAVE', 8)
buf.write('fmt ', 12)
buf.writeUInt32LE(16, 16)
buf.writeUInt16LE(1, 20) // PCM
buf.writeUInt16LE(1, 22) // mono
buf.writeUInt32LE(SR, 24)
buf.writeUInt32LE(SR * 2, 28)
buf.writeUInt16LE(2, 32)
buf.writeUInt16LE(16, 34)
buf.write('data', 36)
buf.writeUInt32LE(dataLen, 40)
samples.forEach((s, i) => buf.writeInt16LE(Math.max(-32767, Math.min(32767, s)), 44 + i * 2))

const out = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fake_audio.wav')
writeFileSync(out, buf)
console.log('wrote', out, (dataLen / SR / 2).toFixed(1), 's')
