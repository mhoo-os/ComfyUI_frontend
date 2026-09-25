/** Small request/response helpers shared by the Worker routes. No runtime imports. */
export function json(value: unknown, status = 200) {
  return Response.json(value, {
    status,
    headers: { 'cache-control': 'no-store' }
  })
}
export async function boundedJson(
  request: Request,
  limit = 128 * 1024
): Promise<unknown> {
  const reader = request.body?.getReader()
  if (!reader) throw new Error('Request body required.')
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.length
    if (size > limit) {
      await reader.cancel()
      throw new Error('Request is too large.')
    }
    chunks.push(value)
  }
  if (size === 0) return {}
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.length
  }
  return JSON.parse(new TextDecoder().decode(bytes))
}
