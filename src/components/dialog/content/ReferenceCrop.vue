<script setup lang="ts">
import {
  computed,
  onBeforeUnmount,
  ref,
  shallowRef,
  useTemplateRef,
  watchEffect
} from 'vue'
import { useI18n } from 'vue-i18n'

import {
  referenceAsset,
  referenceCrop
} from '../../../../cloudflare/referenceContract'
import type { ReferenceAsset } from '../../../../cloudflare/referenceContract'
import VideoCropOverlay from '@/components/videoEdit/VideoCropOverlay.vue'
import type { Bounds } from '@/renderer/core/layout/types'
import { api } from '@/scripts/api'

import { detectReferenceFaces, portraitBounds } from './referenceFaces'
import { cropQuality } from './referenceQuality'
import { maskReference } from './referenceMask'

const detection = ref<{
  phase: 'loading' | 'ready' | 'failed'
  faces: Bounds[]
}>({ phase: 'loading', faces: [] })
const choosingFace = ref(true)
let disposed = false
onBeforeUnmount(() => {
  disposed = true
})
async function findFaces(image: HTMLImageElement) {
  try {
    const faces = await detectReferenceFaces(image)
    if (!disposed) detection.value = { phase: 'ready', faces }
  } catch {
    if (!disposed) detection.value = { phase: 'failed', faces: [] }
  }
}
const selectedFace = ref<Bounds | null>(null)
function selectFace(face: Bounds) {
  selectedFace.value = face
  bounds.value = portraitBounds(
    face,
    dimensions.value.width,
    dimensions.value.height,
    detection.value.faces
  )
  choosingFace.value = false
}

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
const maskState = shallowRef<
  | { phase: 'idle' | 'loading' | 'failed' }
  | {
      phase: 'ready'
      key: string
      canvas: HTMLCanvasElement
      seed: { x: number; y: number }
    }
>({ phase: 'idle' })
const maskKey = computed(() =>
  JSON.stringify({ bounds: bounds.value, face: selectedFace.value })
)
const activeMask = computed(() =>
  maskState.value.phase === 'ready' && maskState.value.key === maskKey.value
    ? maskState.value
    : null
)
const quality = computed(() =>
  cropQuality(bounds.value, detection.value.faces, selectedFace.value)
)
async function isolate() {
  const image = source.value
  const face = selectedFace.value
  if (!image || !face || phase.value !== 'editing' || quality.value.clipped)
    return
  const key = maskKey.value
  const rectangle = { ...bounds.value }
  const seed = {
    x: (face.x + face.width / 2) / dimensions.value.width,
    y: (face.y + face.height / 2) / dimensions.value.height
  }
  maskState.value = { phase: 'loading' }
  try {
    const canvas = await maskReference(image, rectangle, seed)
    if (!canvas) {
      if (!disposed) maskState.value = { phase: 'failed' }
      return
    }
    if (!disposed)
      maskState.value =
        key === maskKey.value
          ? { phase: 'ready', key, canvas, seed }
          : { phase: 'idle' }
  } catch {
    if (!disposed) maskState.value = { phase: 'failed' }
  }
}

const crop = computed(() =>
  referenceCrop.safeParse({
    parentId: asset.id,
    parentRevision: asset.revision,
    parentEtag: asset.etag,
    sourceWidth: dimensions.value.width,
    sourceHeight: dimensions.value.height,
    ...bounds.value,
    method: 'browser-canvas-crop-v1',
    ...(activeMask.value && {
      mask: {
        method: 'mediapipe-magic-touch-v1',
        seed: activeMask.value.seed,
        background: 'gray-128'
      }
    })
  })
)
function loaded() {
  const image = source.value
  if (!image) return
  dimensions.value = { width: image.naturalWidth, height: image.naturalHeight }
  bounds.value = initialSelection()
  phase.value = crop.value.success ? 'editing' : 'failed'
  if (phase.value === 'failed') error.value = t('referenceCrop.unsupported')
  else void findFaces(image)
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
  const context = canvas.getContext('2d')
  if (activeMask.value)
    context?.drawImage(
      activeMask.value.canvas,
      0,
      0,
      canvas.width,
      canvas.height
    )
  else
    context?.drawImage(
      image,
      x,
      y,
      width,
      height,
      0,
      0,
      canvas.width,
      canvas.height
    )
})
function initialSelection(): Bounds {
  const { width, height } = dimensions.value
  const x = Math.min(
    Math.round(width * 0.15),
    Math.max(0, Math.floor((width - 16) / 2))
  )
  const y = Math.min(
    Math.round(height * 0.15),
    Math.max(0, Math.floor((height - 16) / 2))
  )
  return { x, y, width: width - 2 * x, height: height - 2 * y }
}
function reset() {
  bounds.value = initialSelection()
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
    if (activeMask.value) context.drawImage(activeMask.value.canvas, 0, 0)
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
          asset.name.replace(/\.[^.]+$/, '') +
            (activeMask.value ? '-masked-crop.png' : '-crop.png')
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
    <p role="status">
      {{
        t(
          !choosingFace
            ? 'referenceCrop.adjust'
            : `referenceCrop.detection.${detection.phase === 'ready' && !detection.faces.length ? 'empty' : detection.phase}`
        )
      }}
    </p>
    <div class="flex flex-wrap gap-2">
      <button
        v-if="choosingFace"
        type="button"
        class="rounded-sm border px-3 py-2"
        @click="choosingFace = false"
      >
        {{ t('referenceCrop.manual') }}
      </button>
      <button
        v-else-if="detection.faces.length"
        type="button"
        :disabled="phase !== 'editing'"
        class="rounded-sm border px-3 py-2"
        @click="choosingFace = true"
      >
        {{ t('referenceCrop.chooseAgain') }}
      </button>
    </div>
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
          <button
            v-for="(face, index) in choosingFace ? detection.faces : []"
            :key="index"
            type="button"
            class="absolute cursor-pointer border-2 border-white bg-black/10 text-white focus-visible:outline-4 focus-visible:outline-white"
            :style="{
              left: `${(100 * face.x) / dimensions.width}%`,
              top: `${(100 * face.y) / dimensions.height}%`,
              width: `${(100 * face.width) / dimensions.width}%`,
              height: `${(100 * face.height) / dimensions.height}%`
            }"
            :aria-label="t('referenceCrop.selectFace', { number: index + 1 })"
            @click="selectFace(face)"
          >
            <span class="absolute top-0 left-0 bg-black px-1">{{
              index + 1
            }}</span>
          </button>
          <VideoCropOverlay
            v-if="!choosingFace && phase !== 'loading' && phase !== 'failed'"
            v-model="bounds"
            :source-width="dimensions.width"
            :source-height="dimensions.height"
            :disabled="
              choosingFace ||
              maskState.phase === 'loading' ||
              phase !== 'editing' ||
              !crop.success
            "
          />
        </div>
      </div>
      <div v-if="!choosingFace" class="flex flex-col items-start gap-2">
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
    <div v-if="!choosingFace" class="flex flex-col gap-2">
      <h4 class="m-0">{{ t('referenceCrop.qualityTitle') }}</h4>
      <p class="m-0">{{ t('referenceCrop.qualityHelp') }}</p>
      <p v-if="quality.facePixels !== null" class="m-0">
        {{ t('referenceCrop.facePixels', { pixels: quality.facePixels }) }}
      </p>
      <p v-if="quality.clipped" role="status" class="m-0">
        {{ t('referenceCrop.clipped') }}
      </p>
      <p v-if="quality.neighbors" role="status" class="m-0">
        {{ t('referenceCrop.neighbors', { count: quality.neighbors }) }}
      </p>
      <button
        type="button"
        class="self-start rounded-sm border px-3 py-2"
        :disabled="
          !selectedFace ||
          !crop.success ||
          quality.clipped ||
          phase !== 'editing' ||
          maskState.phase === 'loading'
        "
        @click="isolate"
      >
        {{
          t(
            maskState.phase === 'loading'
              ? 'referenceCrop.maskLoading'
              : 'referenceCrop.mask'
          )
        }}
      </button>
      <p v-if="!selectedFace" class="m-0">
        {{ t('referenceCrop.maskSelect') }}
      </p>
      <p v-if="maskState.phase === 'failed'" role="alert">
        {{ t('referenceCrop.maskFailed') }}
      </p>
      <template v-if="activeMask">
        <p role="status">{{ t('referenceCrop.maskReview') }}</p>
        <button
          type="button"
          :disabled="phase !== 'editing'"
          class="self-start rounded-sm border px-3 py-2"
          @click="maskState = { phase: 'idle' }"
        >
          {{ t('referenceCrop.removeMask') }}
        </button>
      </template>
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
        :disabled="
          choosingFace ||
          maskState.phase === 'loading' ||
          phase !== 'editing' ||
          !crop.success
        "
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
