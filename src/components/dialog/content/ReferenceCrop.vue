<script setup lang="ts">
import { computed, ref, useTemplateRef, watchEffect } from 'vue'
import { useI18n } from 'vue-i18n'

import {
  referenceAsset,
  referenceCrop
} from '../../../../cloudflare/referenceContract'
import type { ReferenceAsset } from '../../../../cloudflare/referenceContract'
import VideoCropOverlay from '@/components/videoEdit/VideoCropOverlay.vue'
import type { Bounds } from '@/renderer/core/layout/types'
import { api } from '@/scripts/api'

const { asset } = defineProps<{ asset: ReferenceAsset }>()
const emit = defineEmits<{ saved: [asset: ReferenceAsset]; cancel: [] }>()
const { t } = useI18n()
const source = useTemplateRef<HTMLImageElement>('source')
const preview = useTemplateRef<HTMLCanvasElement>('preview')
const dimensions = ref({ width: 0, height: 0 })
const bounds = ref<Bounds>({ x: 0, y: 0, width: 16, height: 16 })
const phase = ref<'loading' | 'editing' | 'saving' | 'failed'>('loading')
const error = ref('')
const fields = ['x', 'y', 'width', 'height'] as const
const crop = computed(() =>
  referenceCrop.safeParse({
    parentId: asset.id,
    parentRevision: asset.revision,
    parentEtag: asset.etag,
    sourceWidth: dimensions.value.width,
    sourceHeight: dimensions.value.height,
    ...bounds.value,
    method: 'browser-canvas-crop-v1'
  })
)
function loaded() {
  const image = source.value
  if (!image) return
  dimensions.value = { width: image.naturalWidth, height: image.naturalHeight }
  bounds.value = { x: 0, y: 0, ...dimensions.value }
  phase.value = crop.value.success ? 'editing' : 'failed'
  if (phase.value === 'failed') error.value = t('referenceCrop.unsupported')
}
function failed() {
  phase.value = 'failed'
  error.value = t('referenceCrop.loadFailed')
}
watchEffect(() => {
  const canvas = preview.value
  const image = source.value
  if (!canvas || !image || !crop.value.success || phase.value === 'loading')
    return
  const { x, y, width, height } = crop.value.data
  const scale = Math.min(1, 600 / Math.max(width, height))
  canvas.width = Math.max(1, Math.round(width * scale))
  canvas.height = Math.max(1, Math.round(height * scale))
  canvas
    .getContext('2d')
    ?.drawImage(image, x, y, width, height, 0, 0, canvas.width, canvas.height)
})
function reset() {
  bounds.value = { x: 0, y: 0, ...dimensions.value }
}
async function save() {
  const selected = crop.value
  const image = source.value
  if (phase.value !== 'editing' || !selected.success || !image) return
  phase.value = 'saving'
  error.value = ''
  try {
    const canvas = document.createElement('canvas')
    canvas.width = selected.data.width
    canvas.height = selected.data.height
    const context = canvas.getContext('2d')
    if (!context) {
      error.value = t('referenceCrop.failed')
      return
    }
    context.drawImage(
      image,
      selected.data.x,
      selected.data.y,
      canvas.width,
      canvas.height,
      0,
      0,
      canvas.width,
      canvas.height
    )
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/png')
    )
    if (!blob || blob.size > 20 * 1024 * 1024) {
      error.value = t('referenceCrop.tooLarge')
      return
    }
    const response = await api.fetchApi('/character-assets', {
      method: 'POST',
      headers: {
        'Content-Type': 'image/png',
        'X-File-Name': encodeURIComponent(
          asset.name.replace(/\.[^.]+$/, '') + '-crop.png'
        ),
        'X-Reference-Crop': JSON.stringify(selected.data)
      },
      body: blob
    })
    if (!response.ok) {
      error.value = t('referenceCrop.saveFailed')
      return
    }
    emit('saved', referenceAsset.parse(await response.json()))
  } catch {
    error.value = t('referenceCrop.failed')
  } finally {
    phase.value = 'editing'
  }
}
</script>

<template>
  <section class="flex flex-col gap-4 rounded-lg border p-4">
    <h3 class="m-0 font-semibold">
      {{ t('referenceCrop.title', { name: asset.name }) }}
    </h3>
    <p class="m-0">{{ t('referenceCrop.help') }}</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <div class="grid items-start gap-4 sm:grid-cols-2">
      <div>
        <h4>{{ t('referenceCrop.original') }}</h4>
        <div class="relative overflow-hidden">
          <img
            ref="source"
            :src="api.apiURL(`/character-assets/${asset.id}/preview`)"
            :alt="asset.name"
            class="block h-auto w-full"
            draggable="false"
            @load="loaded"
            @error="failed"
          />
          <VideoCropOverlay
            v-if="phase !== 'loading' && phase !== 'failed'"
            v-model="bounds"
            :source-width="dimensions.width"
            :source-height="dimensions.height"
            :disabled="phase !== 'editing' || !crop.success"
          />
        </div>
      </div>
      <div class="flex flex-col items-start gap-2">
        <h4>{{ t('referenceCrop.result') }}</h4>
        <canvas
          v-show="crop.success && phase !== 'loading'"
          ref="preview"
          :aria-label="t('referenceCrop.result')"
          class="max-h-80 max-w-full object-contain"
        />
        <p v-if="crop.success" class="m-0">
          {{
            t('referenceCrop.pixels', {
              width: bounds.width,
              height: bounds.height
            })
          }}
        </p>
        <p
          v-if="crop.success && Math.min(bounds.width, bounds.height) < 256"
          role="status"
        >
          {{ t('referenceCrop.small') }}
        </p>
      </div>
    </div>
    <fieldset
      :disabled="phase !== 'editing'"
      class="grid grid-cols-2 gap-3 border-0 p-0 sm:grid-cols-4"
    >
      <label v-for="field in fields" :key="field" class="flex flex-col gap-1">
        {{ t(`referenceCrop.${field}`) }}
        <input
          v-model.number="bounds[field]"
          type="number"
          step="1"
          :min="field === 'x' || field === 'y' ? 0 : 16"
          :max="
            field === 'x' || field === 'width'
              ? dimensions.width
              : dimensions.height
          "
          class="w-full rounded-sm border bg-comfy-input px-2 py-1"
        />
      </label>
    </fieldset>
    <p v-if="phase === 'editing' && !crop.success" role="alert">
      {{ t('referenceCrop.invalid') }}
    </p>
    <div class="flex flex-wrap gap-3">
      <button
        type="button"
        :disabled="phase !== 'editing' || !crop.success"
        class="rounded-sm border px-3 py-2"
        @click="save"
      >
        {{
          phase === 'saving'
            ? t('referenceLibrary.saving')
            : t('referenceCrop.save')
        }}
      </button>
      <button
        type="button"
        :disabled="phase !== 'editing'"
        class="rounded-sm border px-3 py-2"
        @click="reset"
      >
        {{ t('referenceCrop.reset') }}
      </button>
      <button
        type="button"
        :disabled="phase === 'saving'"
        class="rounded-sm border px-3 py-2"
        @click="emit('cancel')"
      >
        {{ t('referenceLibrary.cancel') }}
      </button>
    </div>
    <p class="m-0">{{ t('referenceCrop.review') }}</p>
  </section>
</template>
