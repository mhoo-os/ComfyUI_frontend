import { createRemoteJWKSet, jwtVerify } from 'jose'
import { z } from 'zod'

import { models, nodeDefinitions } from './graph'
import { boundedJson, json } from './jobs'
import { uploadImage } from './media'
import { userData } from './userData'

export { ComfyJobs } from './jobs'

const base = '/00/comfy'
const keys = createRemoteJWKSet(
  new URL('https://mhoo.cloudflareaccess.com/cdn-cgi/access/certs')
)
async function authorized(request: Request, env: Env) {
  const token = request.headers.get('cf-access-jwt-assertion')
  if (!token) return false
  try {
    const { payload } = await jwtVerify(token, keys, {
      issuer: env.ACCESS_TEAM_DOMAIN,
      audience: env.ACCESS_AUD,
      algorithms: ['RS256']
    })
    return (
      typeof payload.email === 'string' &&
      payload.email.toLowerCase() === env.OWNER_EMAIL.toLowerCase()
    )
  } catch {
    return false
  }
}
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      const url = new URL(request.url)
      if (url.pathname !== base && !url.pathname.startsWith(`${base}/`))
        return json({ error: 'Not found' }, 404)
      if (!(await authorized(request, env)))
        return json({ error: 'Sign in with the workspace owner account.' }, 403)
      if (url.pathname === base)
        return Response.redirect(`${url.origin}${base}/`, 302)
      if (
        !['GET', 'HEAD'].includes(request.method) &&
        request.headers.get('origin') !== url.origin
      )
        return json({ error: 'Same-origin request required.' }, 403)
      const relative = url.pathname.slice(base.length)
      const path = relative.replace(/^\/api(?=\/|$)/, '')
      if (path === '/higgsfield/upload' && request.method === 'POST')
        return uploadImage(request, env)
      if (path === '/object_info') return json(nodeDefinitions())
      if (path === '/features') return json({})
      if (path === '/users') return json({ storage: 'server', migrated: true })
      if (path === '/higgsfield/capabilities')
        return json({
          configured: Boolean(await env.HF_CREDENTIALS.get()),
          models: Object.entries(models).map(([node, model]) => ({
            node,
            name: model.title,
            endpoint: model.endpoint,
            source: model.source
          })),
          max_nodes: 8,
          max_concurrent_workflows: 1
        })
      if (path.startsWith('/userdata')) return userData(request, env, path, url)
      if (path === '/settings' || path.startsWith('/settings/')) {
        const key = path.slice('/settings/'.length)
        if (request.method === 'POST') {
          const value = await boundedJson(request)
          const entries =
            path === '/settings'
              ? Object.entries(z.record(z.unknown()).parse(value))
              : [[key, value] as const]
          await Promise.all(
            entries.map(([id, setting]) =>
              env.COMFY_STATE.put(`setting:${id}`, JSON.stringify(setting))
            )
          )
          return json({})
        }
        if (path !== '/settings')
          return json(await env.COMFY_STATE.get(`setting:${key}`, 'json'))
        const list = await env.COMFY_STATE.list({ prefix: 'setting:' })
        const values = await Promise.all(
          list.keys.map(async (item) => [
            item.name.slice(8),
            await env.COMFY_STATE.get(item.name, 'json')
          ])
        )
        return json({
          'Comfy.TutorialCompleted': true,
          'Comfy.Workflow.ShowMissingModelsWarning': false,
          ...Object.fromEntries(values)
        })
      }
      if (
        [
          '/extensions',
          '/embeddings',
          '/models',
          '/experiment/models',
          '/workflow_templates',
          '/global_subgraphs',
          '/subgraphs'
        ].includes(path)
      )
        return json([])
      if (path === '/i18n') return json({})
      if (path === '/system_stats')
        return json({
          system: {
            os: 'Cloudflare',
            ram_total: 0,
            ram_free: 0,
            comfyui_version: '0.0.0-higgsfield',
            python_version: 'Not used — Higgsfield API',
            pytorch_version: 'Not used',
            embedded_python: false,
            argv: [],
            required_frontend_version: '1.56.0'
          },
          devices: []
        })
      if (
        [
          '/ws',
          '/prompt',
          '/queue',
          '/history',
          '/jobs',
          '/interrupt',
          '/view',
          '/higgsfield/estimate'
        ].includes(path) ||
        path.startsWith('/jobs/')
      ) {
        const internal = new URL(request.url)
        internal.pathname = path
        return env.COMFY_JOBS.getByName('owner').fetch(
          new Request(internal, request)
        )
      }
      if (
        relative.startsWith('/api/') ||
        ['/upload/image', '/free'].includes(path)
      )
        return json(
          {
            error:
              'This ComfyUI feature is not supported by the Higgsfield adapter.'
          },
          501
        )
      if (!['GET', 'HEAD'].includes(request.method))
        return json({ error: 'Method not allowed' }, 405)
      const assetUrl = new URL(env.PAGES_ORIGIN)
      assetUrl.pathname = relative === '/' ? '/index.html' : relative
      const upstream = await fetch(assetUrl, {
        method: request.method,
        headers: { accept: request.headers.get('accept') ?? '*/*' }
      })
      const response = new Response(upstream.body, upstream)
      response.headers.set('x-content-type-options', 'nosniff')
      response.headers.set('referrer-policy', 'strict-origin-when-cross-origin')
      return response
    } catch {
      return json({ error: 'Request failed. Check the input and retry.' }, 400)
    }
  }
} satisfies ExportedHandler<Env>
