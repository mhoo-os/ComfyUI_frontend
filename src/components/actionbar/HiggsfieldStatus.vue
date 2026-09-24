<template>
  <p role="status" class="px-3 py-1 text-center text-xs text-muted-foreground">
    {{ label }}
  </p>
</template>

<script setup lang="ts">
import { useIntervalFn } from '@vueuse/core'
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { z } from 'zod'

import { api } from '@/scripts/api'

const { t } = useI18n()
const label = ref(t('higgsfield.ready'))
const jobsSchema = z.object({
  jobs: z.array(
    z.object({
      status: z.string(),
      provider_status: z.string().optional(),
      current_step: z.number(),
      total_steps: z.number()
    })
  )
})
let refreshing = false
useIntervalFn(
  async () => {
    if (refreshing) return
    refreshing = true
    try {
      const response = await api.fetchApi(
        '/jobs?status=pending,in_progress&limit=1'
      )
      if (!response.ok) {
        label.value = t('higgsfield.statusUnavailable')
        return
      }
      const job = jobsSchema.parse(await response.json()).jobs[0]
      label.value = job
        ? t('higgsfield.running', {
            status: job.provider_status ?? job.status,
            step: job.current_step,
            total: job.total_steps
          })
        : t('higgsfield.ready')
    } catch {
      label.value = t('higgsfield.statusUnavailable')
    } finally {
      refreshing = false
    }
  },
  5000,
  { immediateCallback: true }
)
</script>
