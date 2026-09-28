import { z } from 'zod'

/** Reading the job ledger's (ComfyJobs) responses. No runtime imports, so tests can use it. */

const queueFull = z
  .object({ error: z.object({ type: z.literal('queue_full') }).passthrough() })
  .passthrough()
const jobSchema = z
  .object({
    status: z.enum([
      'pending',
      'in_progress',
      'completed',
      'failed',
      'cancelled'
    ]),
    outputs: z.record(
      z.object({
        video: z.array(z.object({ filename: z.string() })).default([]),
        images: z.array(z.object({ filename: z.string() })).default([])
      })
    ),
    execution_error: z.object({ exception_message: z.string() }).optional()
  })
  .passthrough()

/** A job's status and the first output of `node`, as `<job>/<node>/<i>`. */
export function jobState(body: unknown, node: string) {
  const job = jobSchema.parse(body)
  const outputs = Object.hasOwn(job.outputs, node)
    ? job.outputs[node]
    : undefined
  const file = outputs?.video[0]?.filename ?? outputs?.images[0]?.filename
  return {
    status: job.status,
    output: file ? file.replace(/\.(mp4|png)$/u, '') : null,
    error: job.execution_error?.exception_message ?? null
  }
}

/** Only the ledger's explicit queue_full is known to have created no job. */
export const isQueueFull = (status: number, body: unknown) =>
  status === 409 && queueFull.safeParse(body).success
