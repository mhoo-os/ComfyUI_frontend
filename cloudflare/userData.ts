import { boundedJson, json } from './jobs'

export async function userData(
  request: Request,
  env: Env,
  path: string,
  url: URL
) {
  if (path === '/userdata') {
    const dir = (url.searchParams.get('dir') ?? '').replace(/\/$/, '')
    const prefix = `file:${dir ? `${dir}/` : ''}`
    const result = await env.COMFY_STATE.list<{
      modified: number
      size: number
    }>({ prefix })
    return json(
      result.keys.map((key) => ({
        path: key.name.slice(prefix.length),
        modified: key.metadata?.modified ?? 0,
        size: key.metadata?.size ?? 0
      }))
    )
  }
  const file = decodeURIComponent(path.slice('/userdata/'.length))
  if (!file || file.length > 500 || file.includes('..'))
    return json({ error: 'Invalid file name' }, 400)
  if (file.includes('/move/')) {
    if (request.method !== 'POST')
      return json({ error: 'Method not allowed' }, 405)
    const [source, dest] = file.split('/move/')
    const value = await env.COMFY_STATE.get(`file:${source}`)
    if (value === null) return json({ error: 'Not found' }, 404)
    if (
      url.searchParams.get('overwrite') !== 'true' &&
      (await env.COMFY_STATE.get(`file:${dest}`)) !== null
    )
      return json({ error: 'File exists' }, 409)
    await env.COMFY_STATE.put(`file:${dest}`, value, {
      metadata: { modified: Date.now() / 1000, size: value.length }
    })
    await env.COMFY_STATE.delete(`file:${source}`)
    return json(dest)
  }
  const key = `file:${file}`
  if (request.method === 'DELETE') {
    await env.COMFY_STATE.delete(key)
    return new Response(null, { status: 204 })
  }
  if (request.method === 'POST') {
    if (
      url.searchParams.get('overwrite') === 'false' &&
      (await env.COMFY_STATE.get(key)) !== null
    )
      return json({ error: 'File exists' }, 409)
    const value = JSON.stringify(await boundedJson(request, 1024 * 1024))
    const info = { path: file, modified: Date.now() / 1000, size: value.length }
    await env.COMFY_STATE.put(key, value, { metadata: info })
    return json(url.searchParams.get('full_info') === 'true' ? info : file)
  }
  if (request.method !== 'GET')
    return json({ error: 'Method not allowed' }, 405)
  const value = await env.COMFY_STATE.get(key)
  return value === null
    ? json({ error: 'Not found' }, 404)
    : new Response(value, {
        headers: {
          'content-type': 'application/json',
          'cache-control': 'no-store'
        }
      })
}
