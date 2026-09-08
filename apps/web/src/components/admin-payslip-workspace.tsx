'use client'

/*
PANTALLA DE OPERACIÓN DE RRHH
=====================================================================
Orquesta el período: carga datos, ejecuta las acciones contra la API y
reparte el estado entre paneles especializados. Aquí no vive markup de
presentación; cada bloque de la pantalla es un componente en ./admin.

Orden de lectura deliberado (ESTADO → PROBLEMA → ACCIÓN → CONFIRMACIÓN):
  1. período           ¿dónde estoy?
  2. cobertura         ¿cuánto falta?  + siguiente paso
  3. atención          ¿qué debo resolver?
  4. carga             ¿cómo agrego documentos?
  5. publicación       ¿puedo publicar?  (carril lateral, siempre visible)
  6. lista e historial verificación y trazabilidad
*/

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { apiRequest } from '@/lib/api'
import {
  attentionItems,
  deriveCoverage,
  describeError,
  deriveNextStep,
  derivePublishReadiness,
  plural,
} from '@/lib/payroll-view'
import type { NextStep } from '@/lib/payroll-view'
import type {
  EmployeeSummary,
  MissingEmployeesResponse,
  PayrollPeriod,
  Payslip,
  PayslipListResponse,
  PayslipPeriodSummary,
  PayslipUploadBatch,
  PayslipUploadBatchItem,
  PayslipUploadBatchListResponse,
} from '@/lib/payslip-types'
import Link from 'next/link'
import { PortalHeader } from './portal-header'
import { ClockIcon, DocumentIcon, UploadIcon, UsersIcon } from './ui/icons'
import { PeriodBar } from './admin/period-bar'
import { CoveragePanel } from './admin/coverage-panel'
import { AttentionPanel } from './admin/attention-panel'
import { UploadPanel, type LocalUpload, type UploadOutcome } from './admin/upload-panel'
import { PublishPanel, type PublishResult } from './admin/publish-panel'
import { MissingEmployeesPanel } from './admin/missing-employees'
import { BatchHistoryPanel } from './admin/batch-history'
import { PayslipRecordsPanel, type RecordFilter } from './admin/payslip-records'
import { Alert } from './ui/primitives'

interface UploadResultItem {
  id?: string
  originalFileName: string
  status:
    | 'UPLOADED'
    | 'COMPLETED'
    | 'NEEDS_REVIEW'
    | 'DUPLICATE'
    | 'INVALID'
    | 'FAILED'
    | 'PROCESSING'
  payslipId: string | null
  employee: EmployeeSummary | null
  matchMethod?: 'EXACT' | 'NORMALIZED' | 'MANUAL' | 'UNMATCHED'
  message?: string
  duplicateOfPayslipId?: string
}

const emptySummary: PayslipPeriodSummary = {
  participants: 0,
  expected: 0,
  payslips: 0,
  uploaded: 0,
  published: 0,
  draft: 0,
  archived: 0,
  needsReview: 0,
  missing: 0,
}

const configuredUploadConcurrency = Number(process.env.NEXT_PUBLIC_UPLOAD_CONCURRENCY ?? '4')
const uploadConcurrency = Number.isFinite(configuredUploadConcurrency)
  ? Math.min(8, Math.max(1, Math.floor(configuredUploadConcurrency)))
  : 4

export function AdminPayslipWorkspace() {
  const [periods, setPeriods] = useState<PayrollPeriod[]>([])
  const [selectedPeriodId, setSelectedPeriodId] = useState('')
  const [uploads, setUploads] = useState<LocalUpload[]>([])
  const [progressDone, setProgressDone] = useState(0)
  const [progressTotal, setProgressTotal] = useState(0)
  const [outcome, setOutcome] = useState<UploadOutcome | null>(null)
  const [payslips, setPayslips] = useState<Payslip[]>([])
  const [missingEmployees, setMissingEmployees] = useState<EmployeeSummary[]>([])
  const [missingTotal, setMissingTotal] = useState(0)
  const [summary, setSummary] = useState<PayslipPeriodSummary>(emptySummary)
  const [batchHistory, setBatchHistory] = useState<PayslipUploadBatch[]>([])
  const [batchDetail, setBatchDetail] = useState<PayslipUploadBatch | null>(null)
  const [batchId, setBatchId] = useState('')
  const [filter, setFilter] = useState<RecordFilter>('ALL')
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [isLoadingPeriods, setIsLoadingPeriods] = useState(true)
  const [isLoadingPeriod, setIsLoadingPeriod] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [isPublishing, setIsPublishing] = useState(false)
  const [replaceBusyId, setReplaceBusyId] = useState('')
  const [publishResult, setPublishResult] = useState<PublishResult | null>(null)
  const [error, setError] = useState('')
  const [activeTab, setActiveTab] = useState<'upload' | 'records' | 'missing' | 'history'>('upload')

  const batchIdRef = useRef('')
  const selectedPeriod = periods.find((period) => period.id === selectedPeriodId)
  const periodLocked = selectedPeriod?.status === 'LOCKED'

  /* La búsqueda no dispara una petición por tecla. */
  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput), 300)
    return () => clearTimeout(timer)
  }, [searchInput])

  useEffect(() => {
    let cancelled = false
    apiRequest<{ data: PayrollPeriod[] }>('/payroll-periods?page=1&pageSize=20')
      .then((response) => {
        if (cancelled) return
        setPeriods(response.data)
        setSelectedPeriodId((current) => current || response.data[0]?.id || '')
      })
      .catch(() => {
        if (!cancelled) setError('No pudimos cargar los períodos de nómina.')
      })
      .finally(() => {
        if (!cancelled) setIsLoadingPeriods(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const loadPeriod = useCallback(async () => {
    if (!selectedPeriodId) {
      setPayslips([])
      setSummary(emptySummary)
      setMissingEmployees([])
      setMissingTotal(0)
      setBatchHistory([])
      setBatchDetail(null)
      return
    }
    const params = new URLSearchParams({ page: '1', pageSize: '100' })
    if (search.trim()) params.set('search', search.trim())
    if (filter === 'PUBLISHED' || filter === 'DRAFT') params.set('status', filter)
    if (filter === 'NEEDS_REVIEW') params.set('matchStatus', 'NEEDS_REVIEW')

    setIsLoadingPeriod(true)
    try {
      const [listResponse, missingResponse, historyResponse] = await Promise.all([
        apiRequest<PayslipListResponse>(`/payroll-periods/${selectedPeriodId}/payslips?${params}`),
        apiRequest<MissingEmployeesResponse>(
          `/payroll-periods/${selectedPeriodId}/payslips/missing?pageSize=100`,
        ),
        apiRequest<PayslipUploadBatchListResponse>(
          `/payslip-upload-batches?periodId=${encodeURIComponent(selectedPeriodId)}&page=1&pageSize=10`,
        ),
      ])
      setPayslips(listResponse.data)
      setSummary(listResponse.summary ?? emptySummary)
      setMissingEmployees(missingResponse.data)
      setMissingTotal(missingResponse.pagination.total)
      setBatchHistory(historyResponse.data)
      setError('')

      const targetBatchId =
        historyResponse.data.find((batch) => batch.id === batchIdRef.current)?.id ??
        historyResponse.data[0]?.id ??
        ''
      batchIdRef.current = targetBatchId
      setBatchId(targetBatchId)
      if (targetBatchId) {
        const detail = await apiRequest<{ data: PayslipUploadBatch }>(
          `/payslip-upload-batches/${targetBatchId}`,
        )
        setBatchDetail(detail.data)
      } else {
        setBatchDetail(null)
      }
    } catch (requestError) {
      setError(
        describeError(
          requestError,
          'No pudimos cargar este período. Revisa tu conexión e inténtalo otra vez.',
        ),
      )
    } finally {
      setIsLoadingPeriod(false)
    }
  }, [filter, search, selectedPeriodId])

  useEffect(() => {
    void loadPeriod()
  }, [loadPeriod])

  /* --------------------------------------------------------------
     Carga de archivos
     -------------------------------------------------------------- */

  function addFiles(fileList: FileList | File[]) {
    const incoming = Array.from(fileList)
    const pdfs = incoming.filter(
      (file) => file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf'),
    )
    const rejected = incoming.length - pdfs.length
    if (pdfs.length === 0) {
      setError('Solo aceptamos archivos PDF. Ninguno de los archivos elegidos lo era.')
      return
    }
    setError(
      rejected > 0
        ? `Ignoramos ${rejected} ${plural(rejected, 'archivo que no era PDF', 'archivos que no eran PDF')}.`
        : '',
    )
    setOutcome(null)
    setUploads((current) => [
      ...current,
      ...pdfs.map((file, index) => ({
        id: `${Date.now()}-${file.name}-${file.size}-${index}`,
        file,
        status: 'queued' as const,
      })),
    ])
  }

  function updateUpload(id: string, patch: Partial<LocalUpload>) {
    setUploads((current) =>
      current.map((upload) => (upload.id === id ? { ...upload, ...patch } : upload)),
    )
  }

  async function ensureBatch(): Promise<string> {
    if (batchIdRef.current && batchDetail?.status !== 'COMPLETED') return batchIdRef.current
    const response = await apiRequest<{ data: PayslipUploadBatch }>('/payslip-upload-batches', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ payrollPeriodId: selectedPeriodId }),
    })
    batchIdRef.current = response.data.id
    setBatchId(response.data.id)
    setBatchDetail(response.data)
    return response.data.id
  }

  async function uploadOne(
    upload: LocalUpload,
    currentBatchId: string,
  ): Promise<LocalUpload['status']> {
    updateUpload(upload.id, { status: 'uploading', message: undefined })
    const formData = new FormData()
    formData.append('files', upload.file)
    try {
      const response = await apiRequest<{ data: { batchId: string; items: UploadResultItem[] } }>(
        `/payslip-upload-batches/${currentBatchId}/files`,
        { method: 'POST', body: formData },
      )
      const result = response.data.items[0]
      if (!result) throw new Error('El servidor no devolvió el resultado de este archivo.')
      const status: LocalUpload['status'] =
        result.status === 'UPLOADED' || result.status === 'COMPLETED'
          ? 'done'
          : result.status === 'NEEDS_REVIEW'
            ? 'needs-review'
            : result.status === 'DUPLICATE'
              ? 'duplicate'
              : result.status === 'INVALID'
                ? 'invalid'
                : result.status === 'FAILED'
                  ? 'error'
                  : 'uploading'
      updateUpload(upload.id, {
        status,
        batchItemId: result.id,
        message: result.message,
        payslipId: result.payslipId,
        duplicateOfPayslipId: result.duplicateOfPayslipId,
        employee: result.employee,
      })
      return status
    } catch (requestError) {
      updateUpload(upload.id, {
        status: 'error',
        message: describeError(
          requestError,
          'No pudimos subir este archivo. Los demás sí se guardaron.',
        ),
      })
      return 'error'
    } finally {
      setProgressDone((current) => current + 1)
    }
  }

  async function uploadQueued() {
    if (!selectedPeriodId) return
    const queue = uploads.filter((upload) => upload.status === 'queued')
    if (queue.length === 0) return
    setIsUploading(true)
    setProgressDone(0)
    setProgressTotal(queue.length)
    setOutcome(null)
    setError('')
    const tally: UploadOutcome = {
      total: queue.length,
      matched: 0,
      review: 0,
      duplicate: 0,
      invalid: 0,
      failed: 0,
    }
    try {
      const currentBatchId = await ensureBatch()
      let nextIndex = 0
      const worker = async () => {
        while (nextIndex < queue.length) {
          const upload = queue[nextIndex]
          nextIndex += 1
          if (!upload) continue
          const status = await uploadOne(upload, currentBatchId)
          if (status === 'done') tally.matched += 1
          else if (status === 'needs-review') tally.review += 1
          else if (status === 'duplicate') tally.duplicate += 1
          else if (status === 'invalid') tally.invalid += 1
          else if (status === 'error') tally.failed += 1
        }
      }
      await Promise.all(
        Array.from({ length: Math.min(uploadConcurrency, queue.length) }, () => worker()),
      )
      setOutcome(tally)
      await loadPeriod()
    } catch (requestError) {
      setError(describeError(requestError, 'No pudimos iniciar la tanda de carga.'))
    } finally {
      setIsUploading(false)
    }
  }

  /*
  El backend reintenta ítems que ya existen en la tanda. Cuando la
  pantalla ofrece "reintentar este archivo" mandamos solo su id:
  reintentar todo volvería a tocar documentos que ya estaban bien.
  */
  async function retryBatchItems(itemIds?: string[]) {
    if (!batchIdRef.current) return
    setError('')
    try {
      await apiRequest(`/payslip-upload-batches/${batchIdRef.current}/retry`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(itemIds && itemIds.length > 0 ? { itemIds } : {}),
      })
      await loadPeriod()
    } catch (requestError) {
      setError(describeError(requestError, 'No pudimos reintentar los archivos fallidos.'))
    }
  }

  /*
  Un archivo que falló por red nunca llegó a existir como ítem de la
  tanda, así que reintentar la tanda no lo cubre: ese vuelve a la cola
  local. Los que sí llegaron los reintenta el backend con su archivo
  original, sin pedirle al administrador que lo busque otra vez.
  */
  async function retryFailedUploads() {
    const failed = uploads.filter((upload) => upload.status === 'error')
    const neverArrived = failed.filter((upload) => !upload.batchItemId)
    const storedItemIds = failed
      .map((upload) => upload.batchItemId)
      .filter((id): id is string => Boolean(id))

    neverArrived.forEach((upload) =>
      updateUpload(upload.id, { status: 'queued', message: undefined }),
    )
    if (storedItemIds.length > 0) await retryBatchItems(storedItemIds)
  }

  async function replaceDuplicate(item: PayslipUploadBatchItem, file: File) {
    if (!item.duplicateOfPayslipId) return
    setReplaceBusyId(item.id)
    setError('')
    const formData = new FormData()
    formData.append('file', file)
    try {
      await apiRequest(`/payslips/${item.duplicateOfPayslipId}/replace`, {
        method: 'POST',
        body: formData,
      })
      await loadPeriod()
    } catch (requestError) {
      setError(
        describeError(
          requestError,
          'No pudimos reemplazar el volante. El documento anterior sigue activo.',
        ),
      )
    } finally {
      setReplaceBusyId('')
    }
  }

  async function openBatch(id: string) {
    setError('')
    try {
      const response = await apiRequest<{ data: PayslipUploadBatch }>(
        `/payslip-upload-batches/${id}`,
      )
      batchIdRef.current = id
      setBatchId(id)
      setBatchDetail(response.data)
      setUploads([])
      setOutcome(null)
    } catch (requestError) {
      setError(describeError(requestError, 'No pudimos abrir esta tanda.'))
    }
  }

  /* --------------------------------------------------------------
     Publicación
     -------------------------------------------------------------- */

  async function publish() {
    if (!selectedPeriodId) return
    setIsPublishing(true)
    setError('')
    try {
      /*
      Se publica por tanda cuando la tanda activa tiene documentos listos;
      si no los tiene, se publican los borradores del período, que es lo
      que el panel está ofreciendo en ese caso.
      */
      const publishBatch = Boolean(batchIdRef.current) && (batchDetail?.summary.readyFiles ?? 0) > 0
      const response = await apiRequest<{ data: { published: number; skipped: number } }>(
        publishBatch
          ? `/payslip-upload-batches/${batchIdRef.current}/publish`
          : `/payroll-periods/${selectedPeriodId}/payslips/publish`,
        { method: 'POST' },
      )
      setPublishResult({ ...response.data, at: new Date().toISOString() })
      await loadPeriod()
    } catch (requestError) {
      setError(
        describeError(requestError, 'No pudimos publicar los volantes. No se publicó ninguno.'),
      )
    } finally {
      setIsPublishing(false)
    }
  }

  /* --------------------------------------------------------------
     Lecturas derivadas
     -------------------------------------------------------------- */

  const coverage = useMemo(() => deriveCoverage(summary), [summary])
  const exceptions = useMemo(() => attentionItems(batchDetail), [batchDetail])
  const readiness = useMemo(
    () =>
      derivePublishReadiness({
        coverage,
        batchSummary: batchDetail?.summary ?? null,
        attentionCount: exceptions.length,
        periodLocked: Boolean(periodLocked),
      }),
    [batchDetail, coverage, exceptions.length, periodLocked],
  )
  const nextStep = useMemo(
    () =>
      deriveNextStep({
        hasPeriod: Boolean(selectedPeriodId),
        periodLocked: Boolean(periodLocked),
        coverage,
        attentionCount: exceptions.length,
        readyCount: readiness.readyCount,
        hasAnyPayslip: summary.payslips > 0,
      }),
    [
      coverage,
      exceptions.length,
      periodLocked,
      readiness.readyCount,
      selectedPeriodId,
      summary.payslips,
    ],
  )

  function goToStep(step: NextStep) {
    if (step.action === 'select-period') {
      document.getElementById('period-select')?.focus()
      return
    }
    setActiveTab('upload')
    const targetId =
      step.action === 'upload' ? 'upload' : step.action === 'review' ? 'attention' : 'publish'
    setTimeout(() => {
      document.getElementById(targetId)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 50)
  }

  function selectPeriod(periodId: string) {
    setSelectedPeriodId(periodId)
    batchIdRef.current = ''
    setBatchId('')
    setBatchDetail(null)
    setBatchHistory([])
    setUploads([])
    setOutcome(null)
    setPublishResult(null)
    setError('')
  }

  const [isUpdatingPeriod, setIsUpdatingPeriod] = useState(false)

  async function handleReopenPeriod() {
    if (!selectedPeriodId) return
    setIsUpdatingPeriod(true)
    setError('')
    try {
      await apiRequest(`/payroll-periods/${selectedPeriodId}/reopen`, { method: 'POST' })
      const res = await apiRequest<{ data: PayrollPeriod[] }>('/payroll-periods?page=1&pageSize=20')
      setPeriods(res.data)
      await loadPeriod()
    } catch (e) {
      setError(describeError(e, 'No pudimos reabrir el período.'))
    } finally {
      setIsUpdatingPeriod(false)
    }
  }

  async function handleOpenPeriod() {
    if (!selectedPeriodId) return
    setIsUpdatingPeriod(true)
    setError('')
    try {
      await apiRequest(`/payroll-periods/${selectedPeriodId}/open`, { method: 'POST' })
      const res = await apiRequest<{ data: PayrollPeriod[] }>('/payroll-periods?page=1&pageSize=20')
      setPeriods(res.data)
      await loadPeriod()
    } catch (e) {
      setError(describeError(e, 'No pudimos abrir el período.'))
    } finally {
      setIsUpdatingPeriod(false)
    }
  }

  return (
    <div style={{ minHeight: '100dvh', background: 'var(--canvas)' }}>
      <PortalHeader role="ADMIN" name="Recursos Humanos" />
      <main className="page" aria-labelledby="admin-title">
        {/* Cabecera amigable */}
        <div className="page-head" style={{ marginBottom: 'var(--space-4)' }}>
          <div>
            <div className="admin-badge-role" style={{ marginBottom: '0.35rem' }}>
              <span>Recursos Humanos · Emisión de Nómina</span>
            </div>
            <h1 className="title-page" id="admin-title">
              Distribución de Volantes
            </h1>
            <p className="meta" style={{ marginTop: '0.2rem' }}>
              Sube los PDFs del período, revisa la asignación por código y publica para tus colaboradores.
            </p>
          </div>
          <Link href="/admin/employees" className="button button-secondary">
            <UsersIcon size={14} />
            <span>Directorio de Empleados</span>
          </Link>
        </div>

        {error ? (
          <div className="stack" style={{ marginBottom: '1rem' }}>
            <Alert
              tone="risk"
              title="No pudimos completar la última acción"
              actions={
                <button
                  className="button button-secondary button-small"
                  onClick={() => void loadPeriod()}
                  disabled={isLoadingPeriod || isUploading || isPublishing}
                  type="button"
                >
                  Reintentar
                </button>
              }
            >
              {error}
            </Alert>
          </div>
        ) : null}

        {/* Barra de Período */}
        <PeriodBar
          periods={periods}
          selectedPeriodId={selectedPeriodId}
          period={selectedPeriod}
          isLoading={isLoadingPeriods}
          isUpdating={isUpdatingPeriod}
          onSelect={selectPeriod}
          onReopen={() => void handleReopenPeriod()}
          onOpen={() => void handleOpenPeriod()}
        />

        {/* Pestañas de navegación operativa para no abrumar al usuario */}
        <div className="admin-payslip-tabs" role="tablist" style={{ margin: 'var(--space-4) 0' }}>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'upload'}
            className={`admin-payslip-tab ${activeTab === 'upload' ? 'admin-payslip-tab--active' : ''}`}
            onClick={() => setActiveTab('upload')}
          >
            <UploadIcon size={16} />
            <span>1. Cargar y Publicar</span>
            {exceptions.length > 0 ? (
              <span className="admin-tab-chip admin-tab-chip--warn">{exceptions.length} atención</span>
            ) : coverage.ready > 0 ? (
              <span className="admin-tab-chip admin-tab-chip--ok">{coverage.ready} listos</span>
            ) : null}
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'records'}
            className={`admin-payslip-tab ${activeTab === 'records' ? 'admin-payslip-tab--active' : ''}`}
            onClick={() => setActiveTab('records')}
          >
            <DocumentIcon size={16} />
            <span>2. Volantes del Período</span>
            <span className="admin-tab-chip">{summary.published + summary.draft}</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'missing'}
            className={`admin-payslip-tab ${activeTab === 'missing' ? 'admin-payslip-tab--active' : ''}`}
            onClick={() => setActiveTab('missing')}
          >
            <UsersIcon size={16} />
            <span>3. Empleados Pendientes</span>
            {missingTotal > 0 && (
              <span className="admin-tab-chip admin-tab-chip--warn">{missingTotal}</span>
            )}
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'history'}
            className={`admin-payslip-tab ${activeTab === 'history' ? 'admin-payslip-tab--active' : ''}`}
            onClick={() => setActiveTab('history')}
          >
            <ClockIcon size={16} />
            <span>4. Historial de Cargas</span>
            {batchHistory.length > 0 && (
              <span className="admin-tab-chip">{batchHistory.length}</span>
            )}
          </button>
        </div>

        {/* Vista 1: Carga y Publicación (Paso a paso principal) */}
        {activeTab === 'upload' && (
          <div className="admin-tab-content stack" style={{ gap: 'var(--space-4)' }}>
            <CoveragePanel
              coverage={coverage}
              nextStep={nextStep}
              isLoading={isLoadingPeriod && summary.expected === 0}
              onAction={goToStep}
            />

            {exceptions.length > 0 && (
              <AttentionPanel
                items={exceptions}
                replaceBusyId={replaceBusyId}
                onResolved={() => void loadPeriod()}
                onReplace={(item, file) => void replaceDuplicate(item, file)}
                onRetryFailed={(itemIds) => void retryBatchItems(itemIds)}
              />
            )}

            <div className="admin-upload-grid">
              <UploadPanel
                files={uploads}
                isUploading={isUploading}
                progressDone={progressDone}
                progressTotal={progressTotal}
                outcome={outcome}
                locked={Boolean(periodLocked)}
                hasPeriod={Boolean(selectedPeriodId)}
                onAdd={addFiles}
                onUpload={() => void uploadQueued()}
                onClearQueue={() =>
                  setUploads((current) => current.filter((upload) => upload.status !== 'queued'))
                }
                onRemove={(id) => setUploads((current) => current.filter((upload) => upload.id !== id))}
                onRetryFailed={() => void retryFailedUploads()}
              />

              <PublishPanel
                period={selectedPeriod}
                readiness={readiness}
                coverage={coverage}
                missingEmployees={missingEmployees}
                isPublishing={isPublishing}
                result={publishResult}
                onPublish={() => void publish()}
              />
            </div>
          </div>
        )}

        {/* Vista 2: Volantes del Período */}
        {activeTab === 'records' && (
          <div className="admin-tab-content">
            <PayslipRecordsPanel
              payslips={payslips}
              filter={filter}
              search={searchInput}
              isLoading={isLoadingPeriod && payslips.length === 0}
              hasPeriod={Boolean(selectedPeriodId)}
              onFilterChange={setFilter}
              onSearchChange={setSearchInput}
              onRefresh={() => void loadPeriod()}
            />
          </div>
        )}

        {/* Vista 3: Empleados Pendientes */}
        {activeTab === 'missing' && (
          <div className="admin-tab-content">
            <MissingEmployeesPanel
              employees={missingEmployees}
              total={missingTotal}
              hasPeriod={Boolean(selectedPeriodId)}
              expected={coverage.expected}
            />
          </div>
        )}

        {/* Vista 4: Historial de Cargas */}
        {activeTab === 'history' && (
          <div className="admin-tab-content">
            <BatchHistoryPanel
              batches={batchHistory}
              activeBatchId={batchId}
              onOpen={(id) => void openBatch(id)}
            />
          </div>
        )}
      </main>
    </div>
  )
}
