'use client'

import { useState } from 'react'
import { formatSpanishDateRange, formatSpanishMoment } from '@/lib/api'
import { employeeName, plural } from '@/lib/payroll-view'
import type { Coverage, PublishReadiness } from '@/lib/payroll-view'
import type { EmployeeSummary, PayrollPeriod } from '@/lib/payslip-types'
import { AlertIcon, CheckCircleIcon, ErrorIcon } from '@/components/ui/icons'
import { Alert, Dialog } from '@/components/ui/primitives'

export interface PublishResult {
  published: number
  skipped: number
  at: string
}

/*
Publicar es la acción de mayor impacto del producto: a partir de ahí
cientos de personas ven su salario. El panel responde antes de actuar
—qué se publicará, qué queda fuera y por qué— y después confirma con
un estado visible, no con un mensaje que se desvanece.
*/
export function PublishPanel({
  period,
  readiness,
  coverage,
  missingEmployees,
  isPublishing,
  result,
  onPublish,
}: {
  period: PayrollPeriod | undefined
  readiness: PublishReadiness
  coverage: Coverage
  missingEmployees: EmployeeSummary[]
  isPublishing: boolean
  result: PublishResult | null
  onPublish: () => void
}) {
  const [isConfirming, setIsConfirming] = useState(false)
  const { readyCount, canPublish, checks } = readiness
  const blockingReason = !period
    ? 'Elige un período para publicar.'
    : period.status === 'LOCKED'
      ? 'El período está bloqueado y no admite publicaciones.'
      : readyCount === 0
        ? 'Todavía no hay volantes en borrador listos para publicar.'
        : ''

  return (
    <section
      className={`panel${result ? ' panel-ok' : ''}`}
      aria-labelledby="publish-title"
      id="publish"
    >
      <div className="panel-head">
        <h2 className="title-section" id="publish-title">
          Publicación
        </h2>
      </div>

      <div className="panel-body stack">
        {result ? (
          <Alert tone="ok" title="Nómina publicada">
            {result.published}{' '}
            {plural(result.published, 'empleado ya puede', 'empleados ya pueden')} ver y descargar
            su volante.
            {result.skipped > 0
              ? ` ${result.skipped} ${plural(result.skipped, 'volante quedó pendiente', 'volantes quedaron pendientes')}.`
              : ''}{' '}
            Publicado {formatSpanishMoment(result.at).toLowerCase()}
          </Alert>
        ) : null}

        <div>
          <p className="publish-total">
            <strong className="num">{readyCount}</strong>
            <span className="meta">
              {plural(readyCount, 'volante listo para publicar', 'volantes listos para publicar')}
            </span>
          </p>

          <ul className="checklist">
            {checks.map((check) => (
              <li key={check.id} className={`checklist-${check.tone}`}>
                {check.tone === 'ok' ? (
                  <CheckCircleIcon size={15} />
                ) : check.tone === 'warn' ? (
                  <AlertIcon size={15} />
                ) : (
                  <ErrorIcon size={15} />
                )}
                <span>{check.label}</span>
              </li>
            ))}
          </ul>
        </div>

        <button
          className="button button-primary button-block"
          onClick={() => setIsConfirming(true)}
          disabled={!canPublish || isPublishing}
          type="button"
        >
          {isPublishing
            ? 'Publicando…'
            : `Publicar ${readyCount} ${plural(readyCount, 'volante', 'volantes')}`}
        </button>

        {!canPublish && blockingReason ? (
          <p className="meta-tight">{blockingReason}</p>
        ) : (
          <p className="meta-tight">
            Los borradores no son visibles para los empleados hasta que publiques.
          </p>
        )}
      </div>

      <Dialog
        open={isConfirming}
        title={`¿Publicar ${readyCount} ${plural(readyCount, 'volante', 'volantes')}?`}
        description={
          period
            ? `${period.code} · ${formatSpanishDateRange(period.startDate, period.endDate)}`
            : undefined
        }
        onClose={() => setIsConfirming(false)}
        footer={
          <>
            <button
              className="button button-secondary"
              onClick={() => setIsConfirming(false)}
              type="button"
            >
              Cancelar
            </button>
            <button
              className="button button-primary"
              onClick={() => {
                setIsConfirming(false)
                onPublish()
              }}
              type="button"
            >
              Publicar {readyCount} {plural(readyCount, 'volante', 'volantes')}
            </button>
          </>
        }
      >
        <ul className="consequence-list">
          <li>
            {readyCount} {plural(readyCount, 'empleado podrá', 'empleados podrán')} ver y descargar
            su volante inmediatamente.
          </li>
          <li>Esta acción no envía correos ni notifica automáticamente.</li>
          <li>Podrás seguir subiendo los volantes que falten después de publicar.</li>
        </ul>

        {coverage.missing > 0 ? (
          <Alert
            tone="warn"
            title={`${coverage.missing} ${plural(coverage.missing, 'empleado se quedará', 'empleados se quedarán')} sin volante`}
          >
            {missingEmployees.length > 0
              ? `No recibirán nada en este período: ${missingEmployees
                  .slice(0, 4)
                  .map((employee) => `${employee.employeeCode} ${employeeName(employee)}`)
                  .join(', ')}${coverage.missing > 4 ? ` y ${coverage.missing - 4} más.` : '.'}`
              : 'Revisa la lista de empleados sin volante antes de continuar.'}
          </Alert>
        ) : null}
      </Dialog>
    </section>
  )
}
