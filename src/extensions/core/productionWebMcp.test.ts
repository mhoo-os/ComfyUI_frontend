import { describe, expect, it, vi } from 'vitest'

import { LGraph, LGraphNode } from '@/lib/litegraph/src/litegraph'
import { zComfyWorkflow } from '@/platform/workflow/validation/schemas/workflowSchema'
import { api } from '@/scripts/api'
import { app } from '@/scripts/app'

vi.mock(import('@/scripts/app'))

import { productionTools } from './productionWebMcp'

function fixture() {
  vi.spyOn(api, 'queuePrompt').mockRejectedValue(
    new Error('Unexpected submission')
  )
  const graph = new LGraph()
  const node = new LGraphNode('Compose')
  node.type = 'MhooCompose'
  node.serialize_widgets = true
  const callback = vi.fn()
  node.addWidget('number', 'duration', 5, callback, { min: 1, max: 30 })
  graph.add(node)
  Object.defineProperty(app, 'rootGraph', { configurable: true, value: graph })
  const tools = productionTools()
  async function call(name: string, input: unknown = {}) {
    const tool = tools.find((entry) => entry.name === name)
    if (!tool) throw new Error('Missing tool')
    return tool.execute(input)
  }
  async function revision() {
    const result = await call('getCanvasState')
    const parsed: unknown = JSON.parse(result.content[0].text)
    if (!parsed || typeof parsed !== 'object' || !('revision' in parsed))
      throw new Error('Missing revision')
    return parsed.revision
  }
  return { graph, node, callback, call, revision }
}

describe('production browser tools', () => {
  it('updates a valid widget with callbacks and rejects a stale revision', async () => {
    const f = fixture()
    const revision = await f.revision()
    const input = { revision, nodeId: f.node.id, field: 'duration', value: 8 }
    expect(await f.call('updateNodeParameter', input)).not.toHaveProperty(
      'isError'
    )
    expect(f.node.widgets?.[0].value).toBe(8)
    expect(f.callback).toHaveBeenCalledWith(8)
    expect(
      await f.call('updateNodeParameter', { ...input, value: 9 })
    ).toHaveProperty('isError', true)
    expect(f.node.widgets?.[0].value).toBe(8)
  })

  it.for([0, 31, '8', { camera_roll_360: true }])(
    'rejects invalid widget input %j without mutation',
    async (value) => {
      const f = fixture()
      expect(
        await f.call('updateNodeParameter', {
          revision: await f.revision(),
          nodeId: f.node.id,
          field: 'duration',
          value
        })
      ).toHaveProperty('isError', true)
      expect(f.node.widgets?.[0].value).toBe(5)
      expect(f.callback).not.toHaveBeenCalled()
    }
  )

  it('rejects paid generation through browser tools', async () => {
    const f = fixture()
    vi.mocked(app.graphToPrompt).mockResolvedValue({
      workflow: zComfyWorkflow.parse(f.graph.serialize()),
      output: { '1': { class_type: 'HiggsfieldVideo', inputs: {} } }
    })
    expect(
      await f.call('queueCanvasWorkflow', { revision: await f.revision() })
    ).toHaveProperty('isError', true)
    expect(api.queuePrompt).not.toHaveBeenCalled()
  })

  it('does not submit a graph changed while compiling', async () => {
    const f = fixture()
    vi.mocked(app.graphToPrompt).mockImplementation(async () => {
      f.node.title = 'Changed'
      return { workflow: zComfyWorkflow.parse(f.graph.serialize()), output: {} }
    })
    expect(
      await f.call('queueCanvasWorkflow', { revision: await f.revision() })
    ).toHaveProperty('isError', true)
    expect(api.queuePrompt).not.toHaveBeenCalled()
  })
})
