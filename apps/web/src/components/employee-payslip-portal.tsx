'use client'

/*
PORTAL DEL EMPLEADO — INTERFAZ MÓVIL
=====================================================================
Diseñado primero para el teléfono: el último volante ocupa la primera
pantalla completa. El historial viene justo debajo. La barra de
navegación inferior permite cambiar entre secciones sin recargar.
*/

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { apiRequest, apiUrl, ApiRequestError, formatSpanishDate } from '@/lib/api'
import type { Payslip } from '@/lib/payslip-types'
import { PortalHeader } from './portal-header'
import { LatestPayslipCard, PayslipHistory } from './employee/payslip-sections'
import { BottomTabBar } from './employee/bottom-tab-bar'
import { ArrowLeftIcon, DocumentIcon, DownloadIcon, ExternalIcon } from './ui/icons'
import { Alert, EmptyState, Skeleton } from './ui/primitives'

interface SessionResponse {
  user?: { name?: string }
}

export function EmployeePayslipPortal() {
  const [payslips, setPayslips] = useState<Payslip[]>([])
  const [name, setName] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [sessionExpired, setSessionExpired] = useState(false)

  const loadPortal = useCallback(() => {
    setIsLoading(true)
    setError('')
    Promise.all([
      apiRequest<{ data: Payslip[] }>('/employees/me/payslips?page=1&pageSize=100'),
      apiRequest<SessionResponse>('/auth/get-session'),
    ])
      .then(([payslipResponse, session]) => {
        setPayslips(payslipResponse.data)
        setName(session?.user?.name ?? '')
      })
      .catch((requestError) => {
        const expired = requestError instanceof ApiRequestError && requestError.status === 401
        setSessionExpired(expired)
        setError(
          expired
            ? 'Tu sesión expiró. Inicia sesión otra vez para ver tus volantes.'
            : 'No pudimos cargar tus volantes. Revisa tu conexión e inténtalo otra vez.',
        )
      })
      .finally(() => setIsLoading(false))
  }, [])

  useEffect(() => loadPortal(), [loadPortal])

  const [selectedYear, setSelectedYear] = useState<string>('ALL')

  const [latest, ...previous] = payslips
  const firstName = name.trim().split(' ')[0] ?? ''

  const availableYears = Array.from(
    new Set(payslips.map((p) => p.payrollPeriod.paymentDate.slice(0, 4))),
  ).sort((a, b) => b.localeCompare(a))

  const filteredPrevious = previous.filter((p) =>
    selectedYear === 'ALL' ? true : p.payrollPeriod.paymentDate.startsWith(selectedYear),
  )

  return (
    <>
      <PortalHeader role="EMPLOYEE" name={name} />
      <main className="page page-narrow employee-layout" aria-labelledby="employee-title">
        <div className="employee-greeting">
          <span className="overline">Portal del colaborador</span>
          <h1 className="title-page" id="employee-title">
            {firstName ? `Hola, ${firstName} 👋` : 'Mis volantes'}
          </h1>
          <p className="meta">
            {payslips.length > 0
              ? `${payslips.length} ${payslips.length === 1 ? 'comprobante disponible' : 'comprobantes disponibles'} para consulta y descarga.`
              : 'Aquí estarán tus comprobantes de pago publicados.'}
          </p>
        </div>

        <div className="stack">
          {error ? (
            <Alert
              tone="risk"
              title="No pudimos mostrar tus volantes"
              actions={
                sessionExpired ? (
                  <Link className="button button-secondary button-small" href="/login">
                    Iniciar sesión
                  </Link>
                ) : (
                  <button
                    className="button button-secondary button-small"
                    onClick={loadPortal}
                    type="button"
                  >
                    Reintentar
                  </button>
                )
              }
            >
              {error}
            </Alert>
          ) : null}

          {isLoading ? (
            <>
              <section className="panel panel-body stack-tight" aria-label="Cargando tus volantes">
                <Skeleton />
                <Skeleton block />
                <Skeleton block />
              </section>
              <section className="panel panel-body stack-tight">
                <Skeleton />
                <Skeleton block />
              </section>
            </>
          ) : latest ? (
            <>
              <LatestPayslipCard payslip={latest} />

              <div id="historial">
                {availableYears.length > 1 && (
                  <div className="year-chips-bar" role="tablist" aria-label="Filtrar por año">
                    <button
                      type="button"
                      className={`year-chip${selectedYear === 'ALL' ? ' year-chip--active' : ''}`}
                      onClick={() => setSelectedYear('ALL')}
                    >
                      Todos ({payslips.length})
                    </button>
                    {availableYears.map((year) => {
                      const count = payslips.filter((p) =>
                        p.payrollPeriod.paymentDate.startsWith(year),
                      ).length
                      return (
                        <button
                          key={year}
                          type="button"
                          className={`year-chip${selectedYear === year ? ' year-chip--active' : ''}`}
                          onClick={() => setSelectedYear(year)}
                        >
                          {year} ({count})
                        </button>
                      )
                    })}
                  </div>
                )}
                {previous.length > 0 ? <PayslipHistory payslips={filteredPrevious} /> : null}
              </div>
            </>
          ) : !error ? (
            <section className="panel">
              <EmptyState
                icon={<DocumentIcon size={18} />}
                title="Todavía no tienes volantes publicados"
                description="Cuando Recursos Humanos publique el período, tu volante aparecerá aquí y podrás descargarlo."
              />
            </section>
          ) : null}
        </div>
      </main>
      <BottomTabBar />
    </>
  )
}

type ViewerState = 'loading' | 'ready' | 'fallback'

export function EmployeePayslipViewer({ id }: { id: string }) {
  const [payslip, setPayslip] = useState<Payslip | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [viewer, setViewer] = useState<ViewerState>('loading')

  useEffect(() => {
    apiRequest<{ data: Payslip }>(`/employees/me/payslips/${encodeURIComponent(id)}`)
      .then((response) => setPayslip(response.data))
      .catch(() =>
        setError(
          'No pudimos abrir este volante. Es posible que ya no esté disponible o que tu sesión haya expirado.',
        ),
      )
      .finally(() => setIsLoading(false))
  }, [id])

  useEffect(() => {
    if (!payslip || viewer !== 'loading') return undefined
    const timer = setTimeout(() => setViewer('fallback'), 8000)
    return () => clearTimeout(timer)
  }, [payslip, viewer])

  const fileUrl = payslip ? apiUrl(`/employees/me/payslips/${payslip.id}/file`) : ''
  const downloadUrl = payslip
    ? apiUrl(`/employees/me/payslips/${payslip.id}/file?download=true`)
    : ''

  async function handleShare() {
    if (!payslip) return
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Volante ${payslip.payrollPeriod.code}`,
          url: window.location.href,
        })
      } catch {
        // El usuario canceló el diálogo
      }
    } else {
      window.open(downloadUrl, '_blank')
    }
  }

  return (
    <>
      <PortalHeader role="EMPLOYEE" />
      <main className="page page-narrow employee-layout" aria-labelledby="viewer-title">
        <div className="viewer-bar">
          <div className="stack-tight">
            <Link className="button button-quiet button-small" href="/me/payslips">
              <ArrowLeftIcon size={14} />
              Mis volantes
            </Link>
            <h1 className="title-page" id="viewer-title">
              {isLoading ? 'Cargando…' : (payslip?.payrollPeriod.code ?? 'Volante')}
            </h1>
            {payslip ? (
              <p className="meta">
                Fecha de pago {formatSpanishDate(payslip.payrollPeriod.paymentDate)}
                {payslip.publishedAt
                  ? ` · Publicado ${formatSpanishDate(payslip.publishedAt)}`
                  : ''}
              </p>
            ) : null}
          </div>
          {payslip ? (
            <div className="row">
              <a className="button button-primary" href={downloadUrl}>
                <DownloadIcon size={14} />
                Descargar
              </a>
              <button
                className="button button-secondary"
                type="button"
                onClick={() => void handleShare()}
                aria-label="Compartir este volante"
              >
                Compartir
              </button>
            </div>
          ) : null}
        </div>

        {error ? (
          <Alert
            tone="risk"
            title="No pudimos abrir el volante"
            actions={
              <Link className="button button-secondary button-small" href="/me/payslips">
                Volver a mis volantes
              </Link>
            }
          >
            {error}
          </Alert>
        ) : null}

        {payslip ? (
          <div className="viewer-frame-wrap">
            <iframe
              className="pdf-frame"
              title={`Vista previa del volante ${payslip.payrollPeriod.code}`}
              src={fileUrl}
              onLoad={() => setViewer((current) => (current === 'loading' ? 'ready' : current))}
              onError={() => setViewer('fallback')}
            />
            {viewer !== 'ready' ? (
              <div className="viewer-overlay">
                {viewer === 'loading' ? (
                  <p className="meta">Abriendo el documento…</p>
                ) : (
                  <EmptyState
                    icon={<DocumentIcon size={18} />}
                    title="No pudimos mostrar el PDF aquí"
                    description="Tu navegador no permite ver el documento dentro de la página. Descárgalo o ábrelo en otra pestaña; el archivo está intacto."
                    action={
                      <div className="row">
                        <a className="button button-primary" href={downloadUrl}>
                          <DownloadIcon size={14} />
                          Descargar el PDF
                        </a>
                        <a
                          className="button button-secondary"
                          href={fileUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <ExternalIcon size={14} />
                          Abrir en otra pestaña
                        </a>
                      </div>
                    }
                  />
                )}
              </div>
            ) : null}
          </div>
        ) : null}
      </main>
      <BottomTabBar />
    </>
  )
}
