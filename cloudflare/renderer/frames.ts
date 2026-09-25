import { spawn } from 'node:child_process'

export interface Sample {
  t: number
  r: number
  g: number
  b: number
  luma: number
  motion: number
}

interface Keyframe {
  t: number
  jpeg: string
}

const statWidth = 32
const statHeight = 18
const statFps = 8

function run(command: string, args: string[], signal: AbortSignal) {
  return new Promise<Buffer>((resolve, reject) => {
    const child = spawn(command, args, {
      signal,
      stdio: ['ignore', 'pipe', 'pipe']
    })
    const chunks: Buffer[] = []
    let size = 0
    child.stdout.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > 64 * 1024 * 1024) child.kill('SIGKILL')
      else chunks.push(chunk)
    })
    child.on('error', reject)
    child.on('close', (code) =>
      code === 0
        ? resolve(Buffer.concat(chunks))
        : reject(new Error(`${command} exited with ${code}`))
    )
  })
}

/** Mean colour, luma and frame-to-frame change for raw rgb24 frames. */
export function sampleStats(
  raw: Uint8Array,
  width: number,
  height: number,
  fps: number
): Sample[] {
  const frameSize = width * height * 3
  const count = Math.floor(raw.length / frameSize)
  const samples: Sample[] = []
  for (let index = 0; index < count; index++) {
    const offset = index * frameSize
    let r = 0
    let g = 0
    let b = 0
    let motion = 0
    for (let pixel = 0; pixel < frameSize; pixel += 3) {
      r += raw[offset + pixel]
      g += raw[offset + pixel + 1]
      b += raw[offset + pixel + 2]
      if (index > 0)
        for (let channel = 0; channel < 3; channel++)
          motion += Math.abs(
            raw[offset + pixel + channel] -
              raw[offset - frameSize + pixel + channel]
          )
    }
    const pixels = width * height
    const mean = (value: number) => value / pixels / 255
    samples.push({
      t: Number((index / fps).toFixed(3)),
      r: mean(r),
      g: mean(g),
      b: mean(b),
      luma: 0.2126 * mean(r) + 0.7152 * mean(g) + 0.0722 * mean(b),
      motion: index > 0 ? motion / (pixels * 3 * 255) : 0
    })
  }
  return samples
}

/** Splits a concatenated MJPEG stream into individual JPEG images. */
export function splitJpegs(stream: Uint8Array) {
  const images: Uint8Array[] = []
  let start = -1
  for (let index = 0; index < stream.length - 1; index++) {
    if (stream[index] === 0xff && stream[index + 1] === 0xd8 && start < 0)
      start = index
    else if (
      stream[index] === 0xff &&
      stream[index + 1] === 0xd9 &&
      start >= 0
    ) {
      images.push(stream.subarray(start, index + 2))
      start = -1
      index++
    }
  }
  return images
}

export async function analyse(
  path: string,
  count: number,
  signal: AbortSignal
) {
  const probe = await run(
    'ffprobe',
    ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path],
    signal
  )
  const duration = Number(probe.toString().trim())
  if (!Number.isFinite(duration) || duration <= 0 || duration > 120)
    throw new Error('Video duration must be between 0 and 120 seconds')
  const raw = await run(
    'ffmpeg',
    [
      '-v',
      'error',
      '-i',
      path,
      '-vf',
      `fps=${statFps},scale=${statWidth}:${statHeight}`,
      '-f',
      'rawvideo',
      '-pix_fmt',
      'rgb24',
      'pipe:1'
    ],
    signal
  )
  const times = Array.from({ length: count }, (_, index) =>
    Math.min(duration - 0.05, (duration * index) / (count - 1))
  )
  const keyframes: Keyframe[] = []
  for (const t of times) {
    const jpeg = await run(
      'ffmpeg',
      [
        '-v',
        'error',
        '-ss',
        t.toFixed(3),
        '-i',
        path,
        '-frames:v',
        '1',
        '-vf',
        'scale=512:-2',
        '-q:v',
        '5',
        '-f',
        'mjpeg',
        'pipe:1'
      ],
      signal
    )
    const [image] = splitJpegs(jpeg)
    if (image)
      keyframes.push({
        t: Number(t.toFixed(3)),
        jpeg: Buffer.from(image).toString('base64')
      })
  }
  return {
    duration,
    samples: sampleStats(raw, statWidth, statHeight, statFps),
    keyframes
  }
}
