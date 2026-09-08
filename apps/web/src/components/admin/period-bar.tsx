'use client'

import { formatSpanishDate, formatSpanishDateRange } from '@/lib/api'
import { periodStatusLabel } from '@/lib/payroll-view'
import type { PayrollPeriod } from '@/lib/payslip-types'
import { StatusPill } from '@/components/ui/primitives'

/*
El período es el contexto de todo lo demás, así que vive arriba del
todo y no se mueve. Selector a la izquierda, hechos del período a la
derecha: qué quincena es, cuándo se paga y si acepta cambios.
*/
export function PeriodBar({
  periods,
  selectedPeriodId,
  period,
  isLoading,
  isUpdating,
  onSelect,
  onReopen,
  onOpen,
}: {
  periods: PayrollPeriod[]
  selectedPeriodId: string
  period: PayrollPeriod | undefined
  isLoading: boolean
  isUpdating?: boolean
  onSelect: (periodId: string) => void
  onReopen?: () => void
  onOpen?: () => void
}) {
  const status = period ? periodStatusLabel(period.status) : null

  return (
    <section className="panel period-bar" aria-label="Contexto del período">
      <div className="period-picker">
        <label className="field-label" htmlFor="period-select">
          Período de nómina
        </label>
        <select
          id="period-select"
          className="select"
          value={selectedPeriodId}
          onChange={(event) => onSelect(event.target.value)}
          disabled={isLoading || periods.length === 0}
        >
          <option value="">{isLoading ? 'Cargando períodos…' : 'Selecciona un período'}</option>
          {periods.map((item) => (
            <option key={item.id} value={item.id}>
              {item.code} · pago {formatSpanishDate(item.paymentDate)}
            </option>
          ))}
        </select>
      </div>

      {period ? (
        <dl className="period-facts">
          <div>
            <dt>Cubre</dt>
            <dd>{formatSpanishDateRange(period.startDate, period.endDate)}</dd>
          </div>
          <div>
            <dt>Fecha de pago</dt>
            <dd>{formatSpanishDate(period.paymentDate)}</dd>
          </div>
          <div>
            <dt>Estado</dt>
            <dd>{status ? <StatusPill tone={status.tone} label={status.label} /> : null}</dd>
          </div>
          {period.status === 'LOCKED' && onReopen ? (
            <div>
              <dt>Acción</dt>
              <dd>
                <button
                  type="button"
                  className="button button-secondary button-small"
                  onClick={onReopen}
                  disabled={isUpdating}
                  title="Permite volver a subir y publicar volantes en este período"
                >
                  {isUpdating ? 'Reabriendo…' : '🔓 Reabrir para cargas'}
                </button>
              </dd>
            </div>
          ) : null}
          {period.status === 'DRAFT' && onOpen ? (
            <div>
              <dt>Acción</dt>
              <dd>
                <button
                  type="button"
                  className="button button-primary button-small"
                  onClick={onOpen}
                  disabled={isUpdating}
                >
                  {isUpdating ? 'Abriendo…' : 'Abrir período'}
                </button>
              </dd>
            </div>
          ) : null}
        </dl>
      ) : null}
    </section>
  )
}
