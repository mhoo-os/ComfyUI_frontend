import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import { analyse, sampleStats, splitJpegs } from './frames.ts'
import { command } from './render.ts'

await test('sampleStats reports colour and motion per frame', () => {
  const still = new Uint8Array(2 * 1 * 3).fill(200)
  const changed = new Uint8Array(2 * 1 * 3).fill(0)
  const samples = sampleStats(
    new Uint8Array([...still, ...still, ...changed]),
    2,
    1,
    2
  )
  assert.equal(samples.length, 3)
  assert.equal(samples[1].motion, 0)
  assert.ok(samples[2].motion > 0.7)
  assert.equal(samples[2].t, 1)
})

await test('splitJpegs separates concatenated images', () => {
  const jpeg = [0xff, 0xd8, 1, 2, 0xff, 0xd9]
  assert.equal(splitJpegs(new Uint8Array([...jpeg, ...jpeg])).length, 2)
})

await test('analyse extracts keyframes and a colour shift from a real clip', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'comfy-frames-test-'))
  const signal = AbortSignal.timeout(60000)
  try {
    const path = join(directory, 'clip.mp4')
    await command(
      'ffmpeg',
      [
        '-loglevel',
        'error',
        '-f',
        'lavfi',
        '-i',
        'color=0xd9824b:s=320x180:d=2',
        '-f',
        'lavfi',
        '-i',
        'color=0x3a64c8:s=320x180:d=2',
        '-filter_complex',
        '[0][1]concat=n=2:v=1',
        '-c:v',
        'libx264',
        '-pix_fmt',
        'yuv420p',
        path
      ],
      signal
    )
    const result = await analyse(path, 4, signal)
    assert.ok(Math.abs(result.duration - 4) < 0.2)
    assert.equal(result.keyframes.length, 4)
    const first = result.samples[0]
    const last = result.samples.at(-1)!
    assert.ok(first.r > first.b && last.b > last.r)
    assert.ok(Math.max(...result.samples.map((s) => s.motion)) > 0.1)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
