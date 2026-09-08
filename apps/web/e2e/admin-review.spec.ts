import { test, expect } from '@playwright/test'
import {
  cleanupBrowserFixture,
  createBrowserFixture,
  type BrowserFixture,
} from './fixtures/payslip-fixture'

test.describe('Admin payslip review', () => {
  let fixture: BrowserFixture

  test.beforeAll(async () => {
    fixture = await createBrowserFixture()
  })

  test.afterAll(async () => {
    if (fixture) await cleanupBrowserFixture(fixture)
  })

  test('logs in, opens the current batch and explicitly resolves an exception', async ({
    page,
  }, testInfo) => {
    await page.goto('/login')
    await page.getByLabel('Código o usuario').fill(fixture.adminUsername)
    await page.getByLabel('Contraseña').fill(fixture.adminPassword)
    await page.getByRole('button', { name: 'Entrar al portal' }).click()

    await expect(page).toHaveURL(/\/admin\/payslips$/)
    await expect(page.getByRole('heading', { name: 'Volantes', exact: true })).toBeVisible()
    await expect(page.getByRole('combobox', { name: 'Período de nómina' })).toHaveValue(
      fixture.periodId,
    )
    await expect(page.getByRole('heading', { name: 'Requiere tu atención' })).toBeVisible()
    await page.screenshot({ path: testInfo.outputPath('admin-review.png'), fullPage: true })

    const search = page.getByRole('textbox', { name: 'Buscar empleado para needs-review.pdf' })
    await search.fill(fixture.reviewEmployeeCode)
    await page.getByRole('button', { name: 'Buscar' }).click()
    await page.getByRole('button', { name: new RegExp(fixture.reviewEmployeeCode) }).click()

    await expect(page.getByRole('heading', { name: 'Requiere tu atención' })).toHaveCount(0)
    const batchResponse = await page.request.get(
      `http://localhost:4000/api/payslip-upload-batches/${fixture.batchId}`,
    )
    expect(batchResponse.status()).toBe(200)
    const batch = (await batchResponse.json()).data
    expect(batch.status).toBe('READY')
    expect(batch.items[0]).toMatchObject({ status: 'COMPLETED', matchMethod: 'MANUAL' })
  })
})
