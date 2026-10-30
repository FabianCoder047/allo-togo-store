import { describe, expect, it } from 'vitest'
import { catalogMediaType, saveCatalogMedia } from '../../src/modules/catalog/media.js'

describe('Téléversement des médias du catalogue', () => {
  it('n’accepte que les formats image et vidéo pris en charge', () => {
    expect(catalogMediaType('image/jpeg')).toBe('image/jpeg')
    expect(catalogMediaType('video/webm')).toBe('video/webm')
    expect(catalogMediaType('image/svg+xml')).toBeNull()
    expect(catalogMediaType('application/octet-stream')).toBeNull()
  })

  it('refuse un fichier dont le contenu ne correspond pas au type déclaré', async () => {
    await expect(saveCatalogMedia('image/png', Buffer.from('pas une image'))).rejects.toThrow(
      'Le contenu du fichier ne correspond pas à son format déclaré.',
    )
  })
})
