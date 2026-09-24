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
export default {
  fetch(request: Request, env: Env) {
    const url = new URL(request.url)
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
