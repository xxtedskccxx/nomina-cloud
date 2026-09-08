'use client'

import { apiUrl, formatSpanishDate, humanFileSize } from '@/lib/api'
import { employeeName, explainMessage, matchMethodLabel, plural } from '@/lib/payroll-view'
import type { Payslip } from '@/lib/payslip-types'
import { DocumentIcon, ExternalIcon, RetryIcon } from '@/components/ui/icons'
import { EmptyState, Skeleton, StatusPill, type Tone } from '@/components/ui/primitives'

export type RecordFilter = 'ALL' | 'PUBLISHED' | 'DRAFT' | 'NEEDS_REVIEW'

const filterLabel: Record<RecordFilter, string> = {
  ALL: 'Todos',
  PUBLISHED: 'Publicados',
  DRAFT: 'Borradores',
  NEEDS_REVIEW: 'Sin identificar',
}

function payslipState(payslip: Payslip): { tone: Tone; label: string } {
  if (payslip.status === 'PUBLISHED') return { tone: 'ok', label: 'Publicado' }
  if (payslip.status === 'ARCHIVED') return { tone: 'neutral', label: 'Archivado' }
  return payslip.matchStatus === 'MATCHED'
    ? { tone: 'info', label: 'Borrador listo' }
    : { tone: 'warn', label: 'Sin identificar' }
}

/*
La lista completa es la última capa, no la primera: cuando ya no hay
excepciones, sirve para verificar casos puntuales. En escritorio es una
tabla densa; en móvil, fichas legibles. Nunca una tabla de 54rem
empujada dentro de una pantalla de 390px.
*/
export function PayslipRecordsPanel({
  payslips,
  filter,
  search,
  isLoading,
  hasPeriod,
  onFilterChange,
  onSearchChange,
  onRefresh,
}: {
  payslips: Payslip[]
  filter: RecordFilter
  search: string
  isLoading: boolean
  hasPeriod: boolean
  onFilterChange: (filter: RecordFilter) => void
  onSearchChange: (value: string) => void
  onRefresh: () => void
}) {
  return (
    <section className="panel area-records" aria-labelledby="records-title">
      <div className="panel-head">
        <div>
          <h2 className="title-section" id="records-title">
            Volantes del período
          </h2>
          <p className="meta-tight">
            {payslips.length} {plural(payslips.length, 'documento', 'documentos')} en esta vista
          </p>
        </div>
        <button
          className="button button-quiet button-small"
          onClick={onRefresh}
          disabled={!hasPeriod}
          type="button"
        >
          <RetryIcon size={14} />
          Actualizar
        </button>
      </div>

      <div className="table-toolbar">
        <div className="field">
          <label className="field-label" htmlFor="payslip-search">
            Buscar empleado o archivo
          </label>
          <input
            id="payslip-search"
            className="input"
            placeholder="Código, nombre o apellido"
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
          />
        </div>
        <div className="field">
          <label className="field-label" htmlFor="status-filter">
            Estado
          </label>
          <select
            id="status-filter"
            className="select"
            value={filter}
            onChange={(event) => onFilterChange(event.target.value as RecordFilter)}
          >
            {(Object.keys(filterLabel) as RecordFilter[]).map((option) => (
              <option key={option} value={option}>
                {filterLabel[option]}
              </option>
            ))}
          </select>
        </div>
      </div>

      {isLoading ? (
        <div className="panel-body stack-tight">
          <Skeleton />
          <Skeleton />
          <Skeleton />
        </div>
      ) : payslips.length === 0 ? (
        <EmptyState
          icon={<DocumentIcon size={18} />}
          title={
            !hasPeriod
              ? 'Elige un período de nómina'
              : search.trim()
                ? `Ningún volante coincide con «${search.trim()}»`
                : filter === 'ALL'
                  ? 'Todavía no hay volantes en este período'
                  : `No hay volantes en estado «${filterLabel[filter].toLowerCase()}»`
          }
          description={
            !hasPeriod
              ? 'La lista muestra los volantes cargados en el período que selecciones arriba.'
              : search.trim()
                ? 'Prueba con el código completo del empleado o limpia la búsqueda.'
                : filter === 'ALL'
                  ? 'Sube los PDFs generados por tu sistema de nómina para empezar el período.'
                  : 'Cambia el filtro para ver el resto de los documentos del período.'
          }
        />
      ) : (
        <>
          <div className="table-scroll only-wide">
            <table className="data-table">
              <caption className="visually-hidden">
                Volantes cargados en el período seleccionado
              </caption>
              <thead>
                <tr>
                  <th scope="col">Empleado</th>
                  <th scope="col">Área</th>
                  <th scope="col">Archivo</th>
                  <th scope="col">Estado</th>
                  <th scope="col">Subido</th>
                  <th scope="col">Publicado</th>
                  <th scope="col">
                    <span className="visually-hidden">Acciones</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {payslips.map((payslip) => {
                  const state = payslipState(payslip)
                  return (
                    <tr key={payslip.id}>
                      <td className="cell-primary">
                        {payslip.employee ? (
                          <>
                            {employeeName(payslip.employee)}
                            <span className="meta-tight"> · {payslip.employee.employeeCode}</span>
                          </>
                        ) : (
                          <span title={explainMessage(payslip.reviewReason, 'Requiere revisión')}>
                            Sin asignar
                          </span>
                        )}
                      </td>
                      <td className="meta-tight">{payslip.employee?.department?.name ?? '—'}</td>
                      <td>
                        <span className="truncate">{payslip.fileName}</span>
                        <span className="meta-tight"> · {humanFileSize(payslip.fileSize)}</span>
                      </td>
                      <td>
                        <StatusPill
                          tone={state.tone}
                          label={state.label}
                          title={matchMethodLabel(payslip.matchMethod)}
                        />
                      </td>
                      <td className="meta-tight num">{formatSpanishDate(payslip.uploadedAt)}</td>
                      <td className="meta-tight num">
                        {payslip.publishedAt ? formatSpanishDate(payslip.publishedAt) : '—'}
                      </td>
                      <td className="cell-actions">
                        <a
                          className="button button-quiet button-small"
                          href={apiUrl(`/payslips/${payslip.id}/file`)}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Ver PDF
                          <ExternalIcon size={13} />
                        </a>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="card-list only-narrow">
            {payslips.map((payslip) => {
              const state = payslipState(payslip)
              return (
                <article className="record-card" key={payslip.id}>
                  <div className="record-card-head">
                    <div className="line-item-main">
                      <strong>
                        {payslip.employee ? employeeName(payslip.employee) : 'Sin asignar'}
                      </strong>
                      <p className="meta-tight">
                        {payslip.employee
                          ? `${payslip.employee.employeeCode}${
                              payslip.employee.department
                                ? ` · ${payslip.employee.department.name}`
                                : ''
                            }`
                          : explainMessage(payslip.reviewReason, 'Requiere revisión')}
                      </p>
                    </div>
                    <StatusPill tone={state.tone} label={state.label} />
                  </div>
                  <dl>
                    <dt>Archivo</dt>
                    <dd>
                      {payslip.fileName} · {humanFileSize(payslip.fileSize)}
                    </dd>
                    <dt>Subido</dt>
                    <dd className="num">{formatSpanishDate(payslip.uploadedAt)}</dd>
                    <dt>Publicado</dt>
                    <dd className="num">
                      {payslip.publishedAt ? formatSpanishDate(payslip.publishedAt) : '—'}
                    </dd>
                  </dl>
                  <a
                    className="button button-secondary button-small"
                    href={apiUrl(`/payslips/${payslip.id}/file`)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Ver PDF
                    <ExternalIcon size={13} />
                  </a>
                </article>
              )
            })}
          </div>
        </>
      )}
    </section>
  )
}
