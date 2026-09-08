'use client'

import { formatSpanishMoment } from '@/lib/api'
import { batchStatusLabel, plural } from '@/lib/payroll-view'
import type { PayslipUploadBatch } from '@/lib/payslip-types'
import { ClockIcon } from '@/components/ui/icons'
import { EmptyState, StatusPill } from '@/components/ui/primitives'

/*
La historia sirve para retomar trabajo interrumpido, no para auditar
identificadores. Cada línea dice cuándo fue la tanda y cómo terminó;
el identificador técnico queda disponible como título accesible.
*/
export function BatchHistoryPanel({
  batches,
  activeBatchId,
  onOpen,
}: {
  batches: PayslipUploadBatch[]
  activeBatchId: string
  onOpen: (batchId: string) => void
}) {
  return (
    <section className="panel area-history" aria-labelledby="history-title">
      <div className="panel-head">
        <div>
          <h2 className="title-section" id="history-title">
            Cargas anteriores
          </h2>
          <p className="meta-tight">Últimas tandas de este período.</p>
        </div>
      </div>

      {batches.length === 0 ? (
        <EmptyState
          icon={<ClockIcon size={18} />}
          title="Todavía no hay cargas en este período"
          description="Cuando subas la primera tanda de PDFs, quedará aquí para que puedas retomarla."
        />
      ) : (
        <div className="line-list">
          {batches.map((batch) => {
            /*
            El backend deriva READY de los items, así que una tanda ya
            entregada sigue diciendo "listo para publicar". Si todos sus
            archivos están publicados, eso es lo que se muestra.
            */
            const fullyPublished =
              batch.summary.totalFiles > 0 &&
              batch.summary.publishedFiles === batch.summary.totalFiles
            const status = fullyPublished
              ? ({ label: 'Publicada', tone: 'ok' } as const)
              : batchStatusLabel(batch.status)
            const pending = batch.summary.totalFiles - batch.summary.matchedFiles
            return (
              <div className="line-item" key={batch.id}>
                <div className="line-item-main">
                  <strong>{formatSpanishMoment(batch.createdAt)}</strong>
                  <p className="meta-tight">
                    {batch.summary.totalFiles} {plural(batch.summary.totalFiles, 'PDF', 'PDFs')} ·{' '}
                    {batch.summary.matchedFiles}{' '}
                    {plural(batch.summary.matchedFiles, 'asignado', 'asignados')}
                    {pending > 0
                      ? ` · ${pending} ${plural(pending, 'pendiente', 'pendientes')}`
                      : ''}
                    {batch.summary.publishedFiles > 0
                      ? ` · ${batch.summary.publishedFiles} ${plural(batch.summary.publishedFiles, 'publicado', 'publicados')}`
                      : ''}
                  </p>
                </div>
                <div className="line-item-actions">
                  <StatusPill tone={status.tone} label={status.label} />
                  <button
                    className="button button-quiet button-small"
                    onClick={() => onOpen(batch.id)}
                    disabled={batch.id === activeBatchId}
                    title={`Tanda ${batch.id}`}
                    type="button"
                  >
                    {batch.id === activeBatchId ? 'En pantalla' : 'Retomar'}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
