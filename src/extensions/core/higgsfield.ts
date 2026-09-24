import { z } from 'zod'

import { t } from '@/i18n'
import { useToastStore } from '@/platform/updates/common/toastStore'
import { api } from '@/scripts/api'
import { app } from '@/scripts/app'

const uploadResult = z.object({ url: z.string().url() })
const estimateResult = z.union([
  z.object({
    type: z.literal('estimate'),
    usd: z.string(),
    credits: z.string()
  }),
  z.object({ type: z.literal('description'), pricing_description: z.string() })
])

app.registerExtension({
  name: 'Mhoo.Higgsfield',
  setup() {
    api.addEventListener('notification', (event) => {
      useToastStore().addAlert(event.detail.value)
    })
  },
  nodeCreated(node) {
    if (!node.type.startsWith('Higgsfield')) return
    for (const widget of node.widgets ?? []) {
      if (!['image_url', 'end_image_url'].includes(widget.name)) continue
      node.addWidget(
        'button',
        t('higgsfield.upload', { input: widget.name }),
        '',
        () => {
          const input = document.createElement('input')
          input.type = 'file'
          input.accept = 'image/jpeg,image/png,image/webp,image/gif'
          input.onchange = async () => {
            const file = input.files?.[0]
            if (!file) return
            try {
              if (file.size > 20 * 1024 * 1024) {
                useToastStore().addAlert(t('higgsfield.tooLarge'))
                return
              }
              const response = await api.fetchApi('/higgsfield/upload', {
                method: 'POST',
                headers: { 'Content-Type': file.type },
                body: file
              })
              if (!response.ok) {
                useToastStore().addAlert(t('higgsfield.uploadFailed'))
                return
              }
              const result = uploadResult.parse(await response.json())
              widget.value = result.url
              widget.callback?.(result.url)
              node.setDirtyCanvas(true, true)
              useToastStore().add({
                severity: 'success',
                summary: t('higgsfield.uploaded'),
                life: 4000
              })
            } catch (error) {
              useToastStore().addAlert(
                error instanceof Error
                  ? error.message
                  : t('higgsfield.uploadFailed')
              )
            }
          }
          input.click()
        },
        { serialize: false }
      )
    }
    node.addWidget(
      'button',
      t('higgsfield.estimate'),
      '',
      async () => {
        try {
          const { output } = await app.graphToPrompt()
          const prompt = output[String(node.id)]
          const response = await api.fetchApi('/higgsfield/estimate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt: { [node.id]: prompt } })
          })
          if (!response.ok) {
            useToastStore().addAlert(t('higgsfield.estimateLinked'))
            return
          }
          const estimate = estimateResult.parse(await response.json())
          useToastStore().add({
            severity: 'info',
            summary: t('higgsfield.estimate'),
            detail:
              estimate.type === 'estimate'
                ? t('higgsfield.estimatedPrice', {
                    usd: estimate.usd,
                    credits: estimate.credits
                  })
                : estimate.pricing_description,
            life: 15000
          })
        } catch (error) {
          useToastStore().addAlert(
            error instanceof Error
              ? error.message
              : t('higgsfield.estimateFailed')
          )
        }
      },
      { serialize: false }
    )
  }
})
