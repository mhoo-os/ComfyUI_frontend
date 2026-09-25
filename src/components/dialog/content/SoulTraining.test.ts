import { fireEvent, render, screen, waitFor } from '@testing-library/vue'
import { expect, it, vi } from 'vitest'
import { createI18n } from 'vue-i18n'
import { referenceAsset } from '../../../../cloudflare/referenceContract'
import en from '@/locales/en/main.json'
import { api } from '@/scripts/api'
import SoulTraining from './SoulTraining.vue'

it.for(['completed', 'submission_unknown', 'in_progress', 'failed'])(
  'only permits a new named training after completed status: %s',
  async (status) => {
    vi.spyOn(api, 'fetchApi').mockResolvedValue(
      Response.json([
        {
          attemptId: '2bf4de45-6926-4b44-bd5a-62d6e72537b1',
          name: 'Previous character',
          status
        }
      ])
    )
    const asset = referenceAsset.parse({
      id: '2bf4de45-6926-4b44-bd5a-62d6e72537b2',
      name: 'portrait.png',
      revision: 2,
      etag: 'image',
      size: 100,
      contentType: 'image/png',
      created: 1,
      metadata: {
        character: 'Moo',
        era: 'favorites',
        subject: 'Only person',
        view: 'front'
      },
      approval: { revision: 2, etag: 'image', at: 2 }
    })
    render(SoulTraining, {
      props: { assets: [asset] },
      global: {
        plugins: [createI18n({ legacy: false, locale: 'en', messages: { en } })]
      }
    })
    await screen.findByText(`Previous character · ${status}`)
    await fireEvent.update(screen.getByRole('textbox'), 'New character')
    const button = screen.getByRole('button', {
      name: 'Train selected (1) · paid'
    })
    await waitFor(() =>
      status === 'completed'
        ? expect(button).toBeEnabled()
        : expect(button).toBeDisabled()
    )
    await fireEvent.update(screen.getByRole('textbox'), 'Previous character')
    expect(button).toBeDisabled()
  }
)
