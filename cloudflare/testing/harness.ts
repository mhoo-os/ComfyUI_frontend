import { DurableObject } from 'cloudflare:workers'
import { uploadProductionMedia } from '../rendering'
import { ComfyJobs } from '../jobs'
import { uploadImage } from '../media'
import { userData } from '../userData'

export class TestJobs extends ComfyJobs {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, { ...env, HF_CREDENTIALS: { get: async () => 'test-only' } })
  }
  override async fetch(request: Request) {
    if (new URL(request.url).pathname === '/test/tick') {
      await this.ctx.storage.deleteAlarm()
      await this.alarm()
      await this.ctx.storage.deleteAlarm()
      return Response.json({})
    }
    const response = await super.fetch(request)
    await this.ctx.storage.deleteAlarm()
    return response
  }
}
export class TestRenderer extends DurableObject<Env> {
  fetch(request: Request) {
    return fetch(new Request('https://renderer.example.com/render', request))
  }
}
export default {
  fetch(request: Request, env: Env) {
    const url = new URL(request.url)
    if (url.pathname === '/test/short-upload') {
      const headers = new Headers(request.headers)
      headers.set('content-length', '1')
      return uploadProductionMedia(
        new Request(request, { headers }),
        env
      ).catch(() => Response.json({ error: 'Invalid length' }, { status: 400 }))
    }
    if (url.pathname === '/production/upload')
      return uploadProductionMedia(request, env)
    if (url.pathname === '/higgsfield/upload')
      return uploadImage(request, {
        ...env,
        HF_CREDENTIALS: { get: async () => 'test-only' }
      })
    if (url.pathname.startsWith('/userdata'))
      return userData(request, env, url.pathname, url)
    return env.COMFY_JOBS.getByName('test').fetch(request)
  }
}
