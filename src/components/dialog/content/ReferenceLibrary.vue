<script setup lang="ts">
import { computed, nextTick, onMounted, ref, useTemplateRef } from 'vue'
import { useI18n } from 'vue-i18n'
import { z } from 'zod'

import {
  approvedReference,
  referenceAsset
} from '../../../../cloudflare/referenceContract'
import type { ReferenceAsset } from '../../../../cloudflare/referenceContract'
import { api } from '@/scripts/api'

import ReferenceCrop from './ReferenceCrop.vue'
import ReferenceAssetCard from './ReferenceAssetCard.vue'
import { groupReferences } from './referenceGroups'

const library = useTemplateRef<HTMLElement>('library')
const cropping = ref<ReferenceAsset | null>(null)
async function startCrop(asset: ReferenceAsset) {
  cropping.value = asset
  await nextTick()
  if (library.value) library.value.scrollTop = 0
}
function cropped(asset: ReferenceAsset) {
  assets.value = [asset, ...assets.value]
  cropping.value = null
  editing.value = referenceAsset.parse(asset)
}

const { onUse } = defineProps<{ onUse: (asset: ReferenceAsset) => void }>()
const { t } = useI18n()
const assets = ref<ReferenceAsset[]>([])
const selected = ref<string[]>([])
const approvedOnly = ref(false)
const groups = computed(() => groupReferences(assets.value))
const visibleGroups = computed(() =>
  groups.value.filter(
    (group) =>
      !approvedOnly.value || (group.current && approvedReference(group.current))
  )
)
const editing = ref<ReferenceAsset | null>(null)
const operation = ref<
  'idle' | 'loading' | 'uploading' | 'saving' | 'reviewing'
>('idle')
const error = ref('')
const views = ['unknown', 'front', 'three-quarter', 'profile', 'other'] as const

async function request(path: string, init?: RequestInit): Promise<unknown> {
  const response = await api.fetchApi(path, init)
  const body: unknown = await response.json()
  if (!response.ok) {
    const parsed = z
      .object({
        error: z.union([z.string(), z.object({ message: z.string() })])
      })
      .safeParse(body)
    error.value = parsed.success
      ? typeof parsed.data.error === 'string'
        ? parsed.data.error
        : parsed.data.error.message
      : t('referenceLibrary.failed')
    return null
  }
  return body
}
async function perform(
  phase: typeof operation.value,
  action: () => Promise<unknown>
) {
  if (operation.value !== 'idle') return
  operation.value = phase
  error.value = ''
  try {
    await action()
  } catch (cause) {
    error.value =
      cause instanceof Error ? cause.message : t('referenceLibrary.failed')
  } finally {
    operation.value = 'idle'
  }
}
async function refresh() {
  const result = await request('/character-assets')
  if (result === null) return false
  assets.value = z.array(referenceAsset).parse(result)
  selected.value = []
  return true
}
function replace(asset: ReferenceAsset) {
  assets.value = assets.value.map((item) =>
    item.id === asset.id ? asset : item
  )
}
function upload(event: Event) {
  if (!(event.target instanceof HTMLInputElement)) return
  const files = Array.from(event.target.files ?? [])
  event.target.value = ''
  void perform('uploading', async () => {
    if (files.length > 20) {
      error.value = t('referenceLibrary.batchLimit')
      return
    }
    for (const file of files) {
      if (
        !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) ||
        file.size > 20 * 1024 * 1024
      ) {
        error.value = t('referenceLibrary.fileLimit')
        return
      }
      const result = await request('/character-assets', {
        method: 'POST',
        headers: {
          'Content-Type': file.type,
          'X-File-Name': encodeURIComponent(file.name)
        },
        body: file
      })
      if (result === null) return
      const asset = referenceAsset.parse(result)
      assets.value = [asset, ...assets.value]
    }
  })
}
function updateYear(event: Event) {
  if (editing.value && event.target instanceof HTMLInputElement)
    editing.value.metadata.captureYear = event.target.value
      ? Number(event.target.value)
      : null
}
function save() {
  const asset = editing.value
  if (!asset) return
  void perform('saving', async () => {
    const result = await request(`/character-assets/${asset.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        revision: asset.revision,
        metadata: asset.metadata
      })
    })
    if (result === null) return
    replace(referenceAsset.parse(result))
    editing.value = null
  })
}
function review(action: 'approve' | 'draft') {
  void perform('reviewing', async () => {
    const items = assets.value
      .filter((asset) => selected.value.includes(asset.id))
      .map(({ id, revision, etag }) => ({ id, revision, etag }))
    const result = await request('/character-assets/review', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items, action })
    })
    if (result === null) return
    z.array(referenceAsset).parse(result).forEach(replace)
    selected.value = []
  })
}
function use(asset: ReferenceAsset) {
  void perform('loading', async () => {
    if (!(await refresh())) return
    const fresh = assets.value.find((item) => item.id === asset.id)
    if (
      !fresh ||
      fresh.revision !== asset.revision ||
      !approvedReference(fresh)
    ) {
      error.value = t('referenceLibrary.changed')
      return
    }
    onUse(fresh)
  })
}
onMounted(() => {
  void perform('loading', refresh)
})
</script>

<template>
  <section
    ref="library"
    class="flex max-h-[75vh] w-full flex-col gap-4 overflow-y-auto p-5"
  >
    <h2 class="m-0 text-lg font-semibold">{{ t('referenceLibrary.title') }}</h2>
    <p v-if="!cropping" class="m-0 text-muted">
      {{ t('referenceLibrary.explanation') }}
    </p>
    <p v-if="error" role="alert" class="font-semibold">{{ error }}</p>
    <fieldset
      :disabled="operation !== 'idle'"
      class="flex flex-col gap-4 border-0 p-0"
    >
      <div v-if="!cropping" class="flex flex-wrap items-center gap-3">
        <label class="flex flex-col gap-1">
          {{ t('referenceLibrary.upload') }}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            @change="upload"
          />
        </label>
        <button
          type="button"
          class="rounded-sm border px-3 py-2"
          @click="perform('loading', refresh)"
        >
          {{ t('referenceLibrary.refresh') }}
        </button>
        <button
          type="button"
          class="rounded-sm border px-3 py-2"
          :disabled="!selected.length || !!editing || !!cropping"
          @click="review('approve')"
        >
          {{ t('referenceLibrary.approve') }}
        </button>
        <button
          type="button"
          class="rounded-sm border px-3 py-2"
          :disabled="!selected.length || !!editing || !!cropping"
          @click="review('draft')"
        >
          {{ t('referenceLibrary.revoke') }}
        </button>
      </div>
      <label v-if="!cropping"
        ><input
          v-model="approvedOnly"
          type="checkbox"
          @change="selected = []"
        />
        {{ t('referenceLibrary.approvedCrops') }}</label
      >
      <p v-if="!cropping" role="status">
        {{
          operation === 'idle'
            ? t('referenceLibrary.count', { count: assets.length })
            : t(`referenceLibrary.${operation}`)
        }}
      </p>
      <ReferenceCrop
        v-if="cropping"
        :key="cropping.id"
        :asset="cropping"
        @saved="cropped"
        @cancel="cropping = null"
      />
      <form
        v-if="editing"
        class="grid gap-3 rounded-sm border p-4 sm:grid-cols-2"
        @submit.prevent="save"
      >
        <label
          v-for="field in ['character', 'era', 'subject', 'source'] as const"
          :key="field"
          class="flex flex-col gap-1"
        >
          {{ t(`referenceLibrary.${field}`) }}
          <input
            v-model="editing.metadata[field]"
            class="rounded-sm border bg-comfy-input px-2 py-1"
            :maxlength="
              field === 'subject'
                ? 300
                : field === 'source'
                  ? 1000
                  : field === 'character'
                    ? 80
                    : 120
            "
          />
        </label>
        <label class="flex flex-col gap-1"
          >{{ t('referenceLibrary.view') }}
          <select
            v-model="editing.metadata.view"
            class="rounded-sm border bg-comfy-input px-2 py-1"
          >
            <option v-for="view in views" :key="view" :value="view">
              {{ t(`referenceLibrary.views.${view}`) }}
            </option>
          </select>
        </label>
        <label class="flex flex-col gap-1"
          >{{ t('referenceLibrary.year') }}
          <input
            :value="editing.metadata.captureYear"
            type="number"
            min="1900"
            max="2100"
            class="rounded-sm border bg-comfy-input px-2 py-1"
            @input="updateYear"
          />
        </label>
        <label
          ><input v-model="editing.metadata.approximateYear" type="checkbox" />
          {{ t('referenceLibrary.approximate') }}</label
        >
        <div class="flex gap-3">
          <button type="submit" class="rounded-sm border px-3 py-2">
            {{ t('referenceLibrary.save') }}
          </button>
          <button
            type="button"
            class="rounded-sm border px-3 py-2"
            @click="editing = null"
          >
            {{ t('referenceLibrary.cancel') }}
          </button>
        </div>
        <p class="sm:col-span-2">{{ t('referenceLibrary.saveWarning') }}</p>
      </form>
      <p v-if="!assets.length && operation === 'idle'">
        {{ t('referenceLibrary.empty') }}
      </p>
      <div v-if="!cropping" class="grid grid-cols-1 gap-4">
        <section
          v-for="group in visibleGroups"
          :key="group.original.id"
          class="flex flex-col gap-3 rounded-lg border p-4"
        >
          <h3 class="m-0 font-semibold break-all">{{ group.original.name }}</h3>
          <strong>{{
            t(
              group.current
                ? approvedReference(group.current)
                  ? 'referenceLibrary.approved'
                  : 'referenceLibrary.needsReview'
                : 'referenceLibrary.needsSelection'
            )
          }}</strong>
          <div class="grid gap-4 sm:grid-cols-2">
            <div>
              <h4>{{ t('referenceCrop.original') }}</h4>
              <ReferenceAssetCard
                v-model="selected"
                :asset="group.original"
                :disabled="!!editing"
                @crop="startCrop(group.original)"
                @edit="editing = referenceAsset.parse($event)"
                @use="use"
              />
            </div>
            <div v-if="group.current">
              <h4>{{ t('referenceLibrary.currentCrop') }}</h4>
              <ReferenceAssetCard
                v-model="selected"
                :asset="group.current"
                :disabled="!!editing"
                @crop="startCrop(group.original)"
                @edit="editing = referenceAsset.parse($event)"
                @use="use"
              />
            </div>
            <p v-else>{{ t('referenceLibrary.cropFirst') }}</p>
          </div>
          <details v-if="group.history.length">
            <summary class="cursor-pointer">
              {{
                t('referenceLibrary.history', { count: group.history.length })
              }}
            </summary>
            <div class="grid gap-4 pt-3 sm:grid-cols-2">
              <ReferenceAssetCard
                v-for="older in group.history"
                :key="older.id"
                v-model="selected"
                :asset="older"
                :disabled="!!editing"
                @crop="startCrop(group.original)"
                @edit="editing = referenceAsset.parse($event)"
                @use="use"
              />
            </div>
          </details>
        </section>
      </div>
    </fieldset>
  </section>
</template>
