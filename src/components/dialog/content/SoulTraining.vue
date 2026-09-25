<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { z } from 'zod'
import { api } from '@/scripts/api'
import { approvedReference } from '../../../../cloudflare/referenceContract'
import type { ReferenceAsset } from '../../../../cloudflare/referenceContract'
const { assets } = defineProps<{ assets: ReferenceAsset[] }>()
const { t } = useI18n()
const schema = z.object({
  attemptId: z.string().uuid(),
  name: z.string(),
  status: z.string(),
  referenceId: z.string().uuid().optional()
})
const attempts = ref<z.infer<typeof schema>[]>([])
const busy = ref(false)
const loaded = ref(false)
const error = ref('')
const name = ref('Moo adult 2019 v1')
const blocked = computed(() =>
  attempts.value.some(
    (attempt) =>
      attempt.status !== 'completed' || attempt.name === name.value.trim()
  )
)
async function refresh() {
  busy.value = true
  try {
    const response = await api.fetchApi('/character-assets/training')
    if (!response.ok) {
      error.value = t('soulTraining.failed')
      return
    }
    const rows = z.array(schema).parse(await response.json())
    attempts.value = rows
    loaded.value = true
    for (const row of rows) {
      if (!row.referenceId || ['completed', 'failed'].includes(row.status))
        continue
      const status = await api.fetchApi(
        `/character-assets/training/${row.attemptId}`
      )
      if (status.ok) {
        const updated = schema.parse(await status.json())
        attempts.value = attempts.value.map((a) =>
          a.attemptId === row.attemptId ? updated : a
        )
      }
    }
  } catch {
    error.value = t('soulTraining.failed')
  } finally {
    busy.value = false
  }
}
async function train() {
  if (
    busy.value ||
    !loaded.value ||
    blocked.value ||
    !assets.length ||
    !assets.every(approvedReference)
  )
    return
  busy.value = true
  error.value = ''
  const attemptId = crypto.randomUUID()
  attempts.value = [
    ...attempts.value,
    { attemptId, name: name.value.trim(), status: 'submitting' }
  ]
  try {
    const response = await api.fetchApi('/character-assets/training', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        attemptId,
        name: name.value.trim(),
        references: assets.map((a) => `mhoo-asset:${a.id}:${a.revision}`)
      })
    })
    const body: unknown = await response.json()
    const parsed = schema.safeParse(body)
    if (parsed.success)
      attempts.value = attempts.value.map((attempt) =>
        attempt.attemptId === attemptId ? parsed.data : attempt
      )
    if (!response.ok) error.value = t('soulTraining.failed')
  } catch {
    error.value = t('soulTraining.failed')
  } finally {
    busy.value = false
  }
}
onMounted(() => {
  void refresh()
})
</script>
<template>
  <section class="flex flex-col gap-2 rounded-lg border p-4">
    <h3 class="m-0 font-semibold">{{ t('soulTraining.title') }}</h3>
    <p>{{ t('soulTraining.explanation') }}</p>
    <label
      >{{ t('soulTraining.name')
      }}<input v-model="name" maxlength="100" class="rounded-sm border p-2"
    /></label>
    <div class="flex gap-2">
      <button
        type="button"
        class="rounded-sm border px-3 py-2"
        :disabled="
          busy ||
          !loaded ||
          blocked ||
          !assets.length ||
          !assets.every(approvedReference)
        "
        @click="train"
      >
        {{ t('soulTraining.train', { count: assets.length }) }}
      </button>
      <button
        type="button"
        class="rounded-sm border px-3 py-2"
        :disabled="busy"
        @click="refresh"
      >
        {{ t('soulTraining.refresh') }}
      </button>
    </div>
    <p v-if="error" role="alert">{{ error }}</p>
    <p v-for="attempt in attempts" :key="attempt.attemptId">
      {{ attempt.name }} · {{ attempt.status }}<br />{{ attempt.referenceId }}
    </p>
  </section>
</template>
