import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import { command, parseManifest, render } from './render.ts'

for (const transition of ['cut', 'fade']) {
  await test(`renders trimmed ${transition} clips with silent source, captions, logo and music`, async () => {
    const directory = await mkdtemp(join(tmpdir(), 'comfy-smoke-'))
    const signal = AbortSignal.timeout(30000)
    try {
      await command(
        'ffmpeg',
        [
          '-loglevel',
          'error',
          '-f',
          'lavfi',
          '-i',
          'color=red:s=320x180:d=2',
          '-c:v',
          'libx264',
          '-f',
          'mp4',
          join(directory, 'clip0')
        ],
        signal
      )
      await command(
        'ffmpeg',
        [
          '-loglevel',
          'error',
          '-f',
          'lavfi',
          '-i',
          'color=blue:s=180x320:d=2',
          '-f',
          'lavfi',
          '-i',
          'sine=frequency=440:duration=2',
          '-c:v',
          'libx264',
          '-c:a',
          'aac',
          '-f',
          'mp4',
          join(directory, 'clip1')
        ],
        signal
      )
      await command(
        'ffmpeg',
        [
          '-loglevel',
          'error',
          '-f',
          'lavfi',
          '-i',
          'sine=frequency=220:duration=0.5',
          '-f',
          'wav',
          join(directory, 'music')
        ],
        signal
      )
      await command(
        'ffmpeg',
        [
          '-loglevel',
          'error',
          '-f',
          'lavfi',
          '-i',
          'color=green:s=40x40',
          '-frames:v',
          '1',
          '-f',
          'image2',
          '-c:v',
          'png',
          join(directory, 'logo')
        ],
        signal
      )
      const manifest = parseManifest({
        clips: [
          { file: 'clip0', start: 0.2, duration: 1.2 },
          { file: 'clip1', start: 0.3, duration: 1.4 }
        ],
        width: 320,
        height: 180,
        transition,
        caption: "Test: 100% 'caption'",
        musicVolume: 0.2,
        originalVolume: 0.8
      })
      const output = await render(
        manifest,
        directory,
        { music: true, logo: true },
        signal
      )
      const duration = Number(
        await command(
          'ffprobe',
          [
            '-v',
            'error',
            '-show_entries',
            'format=duration',
            '-of',
            'default=nw=1:nk=1',
            output
          ],
          signal
        )
      )
      assert.ok(Math.abs(duration - (transition === 'cut' ? 2.6 : 2.3)) < 0.12)
      const streams = await command(
        'ffprobe',
        [
          '-v',
          'error',
          '-show_entries',
          'stream=codec_name,width,height',
          '-of',
          'csv=p=0',
          output
        ],
        signal
      )
      assert.match(streams, /h264,320,180/)
      assert.match(streams, /aac/)
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
}

await test('rejects external file paths and excessive timelines before processing', () => {
  const base = {
    width: 1280,
    height: 720,
    transition: 'cut',
    caption: '',
    musicVolume: 1,
    originalVolume: 1
  }
  assert.throws(
    () =>
      parseManifest({
        ...base,
        clips: [{ file: '/etc/passwd', start: 0, duration: 1 }]
      }),
    /Invalid clip/
  )
  assert.throws(
    () =>
      parseManifest({
        ...base,
        clips: [
          { file: 'clip0', start: 0, duration: 70 },
          { file: 'clip1', start: 0, duration: 70 }
        ]
      }),
    /120 seconds/
  )
})

await test('rejects a trim extending beyond the actual video frames', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'comfy-short-'))
  const signal = AbortSignal.timeout(30000)
  try {
    await command(
      'ffmpeg',
      [
        '-loglevel',
        'error',
        '-f',
        'lavfi',
        '-i',
        'color=red:s=128x128:d=0.6',
        '-c:v',
        'libx264',
        '-f',
        'mp4',
        join(directory, 'clip0')
      ],
      signal
    )
    const manifest = parseManifest({
      clips: [{ file: 'clip0', start: 0, duration: 2 }],
      width: 128,
      height: 128,
      transition: 'cut',
      caption: '',
      musicVolume: 0,
      originalVolume: 1
    })
    await assert.rejects(
      render(manifest, directory, { music: false, logo: false }, signal),
      /shorter than its requested trim/
    )
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
