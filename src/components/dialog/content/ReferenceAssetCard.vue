<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { approvedReference } from '../../../../cloudflare/referenceContract'
import type { ReferenceAsset } from '../../../../cloudflare/referenceContract'
import { api } from '@/scripts/api'
const { asset, disabled } = defineProps<{
  asset: ReferenceAsset
  disabled: boolean
}>()
const selected = defineModel<string[]>({ required: true })
const emit = defineEmits<{
  crop: [asset: ReferenceAsset]
  edit: [asset: ReferenceAsset]
  use: [asset: ReferenceAsset]
}>()
const { t } = useI18n()
</script>
<template>
  <article class="flex min-w-0 flex-col gap-2">
    <a
      :href="api.apiURL(`/character-assets/${asset.id}/preview`)"
      target="_blank"
      rel="noopener"
    >
      <img
        :src="api.apiURL(`/character-assets/${asset.id}/preview`)"
        :alt="asset.name"
        loading="lazy"
        class="h-48 w-full rounded-sm object-contain"
      />
    </a>
    <label class="flex items-center gap-2 break-all"
      ><input v-model="selected" type="checkbox" :value="asset.id" />
      {{ asset.name }}</label
    >
    <strong>{{
      approvedReference(asset)
        ? t('referenceLibrary.approved')
        : t('referenceLibrary.draft')
    }}</strong>
    <p class="m-0">{{ asset.metadata.character }} · {{ asset.metadata.era }}</p>
    <p class="m-0">{{ asset.metadata.subject }}</p>
    <p v-if="asset.crop" class="m-0">
      {{
        t('referenceCrop.derivative', {
          width: asset.crop.width,
          height: asset.crop.height
        })
      }}
    </p>
    <p v-if="asset.crop?.mask" class="m-0">
      {{ t('referenceCrop.maskedAsset') }}
    </p>
    <div class="flex flex-wrap gap-2">
      <button
        type="button"
        class="rounded-sm border px-3 py-2"
        :disabled="disabled"
        @click="emit('crop', asset)"
      >
        {{ t('referenceCrop.open') }}
      </button>
      <button
        type="button"
        class="rounded-sm border px-3 py-2"
        :disabled="disabled"
        @click="emit('edit', asset)"
      >
        {{ t('referenceLibrary.edit') }}
      </button>
      <button
        type="button"
        class="rounded-sm border px-3 py-2"
        :disabled="disabled || !approvedReference(asset)"
        @click="emit('use', asset)"
      >
        {{ t('referenceLibrary.use') }}
      </button>
    </div>
  </article>
</template>
