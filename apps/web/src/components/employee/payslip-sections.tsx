'use client'

import { useState } from 'react'
import Link from 'next/link'
import { apiUrl, formatSpanishDate, formatSpanishDateRange, humanFileSize } from '@/lib/api'
import { plural } from '@/lib/payroll-view'
import type { Payslip } from '@/lib/payslip-types'
import { ChevronRightIcon, DocumentIcon, DownloadIcon, ShareIcon } from '@/components/ui/icons'
import { EmptyState } from '@/components/ui/primitives'

/*
Tarjeta ejecutiva del último volante: estética financiera de alta fidelidad,
acabado mate en verde bosque profundo, badge dinámico de publicación
y botones táctiles optimizados para el pulgar.
*/
export function LatestPayslipCard({ payslip }: { payslip: Payslip }) {
  const [shared, setShared] = useState(false)

  async function handleShare() {
    const downloadUrl = `${window.location.origin}${apiUrl(`/employees/me/payslips/${payslip.id}/file?download=true`)}`
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Volante de Nómina ${payslip.payrollPeriod.code}`,
          text: `Mi comprobante de nómina del período ${payslip.payrollPeriod.code}`,
          url: downloadUrl,
        })
        setShared(true)
        setTimeout(() => setShared(false), 2500)
      } catch {
        // Cancelado por el usuario
      }
    } else {
      window.open(downloadUrl, '_blank')
    }
  }

  return (
    <section className="executive-card" aria-labelledby="latest-title">
      <div className="executive-header">
        <span className="executive-overline">Volante más reciente</span>
        <span className="executive-badge">
          <span className="pulse-dot" aria-hidden="true" />
          Disponible
        </span>
      </div>

      <h2 className="executive-period" id="latest-title">
        {payslip.payrollPeriod.code}
      </h2>
      <p className="executive-dates">
        {formatSpanishDateRange(payslip.payrollPeriod.startDate, payslip.payrollPeriod.endDate)}
      </p>

      <div className="executive-grid">
        <div className="executive-fact">
          <span className="executive-fact-label">Fecha de pago</span>
          <span className="executive-fact-value num">
            {formatSpanishDate(payslip.payrollPeriod.paymentDate)}
          </span>
        </div>
        <div className="executive-fact">
          <span className="executive-fact-label">Publicado</span>
          <span className="executive-fact-value num">
            {payslip.publishedAt ? formatSpanishDate(payslip.publishedAt) : 'Reciente'}
          </span>
        </div>
        <div className="executive-fact">
          <span className="executive-fact-label">Formato</span>
          <span className="executive-fact-value">
            PDF · {humanFileSize(payslip.fileSize)}
          </span>
        </div>
      </div>

      <div className="executive-actions">
        <Link className="executive-btn-primary" href={`/me/payslips/${payslip.id}`}>
          Ver volante
        </Link>
        <a
          className="executive-btn-secondary"
          href={apiUrl(`/employees/me/payslips/${payslip.id}/file?download=true`)}
          title="Descargar PDF"
        >
          <DownloadIcon size={16} />
          Descargar
        </a>
        <button
          type="button"
          className="executive-btn-secondary"
          onClick={() => void handleShare()}
          title="Compartir volante"
          aria-label="Compartir volante"
        >
          <ShareIcon size={16} />
          {shared ? '¡Listo!' : 'Compartir'}
        </button>
      </div>
    </section>
  )
}

/*
Historial agrupado por año. Cada fila tiene área de toque mínima de
48px para dedos en pantalla táctil, con una flecha discreta a la derecha
que indica que es navegable.
*/
export function PayslipHistory({ payslips }: { payslips: Payslip[] }) {
  const groups = payslips.reduce<Map<string, Payslip[]>>((accumulator, payslip) => {
    const year = payslip.payrollPeriod.paymentDate.slice(0, 4)
    const bucket = accumulator.get(year) ?? []
    bucket.push(payslip)
    accumulator.set(year, bucket)
    return accumulator
  }, new Map())

  return (
    <section className="panel" aria-labelledby="employee-history-title">
      <div className="panel-head">
        <div>
          <h2 className="title-section" id="employee-history-title">
            Volantes anteriores
          </h2>
          <p className="meta-tight">
            {payslips.length}{' '}
            {plural(payslips.length, 'documento disponible', 'documentos disponibles')}
          </p>
        </div>
      </div>

      {payslips.length === 0 ? (
        <EmptyState
          icon={<DocumentIcon size={18} />}
          title="Aún no hay volantes anteriores"
          description="Cuando se publique un nuevo período, lo verás aquí junto con el actual."
        />
      ) : (
        [...groups.entries()].map(([year, items]) => (
          <div className="history-group" key={year}>
            <p className="history-group-label">{year}</p>
            <div className="payslip-touch-list">
              {items.map((payslip) => (
                <Link
                  className="payslip-touch-item"
                  key={payslip.id}
                  href={`/me/payslips/${payslip.id}`}
                >
                  <span className="payslip-touch-icon" aria-hidden="true">
                    <DocumentIcon size={16} />
                  </span>
                  <span className="payslip-touch-body">
                    <strong className="payslip-touch-code">{payslip.payrollPeriod.code}</strong>
                    <span className="meta-tight">
                      Pago {formatSpanishDate(payslip.payrollPeriod.paymentDate)}
                    </span>
                  </span>
                  <span className="payslip-touch-actions">
                    <a
                      className="payslip-download-btn"
                      href={apiUrl(`/employees/me/payslips/${payslip.id}/file?download=true`)}
                      onClick={(e) => e.stopPropagation()}
                      aria-label={`Descargar ${payslip.payrollPeriod.code}`}
                      title="Descargar PDF"
                    >
                      <DownloadIcon size={15} />
                    </a>
                    <ChevronRightIcon size={15} className="payslip-touch-chevron" />
                  </span>
                </Link>
              ))}
            </div>
          </div>
        ))
      )}
    </section>
  )
}
