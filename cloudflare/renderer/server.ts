import { createReadStream } from 'node:fs'
import { mkdtemp, rm, stat, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pipeline } from 'node:stream/promises'

import { parseManifest, render } from './render.ts'

const maxBytes = 500 * 1024 * 1024
let busy = false
const server = createServer(async (request, response) => {
  if (request.url === '/health' && request.method === 'GET') {
    response.writeHead(200).end('ok')
    return
  }
  if (request.url !== '/render' || request.method !== 'POST') {
    response.writeHead(404).end()
    return
  }
  if (busy) {
    response.writeHead(503, { 'Retry-After': '10' }).end('Renderer busy')
    return
  }
  busy = true
  const controller = new AbortController()
  const timeout = setTimeout(
    () => {
      controller.abort()
      if (!request.complete) request.destroy()
    },
    8 * 60 * 1000
  )
  response.on('close', () => {
    if (!response.writableFinished) controller.abort()
  })
  let directory: string | undefined
  let status = 400
  try {
    directory = await mkdtemp(join(tmpdir(), 'comfy-render-'))
    if (Number(request.headers['content-length']) > maxBytes)
      throw new Error('Upload exceeds 500MB')
    const chunks: Buffer[] = []
    let size = 0
    for await (const chunk of request) {
      if (!Buffer.isBuffer(chunk)) throw new Error('Invalid upload')
      size += chunk.length
      if (size > maxBytes || controller.signal.aborted)
        throw new Error('Upload exceeds limit or timed out')
      chunks.push(chunk)
    }
    const body = new Response(Buffer.concat(chunks), {
      headers: { 'Content-Type': request.headers['content-type'] || '' }
    })
    const form = await body.formData()
    const rawManifest = form.get('manifest')
    if (typeof rawManifest !== 'string' || rawManifest.length > 10000)
      throw new Error('Missing manifest')
    const manifest = parseManifest(JSON.parse(rawManifest))
    const expected = new Set([
      ...manifest.clips.map((clip) => clip.file),
      'music',
      'logo',
      'manifest'
    ])
    if (
      [...form.keys()].some(
        (key) => !expected.has(key) || form.getAll(key).length !== 1
      )
    )
      throw new Error('Unexpected or duplicate upload field')
    for (const name of [
      ...manifest.clips.map((clip) => clip.file),
      'music',
      'logo'
    ]) {
      const file = form.get(name)
      if (file === null && (name === 'music' || name === 'logo')) continue
      if (!(file instanceof File) || file.size === 0)
        throw new Error(`Missing file: ${name}`)
      await writeFile(
        join(directory, name),
        new Uint8Array(await file.arrayBuffer())
      )
    }
    status = 422
    const output = await render(
      manifest,
      directory,
      { music: form.has('music'), logo: form.has('logo') },
      controller.signal
    )
    const metadata = await stat(output)
    response.writeHead(200, {
      'Content-Type': 'video/mp4',
      'Content-Length': metadata.size,
      'Cache-Control': 'no-store'
    })
    await pipeline(createReadStream(output), response, {
      signal: controller.signal
    })
  } catch (error) {
    if (!response.headersSent)
      response
        .writeHead(controller.signal.aborted ? 504 : status, {
          'Content-Type': 'application/json'
        })
        .end(
          JSON.stringify({
            error: controller.signal.aborted
              ? 'Render timed out or disconnected'
              : error instanceof Error
                ? error.message
                : 'Render failed'
          })
        )
    else response.destroy()
  } finally {
    clearTimeout(timeout)
    try {
      if (directory) await rm(directory, { recursive: true, force: true })
    } finally {
      busy = false
    }
  }
})
server.requestTimeout = 8 * 60 * 1000
server.listen(Number(process.env.PORT || 8080), '0.0.0.0')
