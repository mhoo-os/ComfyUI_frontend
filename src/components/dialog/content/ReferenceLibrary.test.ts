import userEvent from '@testing-library/user-event'
import { fireEvent, render, screen, waitFor } from '@testing-library/vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createI18n } from 'vue-i18n'

import { referenceAsset } from '../../../../cloudflare/referenceContract'
import en from '@/locales/en/main.json'
import { api } from '@/scripts/api'

import ReferenceLibrary from './ReferenceLibrary.vue'

const asset = referenceAsset.parse({
  id: '2bf4de45-6926-4b44-bd5a-62d6e72537b1',
  name: 'portrait.png',
  revision: 2,
  etag: 'immutable-image',
  size: 100,
  contentType: 'image/png',
  created: 1,
  metadata: {
    character: 'Test',
    era: '2020',
    subject: 'Left in white',
    view: 'front'
  },
  approval: { revision: 2, etag: 'immutable-image', at: 2 }
})
function mount() {
  const onUse = vi.fn()
  render(ReferenceLibrary, {
    props: { onUse },
    global: {
      plugins: [createI18n({ legacy: false, locale: 'en', messages: { en } })]
    }
  })
  return onUse
}
beforeEach(() => {
  vi.spyOn(api, 'fetchApi').mockReset()
  vi.spyOn(api, 'apiURL').mockImplementation((path) => path)
})
describe('Character reference library', () => {
  it('disables draft use and submits exact selected revisions for approval', async () => {
    vi.mocked(api.fetchApi)
      .mockResolvedValueOnce(Response.json([{ ...asset, approval: null }]))
      .mockResolvedValueOnce(Response.json([asset]))
    mount()
    expect(await screen.findByText('Draft — review required')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Use in node' })).toBeDisabled()
    await userEvent.click(
      screen.getByRole('checkbox', { name: 'portrait.png' })
    )
    await userEvent.click(
      screen.getByRole('button', { name: 'Approve selected' })
    )
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Use in node' })).toBeEnabled()
    )
    expect(api.fetchApi).toHaveBeenLastCalledWith(
      '/character-assets/review',
      expect.objectContaining({
        body: JSON.stringify({
          items: [{ id: asset.id, revision: 2, etag: asset.etag }],
          action: 'approve'
        })
      })
    )
  })
  it('blocks using an approval revoked in another tab', async () => {
    vi.mocked(api.fetchApi)
      .mockResolvedValueOnce(Response.json([asset]))
      .mockResolvedValueOnce(Response.json([{ ...asset, approval: null }]))
    const onUse = mount()
    await screen.findByText('Approved')
    await userEvent.click(screen.getByRole('button', { name: 'Use in node' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Reference changed'
    )
    expect(onUse).not.toHaveBeenCalled()
  })
  it('keeps unsaved metadata out of review and shows a server conflict without losing edits', async () => {
    vi.mocked(api.fetchApi)
      .mockResolvedValueOnce(Response.json([asset]))
      .mockResolvedValueOnce(
        Response.json(
          { error: 'Photo changed in another tab.' },
          { status: 409 }
        )
      )
    mount()
    await screen.findByText('Approved')
    await userEvent.click(
      screen.getByRole('checkbox', { name: 'portrait.png' })
    )
    await userEvent.click(screen.getByRole('button', { name: 'Edit details' }))
    await fireEvent.update(
      screen.getByRole('textbox', { name: 'Era / period' }),
      '2021'
    )
    expect(
      screen.getByRole('button', { name: 'Approve selected' })
    ).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Use in node' })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'Save details' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Photo changed in another tab.'
    )
    expect(screen.getByRole('textbox', { name: 'Era / period' })).toHaveValue(
      '2021'
    )
  })
  it('opens crop review without changing approval and cancels without uploading', async () => {
    vi.mocked(api.fetchApi).mockResolvedValueOnce(Response.json([asset]))
    mount()
    await screen.findByText('Approved')
    await userEvent.click(screen.getByRole('button', { name: 'Crop' }))
    expect(
      await screen.findByRole('heading', { name: 'Crop portrait.png' })
    ).toBeVisible()
    expect(
      screen.getByRole('button', { name: 'Save crop as draft' })
    ).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.getByText('Approved')).toBeVisible()
    expect(api.fetchApi).toHaveBeenCalledTimes(1)
  })
})
