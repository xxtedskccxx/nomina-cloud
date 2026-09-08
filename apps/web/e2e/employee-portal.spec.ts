import { test, expect } from '@playwright/test'
import {
  cleanupBrowserFixture,
  createBrowserFixture,
  type BrowserFixture,
} from './fixtures/payslip-fixture'

test.describe('Employee portal', () => {
  let fixture: BrowserFixture

  test.beforeAll(async () => {
    fixture = await createBrowserFixture()
  })

  test.afterAll(async () => {
    if (fixture) await cleanupBrowserFixture(fixture)
  })

  test('shows a generic login error without user enumeration', async ({ page }) => {
    await page.goto('/login')
    await page.getByLabel('Código o usuario').fill(fixture.employeeUsername)
    await page.getByLabel('Contraseña').fill('incorrect-password')
    await page.getByRole('button', { name: 'Entrar al portal' }).click()

    await expect(page.getByText('Código o contraseña incorrectos.', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Entrar al portal' })).toBeEnabled()
  })

  test('logs in, opens the latest payslip and downloads only the published PDF', async ({
    page,
  }, testInfo) => {
    await page.goto('/login')
    await page.getByLabel('Código o usuario').fill(fixture.employeeUsername)
    await page.getByLabel('Contraseña').fill(fixture.employeePassword)
    await page.getByRole('button', { name: 'Entrar al portal' }).click()

    await expect(page).toHaveURL(/\/me\/payslips$/)
    await expect(page.getByRole('heading', { name: 'Mis volantes' })).toBeVisible()
    await expect(page.getByText(fixture.periodCode, { exact: true }).first()).toBeVisible()
    await page.screenshot({ path: testInfo.outputPath('employee-portal.png'), fullPage: true })
    await page.getByRole('link', { name: 'Ver volante' }).first().click()

    await expect(page).toHaveURL(new RegExp(`/me/payslips/${fixture.publishedPayslipId}$`))
    const viewer = page.locator('iframe[title^="Vista previa del volante"]')
    await expect(viewer).toBeVisible()
    const pdfResponse = await page.request.get(
      `http://localhost:4000/api/employees/me/payslips/${fixture.publishedPayslipId}/file`,
    )
    expect(pdfResponse.status()).toBe(200)
    expect(pdfResponse.headers()['content-type']).toContain('application/pdf')
    expect((await pdfResponse.body()).toString()).toContain('%PDF-1.7')

    const downloadPromise = page.waitForEvent('download')
    await page.getByRole('link', { name: 'Descargar' }).click()
    const download = await downloadPromise
    expect(download.suggestedFilename()).toMatch(/\.pdf$/i)
  })
})
