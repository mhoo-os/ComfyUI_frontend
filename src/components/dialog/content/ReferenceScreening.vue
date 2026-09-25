<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { ReferenceAsset } from '../../../../cloudflare/referenceContract'
import { api } from '@/scripts/api'
import { detectReferenceFaces } from './referenceFaces'
import { laplacianVariance, screeningVerdict } from './referenceScreening'
import type { ScreeningVerdict } from './referenceScreening'

const { assets } = defineProps<{ assets: ReferenceAsset[] }>()
const emit = defineEmits<{ crop: [asset: ReferenceAsset] }>()
const { t } = useI18n()
type Result = {
  asset: ReferenceAsset
  verdict: ScreeningVerdict | 'failed'
  facePixels: number
}
const state = ref<{
  phase: 'idle' | 'running' | 'done'
  results: Result[]
  total: number
}>({ phase: 'idle', results: [], total: 0 })
let disposed = false
onUnmounted(() => {
  disposed = true
})
const candidates = computed(() =>
  state.value.results.filter((r) => r.verdict === 'candidate')
)
const exceptions = computed(() =>
  state.value.results.filter((r) => r.verdict !== 'candidate')
)
async function screen() {
  if (state.value.phase === 'running') return
  const batch = [...assets]
  state.value = { phase: 'running', results: [], total: batch.length }
  for (const asset of batch) {
    if (disposed) return
    let result: Result = { asset, verdict: 'failed', facePixels: 0 }
    try {
      const image = new Image()
      image.src = api.apiURL(`/character-assets/${asset.id}/preview`)
      await image.decode()
      if (disposed) return
      const faces = await detectReferenceFaces(image)
      let sharpness = 0
      if (faces.length === 1) {
        const face = faces[0]
        const canvas = document.createElement('canvas')
        canvas.width = 128
        canvas.height = 128
        const context = canvas.getContext('2d', { willReadFrequently: true })
        if (!context) {
          state.value.results.push(result)
          continue
        }
        context.drawImage(
          image,
          face.x,
          face.y,
          face.width,
          face.height,
          0,
          0,
          128,
          128
        )
        sharpness = laplacianVariance(
          context.getImageData(0, 0, 128, 128).data,
          128,
          128
        )
      }
      result = {
        asset,
        verdict: screeningVerdict(faces, sharpness),
        facePixels:
          faces.length === 1
            ? Math.round(Math.min(faces[0].width, faces[0].height))
            : 0
      }
    } catch {
      // A failed measurement stays an exception; never treat it as a pass.
    }
    if (disposed) return
    state.value.results.push(result)
    await new Promise<void>((resolve) => setTimeout(resolve, 0))
  }
  state.value.phase = 'done'
}
onMounted(() => {
  void screen()
})
</script>
<template>
  <section class="flex flex-col gap-2 rounded-lg border p-4">
    <h3 class="m-0 font-semibold">{{ t('referenceScreening.title') }}</h3>
    <p class="m-0">{{ t('referenceScreening.explanation') }}</p>
    <p role="status">
      {{
        t('referenceScreening.progress', {
          done: state.results.length,
          total: state.total,
          candidates: candidates.length,
          exceptions: exceptions.length
        })
      }}
    </p>
    <button
      type="button"
      class="self-start rounded-sm border px-3 py-2"
      :disabled="state.phase === 'running'"
      @click="screen"
    >
      {{ t('referenceScreening.rescan') }}
    </button>
    <details v-if="candidates.length">
      <summary>
        {{ t('referenceScreening.candidates', { count: candidates.length }) }}
      </summary>
      <p v-for="result in candidates" :key="result.asset.id">
        {{ result.asset.name }} · {{ result.facePixels }} px
      </p>
    </details>
    <details v-if="exceptions.length">
      <summary>
        {{ t('referenceScreening.exceptions', { count: exceptions.length }) }}
      </summary>
      <div
        v-for="result in exceptions"
        :key="result.asset.id"
        class="flex flex-wrap items-center gap-2 py-1"
      >
        <span
          >{{ result.asset.name }} —
          {{ t(`referenceScreening.${result.verdict}`) }}</span
        >
        <button
          v-if="result.verdict === 'group'"
          type="button"
          class="rounded-sm border px-2 py-1"
          :disabled="state.phase === 'running'"
          @click="emit('crop', result.asset)"
        >
          {{ t('referenceCrop.open') }}
        </button>
      </div>
    </details>
  </section>
</template>
