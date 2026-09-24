import { spawn } from 'node:child_process'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export interface Manifest {
  clips: { file: string; start: number; duration: number }[]
  width: number
  height: number
  transition: 'cut' | 'fade'
  caption: string
  musicVolume: number
  originalVolume: number
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
function bounded(value: unknown, min: number, max: number): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= min &&
    value <= max
  )
}
export function parseManifest(value: unknown): Manifest {
  if (
    !record(value) ||
    !Array.isArray(value.clips) ||
    value.clips.length < 1 ||
    value.clips.length > 8
  )
    throw new Error('Provide 1–8 clips')
  const clips = value.clips.map((clip: unknown, index: number) => {
    if (
      !record(clip) ||
      clip.file !== `clip${index}` ||
      !bounded(clip.start, 0, 3600) ||
      !bounded(clip.duration, 0.5, 120)
    )
      throw new Error('Invalid clip trim or file')
    return { file: clip.file, start: clip.start, duration: clip.duration }
  })
  if (clips.reduce((sum, clip) => sum + clip.duration, 0) > 120)
    throw new Error('Timeline exceeds 120 seconds')
  if (
    !bounded(value.width, 128, 1920) ||
    !Number.isInteger(value.width) ||
    value.width % 2 ||
    !bounded(value.height, 128, 1920) ||
    !Number.isInteger(value.height) ||
    value.height % 2
  )
    throw new Error('Dimensions must be even integers between 128 and 1920')
  if (value.transition !== 'cut' && value.transition !== 'fade')
    throw new Error('Invalid transition')
  if (
    typeof value.caption !== 'string' ||
    value.caption.length > 500 ||
    !bounded(value.musicVolume, 0, 2) ||
    !bounded(value.originalVolume, 0, 2)
  )
    throw new Error('Invalid caption or audio volume')
  return {
    clips,
    width: value.width,
    height: value.height,
    transition: value.transition,
    caption: value.caption,
    musicVolume: value.musicVolume,
    originalVolume: value.originalVolume
  }
}

export async function command(
  binary: string,
  args: string[],
  signal: AbortSignal
): Promise<string> {
  return await new Promise((resolve, reject) => {
    const child = spawn(binary, args, {
      signal,
      killSignal: 'SIGKILL',
      stdio: ['ignore', 'pipe', 'pipe']
    })
    let output = ''
    let errors = ''
    child.stdout.on('data', (data: Buffer) => {
      output = (output + data.toString()).slice(-65536)
    })
    child.stderr.on('data', (data: Buffer) => {
      errors = (errors + data.toString()).slice(-8192)
    })
    child.on('error', reject)
    child.on('close', (code) =>
      code === 0
        ? resolve(output)
        : reject(new Error(`${binary} failed: ${errors.slice(-2000)}`))
    )
  })
}
const inputSafety = [
  '-protocol_whitelist',
  'file,pipe',
  '-format_whitelist',
  'mov,matroska,webm,avi,mp3,wav,flac,ogg,aac,image2,png_pipe,jpeg_pipe'
]
const encode = [
  '-c:v',
  'libx264',
  '-preset',
  'veryfast',
  '-crf',
  '20',
  '-threads',
  '2',
  '-pix_fmt',
  'yuv420p',
  '-c:a',
  'aac',
  '-b:a',
  '192k',
  '-movflags',
  '+faststart'
]
async function ffmpeg(args: string[], signal: AbortSignal) {
  await command(
    'ffmpeg',
    [
      '-hide_banner',
      '-loglevel',
      'error',
      '-nostdin',
      '-y',
      '-filter_threads',
      '2',
      '-filter_complex_threads',
      '2',
      ...args
    ],
    signal
  )
}

export async function render(
  manifest: Manifest,
  directory: string,
  options: { music: boolean; logo: boolean },
  signal: AbortSignal
): Promise<string> {
  for (const [index, clip] of manifest.clips.entries()) {
    const source = join(directory, clip.file)
    const audio = await command(
      'ffprobe',
      [
        '-v',
        'error',
        ...inputSafety,
        '-select_streams',
        'a:0',
        '-show_entries',
        'stream=index',
        '-of',
        'csv=p=0',
        source
      ],
      signal
    )
    const args = [...inputSafety, '-ss', String(clip.start), '-i', source]
    if (!audio.trim())
      args.push('-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo')
    args.push(
      '-t',
      String(clip.duration),
      '-map',
      '0:v:0',
      '-map',
      audio.trim() ? '0:a:0' : '1:a:0',
      '-vf',
      `scale=${manifest.width}:${manifest.height}:force_original_aspect_ratio=decrease,pad=${manifest.width}:${manifest.height}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30,settb=AVTB`,
      '-af',
      'aresample=48000,apad',
      '-ar',
      '48000',
      '-ac',
      '2',
      ...encode,
      join(directory, `normalized${index}.mp4`)
    )
    await ffmpeg(args, signal)
    const duration = Number(
      await command(
        'ffprobe',
        [
          '-v',
          'error',
          '-show_entries',
          'stream=duration',
          '-select_streams',
          'v:0',
          '-of',
          'default=nw=1:nk=1',
          join(directory, `normalized${index}.mp4`)
        ],
        signal
      )
    )
    if (!Number.isFinite(duration) || duration + 0.1 < clip.duration)
      throw new Error(`Clip ${index + 1} is shorter than its requested trim`)
  }
  const args = manifest.clips.flatMap((_, index) => [
    '-i',
    join(directory, `normalized${index}.mp4`)
  ])
  const filters: string[] = []
  let video = '0:v'
  let audio = '0:a'
  let duration = manifest.clips[0].duration
  for (let index = 1; index < manifest.clips.length; index++) {
    if (manifest.transition === 'fade') {
      filters.push(
        `[${video}][${index}:v]xfade=transition=fade:duration=0.3:offset=${duration - 0.3}[v${index}]`,
        `[${audio}][${index}:a]acrossfade=d=0.3[a${index}]`
      )
      duration += manifest.clips[index].duration - 0.3
    } else {
      filters.push(
        `[${video}][${audio}][${index}:v][${index}:a]concat=n=2:v=1:a=1[v${index}][a${index}]`
      )
      duration += manifest.clips[index].duration
    }
    video = `v${index}`
    audio = `a${index}`
  }
  let inputIndex = manifest.clips.length
  if (options.logo) {
    args.push(...inputSafety, '-i', join(directory, 'logo'))
    filters.push(
      `[${inputIndex}:v]scale=${Math.round(manifest.width * 0.15)}:-1[logo]`,
      `[${video}][logo]overlay=W-w-24:24[vlogo]`
    )
    inputIndex++
    video = 'vlogo'
  }
  if (manifest.caption) {
    await writeFile(join(directory, 'caption.txt'), manifest.caption)
    filters.push(
      `[${video}]drawtext=fontfile=${process.env.RENDER_FONT || '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'}:textfile=${join(directory, 'caption.txt')}:expansion=none:fontsize=${Math.round(manifest.height * 0.045)}:fontcolor=white:box=1:boxcolor=black@0.55:boxborderw=12:x=(w-tw)/2:y=h-th-36[vcaption]`
    )
    video = 'vcaption'
  }
  filters.push(`[${audio}]volume=${manifest.originalVolume}[original]`)
  audio = 'original'
  if (options.music) {
    args.push(
      '-stream_loop',
      '-1',
      ...inputSafety,
      '-i',
      join(directory, 'music')
    )
    filters.push(
      `[${inputIndex}:a]aresample=48000,volume=${manifest.musicVolume}[music]`,
      '[original][music]amix=inputs=2:duration=first:normalize=0[amixed]'
    )
    audio = 'amixed'
  }
  const output = join(directory, 'output.mp4')
  await ffmpeg(
    [
      ...args,
      '-filter_complex',
      filters.join(';'),
      '-map',
      video.includes(':') ? video : `[${video}]`,
      '-map',
      `[${audio}]`,
      '-t',
      String(duration),
      ...encode,
      output
    ],
    signal
  )
  return output
}
