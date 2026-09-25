import type { ComfyWorkflowJSON } from '@/platform/workflow/validation/schemas/workflowSchema'

export const higgsfieldDefaultGraph: ComfyWorkflowJSON = {
  last_node_id: 1,
  last_link_id: 0,
  nodes: [
    {
      id: 1,
      type: 'HiggsfieldSoul',
      pos: [220, 180],
      size: [420, 420],
      flags: {},
      order: 0,
      mode: 0,
      outputs: [
        { name: 'image_url', type: 'STRING', links: null, slot_index: 0 }
      ],
      properties: { 'Node name for S&R': 'HiggsfieldSoul' },
      widgets_values: [
        'A quiet alpine lake at sunrise, editorial photography, soft natural light',
        '1:1',
        '720p',
        false,
        '3db34ab5-3439-4317-9e03-08dc30852e69',
        1,
        1,
        'fixed',
        1
      ]
    }
  ],
  links: [],
  groups: [],
  config: {},
  extra: { ds: { scale: 1, offset: [0, 0] } },
  version: 0.4
}
