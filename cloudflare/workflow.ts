import { WorkflowEntrypoint } from 'cloudflare:workers'
import type { WorkflowEvent, WorkflowStep } from 'cloudflare:workers'
import { routeShot, expandShot } from './planner'

export class ComfyProduction extends WorkflowEntrypoint<
  Env,
  { jobId: string; owner: string }
> {
  async run(
    event: WorkflowEvent<{ jobId: string; owner: string }>,
    step: WorkflowStep
  ) {
    const jobs = this.env.COMFY_JOBS.getByName(event.payload.owner)
    try {
      const plans = await step.do('load-shot-inputs', async () => {
        const items = await jobs.workflowPlans(event.payload.jobId)
        return items.map((item) => ({
          nodeId: item.nodeId,
          shot: { ...item.shot }
        }))
      })
      for (const item of plans) {
        const noRetry = {
          retries: { limit: 0, delay: '1 second' as const },
          timeout: '2 minutes' as const
        }
        await step.do(`route-${item.nodeId}`, noRetry, () =>
          routeShot(this.env, item.shot)
        )
        const creative = await step.do(`draft-${item.nodeId}`, noRetry, () =>
          expandShot(this.env, item.shot)
        )
        await step.do(`save-plan-${item.nodeId}`, () =>
          jobs.applyWorkflowScene(
            event.payload.jobId,
            item.nodeId,
            creative.scene
          )
        )
      }
      for (let tick = 0; tick < 1000; tick++) {
        const result = await step.do(
          `advance-${tick}`,
          {
            retries: { limit: 2, delay: '5 seconds', backoff: 'exponential' },
            timeout: '10 minutes'
          },
          async () => {
            const state = await jobs.workflowTick(event.payload.jobId)
            return {
              done: state.done,
              status: state.status,
              delay: state.delay
            }
          }
        )
        if (result.done)
          return { jobId: event.payload.jobId, status: result.status }
        await step.sleep(`wait-${tick}`, result.delay)
      }
      await step.do('exhausted', () =>
        jobs.workflowFailed(
          event.payload.jobId,
          'Workflow step limit reached. Check provider history before rerunning.'
        )
      )
    } catch {
      await step.do('record-failure', () =>
        jobs.workflowFailed(
          event.payload.jobId,
          'Durable workflow stopped. Check provider history before rerunning; submissions are never automatically repeated.'
        )
      )
      throw new Error(
        'Production workflow failed; details are recorded in the job history.'
      )
    }
    return { jobId: event.payload.jobId, status: 'failed' }
  }
}
