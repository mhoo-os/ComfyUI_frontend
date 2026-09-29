import { describe, expect, it, vi } from 'vitest'

import { api } from '@/scripts/api'

import { LGraph, LGraphNode } from '@/lib/litegraph/src/litegraph'
import { app } from '@/scripts/app'
import { graphToPrompt } from '@/utils/executionUtil'

vi.mock(import('@/scripts/app'))
vi.mock(import('@/scripts/api'))
vi.mock(import('@/i18n'), () => ({ t: (key: string) => key }))

import './higgsfield'

const extension = vi.mocked(app.registerExtension).mock.calls[0][0]

class ReferenceNode extends LGraphNode {
  static comfyClass = 'HiggsfieldCampaign'
}

class ProductionNode extends LGraphNode {
  static comfyClass = 'MhooFinishCut'
}

const buttons = (node: LGraphNode) =>
  node.widgets
    ?.filter((widget) => widget.type === 'button')
    .map((widget) => widget.name)

describe('Higgsfield native node controls', () => {
  it('adds reference library, upload and estimate controls before registration sets the node type, without serializing buttons into provider inputs', async () => {
    const node = new ReferenceNode('Reference')
    node.addWidget(
      'text',
      'image_url',
      'https://example.com/reference.png',
      () => {}
    )
    extension.nodeCreated?.(node, app)
    expect(
      node.widgets
        ?.filter((widget) => widget.type === 'button')
        .map((widget) => widget.name)
    ).toEqual([
      'referenceLibrary.title',
      'higgsfield.upload',
      'higgsfield.estimate'
    ])
    node.comfyClass = 'HiggsfieldCampaign'
    const graph = new LGraph()
    graph.add(node)
    const { output } = await graphToPrompt(graph)
    expect(output[String(node.id)].inputs).toEqual({
      image_url: 'https://example.com/reference.png'
    })
  })

  it('offers the reference library only for provider image inputs', () => {
    const node = new ReferenceNode('Reference')
    for (const name of [
      'image_url',
      'end_image_url',
      'reference_image_url',
      'video_url'
    ])
      node.addWidget('text', name, '', () => {})
    extension.nodeCreated?.(node, app)
    expect(buttons(node)).toEqual([
      'referenceLibrary.title',
      'higgsfield.upload',
      'referenceLibrary.title',
      'higgsfield.upload',
      'referenceLibrary.title',
      'higgsfield.upload',
      'higgsfield.upload',
      'higgsfield.estimate'
    ])
  })

  it.for([
    [ReferenceNode, 'video_url', 'video/mp4'],
    [ReferenceNode, 'audio_urls', 'audio/wav,audio/x-wav'],
    [ProductionNode, 'video_url', 'video/mp4,video/webm']
  ] as const)(
    'offers the media types each backend accepts (%o %s → %s)',
    ([Node, field, accept]) => {
      const node = new Node('Video')
      node.addWidget('text', field, '', () => {})
      extension.nodeCreated?.(node, app)
      const picker = document.createElement('input')
      vi.spyOn(picker, 'click').mockImplementation(() => {})
      const create = document.createElement.bind(document)
      vi.spyOn(document, 'createElement').mockImplementation((tag: string) =>
        tag === 'input' ? picker : create(tag)
      )
      const upload = node.widgets?.find(
        (widget) => widget.name === 'higgsfield.upload'
      )
      upload?.callback?.(upload.value, app.canvas, node, [0, 0])
      expect(picker.type).toBe('file')
      expect(picker.accept).toBe(accept)
    }
  )

  it('gives production nodes upload controls without the reference library or estimate', () => {
    const node = new ProductionNode('Production')
    node.addWidget('text', 'image_url', '', () => {})
    extension.nodeCreated?.(node, app)
    expect(buttons(node)).toEqual(['higgsfield.upload'])
  })

  it('leaves a non-provider node without a comfyClass untouched', () => {
    const node = new LGraphNode('Ordinary')
    extension.nodeCreated?.(node, app)
    expect(node.widgets ?? []).toHaveLength(0)
  })
})

it('uploads WAV audio and appends its URL without losing existing references', async () => {
  const node = new ReferenceNode('Audio reference')
  const changed = vi.fn()
  const widget = node.addWidget(
    'text',
    'audio_urls',
    'https://example.com/first.wav',
    changed
  )
  extension.nodeCreated?.(node, app)
  const picker = document.createElement('input')
  vi.spyOn(picker, 'click').mockImplementation(() => {})
  const create = document.createElement.bind(document)
  vi.spyOn(document, 'createElement').mockImplementation((tag: string) =>
    tag === 'input' ? picker : create(tag)
  )
  const file = new File(['RIFFexample'], 'reference.wav', { type: 'audio/wav' })
  const transfer = new DataTransfer()
  transfer.items.add(file)
  vi.spyOn(picker, 'files', 'get').mockReturnValue(transfer.files)
  vi.mocked(api.fetchApi).mockResolvedValue(
    Response.json({ url: 'https://cdn.example.com/new.wav' })
  )
  const upload = node.widgets?.find((item) => item.name === 'higgsfield.upload')
  upload?.callback?.(upload.value, app.canvas, node, [0, 0])
  await picker.onchange?.call(picker, new Event('change'))
  expect(api.fetchApi).toHaveBeenCalledWith('/higgsfield/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'audio/wav' },
    body: file
  })
  const expected =
    'https://example.com/first.wav\nhttps://cdn.example.com/new.wav'
  expect(widget.value).toBe(expected)
  expect(changed).toHaveBeenCalledWith(expected)
})
