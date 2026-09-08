'use client'

import type { Coverage, NextStep } from '@/lib/payroll-view'
import { plural } from '@/lib/payroll-view'
import { AlertIcon, ArrowRightIcon, CheckCircleIcon, InfoIcon } from '@/components/ui/icons'
import { Skeleton } from '@/components/ui/primitives'

/*
Responde la pregunta que abre cada sesión de trabajo: ¿cuánto falta?

Una sola cifra de cobertura, una barra segmentada que reparte a los
empleados esperados entre publicado / listo / por revisar / sin volante,
y debajo la leyenda con el número exacto de cada segmento. La barra
nunca es el único portador del dato: siempre hay cifra y palabra.
*/
export function CoveragePanel({
  coverage,
  nextStep,
  isLoading,
  onAction,
}: {
  coverage: Coverage
  nextStep: NextStep
  isLoading: boolean
  onAction: (step: NextStep) => void
}) {
  /*
  Un archivo sin identificar todavía no pertenece a nadie, así que la
  suma de segmentos puede superar a los empleados esperados. La barra
  se mide contra el mayor de los dos para no desbordar ni mentir.
  */
  const segmentTotal = coverage.published + coverage.ready + coverage.needsReview + coverage.missing
  const base = Math.max(coverage.expected, segmentTotal, 1)
  const width = (value: number) => `${Math.max(0, Math.min(100, (value / base) * 100))}%`
  const segments = [
    {
      key: 'published',
      value: coverage.published,
      label: 'Publicados',
      className: 'meter-published',
    },
    { key: 'ready', value: coverage.ready, label: 'Listos', className: 'meter-ready' },
    { key: 'review', value: coverage.needsReview, label: 'Por revisar', className: 'meter-review' },
    { key: 'missing', value: coverage.missing, label: 'Sin volante', className: 'meter-missing' },
  ]

  const StepIcon =
    nextStep.tone === 'ok' ? CheckCircleIcon : nextStep.tone === 'warn' ? AlertIcon : InfoIcon

  return (
    <section className="panel area-coverage" aria-labelledby="coverage-title">
      <div className="panel-body coverage">
        <h2 className="title-section" id="coverage-title">
          Cobertura del período
        </h2>

        {isLoading ? (
          <>
            <Skeleton />
            <Skeleton block />
          </>
        ) : (
          <>
            <div className="coverage-headline">
              {coverage.expected === 0 ? (
                <p className="coverage-count">
                  Sin empleados <small>en este período</small>
                </p>
              ) : (
                <>
                  <p className="coverage-count num">
                    {coverage.covered} de {coverage.expected}{' '}
                    <small>
                      {plural(coverage.expected, 'empleado con volante', 'empleados con volante')}
                    </small>
                  </p>
                  <p className="coverage-percent num">{coverage.percent}% cubierto</p>
                </>
              )}
            </div>

            <div className="meter" aria-hidden="true">
              {segments
                .filter((segment) => segment.value > 0)
                .map((segment) => (
                  <div
                    key={segment.key}
                    className={`meter-segment ${segment.className}`}
                    style={{ width: width(segment.value) }}
                  />
                ))}
            </div>

            <dl className="legend">
              {segments.map((segment) => (
                <div className="legend-item" key={segment.key}>
                  <span className={`legend-swatch ${segment.className}`} aria-hidden="true" />
                  <dt className="legend-label">{segment.label}</dt>
                  <dd className="legend-value num">{segment.value}</dd>
                </div>
              ))}
            </dl>
          </>
        )}
      </div>

      <div className={`next-step next-step-${nextStep.tone}`}>
        <div className="next-step-copy">
          <span className="alert-icon">
            <StepIcon size={18} />
          </span>
          <div>
            <strong>{nextStep.title}</strong>
            <p>{nextStep.detail}</p>
          </div>
        </div>
        {nextStep.actionLabel ? (
          <button
            className="button button-secondary"
            onClick={() => onAction(nextStep)}
            type="button"
          >
            {nextStep.actionLabel}
            <ArrowRightIcon size={14} />
          </button>
        ) : null}
      </div>
    </section>
  )
}
