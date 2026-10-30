import { unlink } from 'node:fs/promises'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { catalogUploadDirectory } from '../../src/modules/catalog/media.js'
import { TEST_ADMIN } from '../helpers/testEnv.js'
import { bearer, client, login, type Session } from '../helpers/api.js'

let admin: Session
let uploadedUrl: string | null = null

beforeAll(async () => {
  admin = await login(TEST_ADMIN.email, TEST_ADMIN.password)
})

afterAll(async () => {
  if (uploadedUrl) {
    const filename = uploadedUrl.split('/').pop()
    if (filename && /^[\da-f-]+\.png$/i.test(filename)) {
      await unlink(`${catalogUploadDirectory}/${filename}`).catch(() => undefined)
    }
  }
})

describe('Téléversement des médias du catalogue', () => {
  it('téléverse un fichier authentifié puis le sert depuis son URL catalogue', async () => {
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lV8AAAAASUVORK5CYII=',
      'base64',
    )
    const response = await client()
      .post('/api/admin/catalog/uploads')
      .set(bearer(admin.token))
      .set('Content-Type', 'image/png')
      .send(png)

    expect(response.status).toBe(201)
    expect(response.body.data.type).toBe('image/png')
    uploadedUrl = response.body.data.url

    const servedFile = await client().get(uploadedUrl!)
    expect(servedFile.status).toBe(200)
    expect(servedFile.headers['content-type']).toContain('image/png')
    expect(servedFile.body).toEqual(png)
  })

  it('refuse un téléversement anonyme', async () => {
    const response = await client()
      .post('/api/admin/catalog/uploads')
      .set('Content-Type', 'image/png')
      .send(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))

    expect(response.status).toBe(401)
  })
})
