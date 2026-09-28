import { z } from 'zod'

/** Attempt states and the SQL that decides which attempts count toward spend,
 * slots and caps. Shared by the attempt routes and the film overview. */

export const statuses = [
  'quoted',
  'approved',
  'submitting',
  'rendering',
  'rendered',
  'reviewed',
  'accepted',
  'rejected',
  'failed',
  'cancelled'
] as const
export type AttemptStatus = (typeof statuses)[number]

/** A submission refused before any job existed spent nothing and uses no slot. */
// `IS 0`, not `= 0`: an unknown spend (NULL) must still count.
const refused = (a: string) =>
  `(${a}status = 'failed' AND ${a}job_id IS NULL AND ${a}spend_usd IS 0)`
/** Attempts that may have spent money. `a` is an optional table alias with its dot. */
export const committed = (a = '') =>
  `${a}status NOT IN ('quoted', 'cancelled') AND NOT ${refused(a)}`
/** Attempts that use one of the shot's slots. */
export const COUNTED = `status != 'cancelled' AND NOT ${refused('')}`
export const OPEN = `status IN ('quoted', 'approved', 'submitting', 'rendering')`

/** Spend so far: recorded spend, or the quote while spend is unknown. */
export async function spendSummary(db: D1Database, filmId: string) {
  const row = z
    .object({ total: z.number().nullable(), receipts: z.number() })
    .parse(
      await db
        .prepare(
          `SELECT SUM(COALESCE(spend_usd, quote_usd, 0)) AS total, COUNT(*) AS receipts
           FROM attempts WHERE film_id = ? AND ${committed()}`
        )
        .bind(filmId)
        .first()
    )
  return {
    total: Number((row.total ?? 0).toFixed(2)),
    currency: 'USD',
    receipts: row.receipts
  }
}

/** Render state per shot for the film overview, keyed `<scene>/<shot>`:
 * `approved` once a take is accepted, else the latest attempt's stage. */
export async function shotStates(db: D1Database, filmId: string) {
  const { results } = await db
    .prepare(
      `SELECT scene_id, shot_id, status FROM attempts WHERE film_id = ? AND status != 'cancelled'
       ORDER BY created_at, number`
    )
    .bind(filmId)
    .all()
  const states = new Map<
    string,
    'approved' | 'review' | 'rendering' | 'quoted' | 'failed'
  >()
  const stage = {
    quoted: 'quoted',
    approved: 'rendering',
    submitting: 'rendering',
    rendering: 'rendering',
    rendered: 'review',
    reviewed: 'review',
    rejected: 'failed',
    failed: 'failed'
  } as const
  for (const item of results) {
    const row = z
      .object({
        scene_id: z.string(),
        shot_id: z.string(),
        status: z.enum(statuses)
      })
      .parse(item)
    const key = `${row.scene_id}/${row.shot_id}`
    if (states.get(key) === 'approved') continue
    states.set(
      key,
      row.status === 'accepted'
        ? 'approved'
        : stage[row.status === 'cancelled' ? 'failed' : row.status]
    )
  }
  return states
}
