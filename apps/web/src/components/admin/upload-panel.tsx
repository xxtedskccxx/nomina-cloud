'use client'

import { useState, type ChangeEvent, type DragEvent, type ReactNode } from 'react'
import { humanFileSize } from '@/lib/api'
import { employeeName, explainMessage, plural } from '@/lib/payroll-view'
import type { EmployeeSummary } from '@/lib/payslip-types'
import {
  AlertIcon,
  CheckCircleIcon,
  DocumentIcon,
  ErrorIcon,
  RetryIcon,
  UploadIcon,
} from '@/components/ui/icons'
import { Alert, ProgressBar, StatusPill, type Tone } from '@/components/ui/primitives'

export type LocalUploadStatus =
  | 'queued'
  | 'uploading'
  | 'done'
  | 'needs-review'
  | 'duplicate'
  | 'invalid'
  | 'error'

export interface LocalUpload {
  id: string
  file: File
  status: LocalUploadStatus
  message?: string
  payslipId?: string | null
  duplicateOfPayslipId?: string
  employee?: EmployeeSummary | null
  batchItemId?: string
}

export interface UploadOutcome {
  total: number
  matched: number
  review: number
  duplicate: number
  invalid: number
  failed: number
}

const localStatus: Record<LocalUploadStatus, { label: string; tone: Tone; help: string }> = {
  queued: { label: 'En espera', tone: 'neutral', help: 'Todavía no se ha subido.' },
  uploading: { label: 'Subiendo', tone: 'info', help: 'Enviando el archivo…' },
  done: { label: 'Asignado', tone: 'ok', help: 'Quedó asociado a su empleado.' },
  'needs-review': {
    label: 'Sin identificar',
    tone: 'warn',
    help: 'No reconocimos a qué empleado pertenece.',
  },
  duplicate: {
    label: 'Posible duplicado',
    tone: 'warn',
    help: 'Ya existe un volante para ese empleado en este período.',
  },
  invalid: { label: 'PDF inválido', tone: 'risk', help: 'El archivo no es un PDF legible.' },
  error: { label: 'Falló la carga', tone: 'risk', help: 'La subida se interrumpió.' },
}

/*
La carga es el momento de mayor ansiedad del proceso: son cientos de
documentos de salario. Por eso el panel muestra siempre, en este orden,
cuántos archivos hay, cuántos van y qué pasó con cada uno al terminar.
Nunca se declara "listo" por la desaparición de un spinner.
*/
export function UploadPanel({
  files,
  isUploading,
  progressDone,
  progressTotal,
  outcome,
  locked,
  hasPeriod,
  onAdd,
  onUpload,
  onClearQueue,
  onRemove,
  onRetryFailed,
}: {
  files: LocalUpload[]
  isUploading: boolean
  progressDone: number
  progressTotal: number
  outcome: UploadOutcome | null
  locked: boolean
  hasPeriod: boolean
  onAdd: (files: FileList | File[]) => void
  onUpload: () => void
  onClearQueue: () => void
  onRemove: (id: string) => void
  onRetryFailed: () => void
}) {
  const [isDragging, setIsDragging] = useState(false)
  const queued = files.filter((upload) => upload.status === 'queued')
  const failed = files.filter((upload) => upload.status === 'error')
  const inFlight = files.filter((upload) => upload.status === 'uploading').length
  const disabled = locked || !hasPeriod

  function handleDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault()
    setIsDragging(false)
    if (!disabled) onAdd(event.dataTransfer.files)
  }

  function handlePick(event: ChangeEvent<HTMLInputElement>) {
    if (event.currentTarget.files) onAdd(event.currentTarget.files)
    event.currentTarget.value = ''
  }

  return (
    <section className="panel area-upload" aria-labelledby="upload-title" id="upload">
      <div className="panel-head">
        <div>
          <h2 className="title-section" id="upload-title">
            Subir volantes
          </h2>
          <p className="meta-tight">
            PDFs generados por tu sistema de nómina. Los asignamos por código de empleado.
          </p>
        </div>
        {files.length > 0 ? (
          <span className="meta-tight num">
            {files.length} {plural(files.length, 'archivo', 'archivos')}
          </span>
        ) : null}
      </div>

      <div className="panel-body stack">
        {locked ? (
          <Alert tone="warn" title="Este período está bloqueado">
            No acepta cargas nuevas. Ábrelo desde la configuración de nómina para seguir.
          </Alert>
        ) : null}

        <label
          className={`dropzone${isDragging ? ' dropzone-active' : ''}${
            disabled ? ' dropzone-disabled' : ''
          }`}
          htmlFor="payslip-files"
          onDragEnter={(event) => {
            event.preventDefault()
            if (!disabled) setIsDragging(true)
          }}
          onDragOver={(event) => event.preventDefault()}
          onDragLeave={(event) => {
            event.preventDefault()
            setIsDragging(false)
          }}
          onDrop={handleDrop}
        >
          <input
            id="payslip-files"
            type="file"
            accept="application/pdf,.pdf"
            multiple
            disabled={disabled}
            onChange={handlePick}
          />
          <span className="dropzone-mark" aria-hidden="true">
            <UploadIcon size={18} />
          </span>
          <strong>Arrastra los PDFs aquí</strong>
          <span className="hint">
            {hasPeriod
              ? 'Puedes soltar el lote completo de la quincena de una sola vez.'
              : 'Elige primero un período de nómina.'}
          </span>
          <span className="button button-secondary" aria-hidden="true">
            Elegir archivos
          </span>
        </label>

        {isUploading ? (
          <div className="upload-progress" role="status" aria-live="polite">
            <p className="upload-progress-head">
              <span>Subiendo archivos…</span>
              <span className="num">
                {progressDone} / {progressTotal}
              </span>
            </p>
            <ProgressBar value={progressDone} max={progressTotal} label="Progreso de la carga" />
            <p className="meta-tight">
              {inFlight > 0
                ? `${inFlight} ${plural(inFlight, 'archivo en curso', 'archivos en curso')}. Los ya subidos quedan guardados.`
                : 'Preparando la tanda…'}
            </p>
          </div>
        ) : null}

        {outcome && !isUploading ? <UploadOutcomeSummary outcome={outcome} /> : null}

        {files.length > 0 ? (
          <div className="file-list">
            {files.map((upload) => {
              const state = localStatus[upload.status]
              return (
                <div className="file-row" key={upload.id}>
                  <div className="file-row-main">
                    <span className="file-icon" aria-hidden="true">
                      <DocumentIcon size={16} />
                    </span>
                    <div className="file-row-text">
                      <strong title={upload.file.name}>{upload.file.name}</strong>
                      <p className="meta-tight">
                        {humanFileSize(upload.file.size)}
                        {upload.employee
                          ? ` · ${upload.employee.employeeCode} ${employeeName(upload.employee)}`
                          : ''}
                        {upload.status === 'queued'
                          ? ''
                          : ` · ${explainMessage(upload.message, state.help)}`}
                      </p>
                    </div>
                  </div>
                  <div className="file-row-actions">
                    <StatusPill tone={state.tone} label={state.label} />
                    {upload.status === 'queued' ? (
                      <button
                        className="button button-quiet button-small"
                        onClick={() => onRemove(upload.id)}
                        type="button"
                      >
                        Quitar
                      </button>
                    ) : null}
                  </div>
                </div>
              )
            })}
          </div>
        ) : null}
      </div>

      {files.length > 0 ? (
        <div className="panel-foot">
          <span className="meta-tight">
            {queued.length > 0
              ? `${queued.length} ${plural(queued.length, 'archivo sin subir', 'archivos sin subir')}`
              : 'Todos los archivos de esta tanda fueron procesados.'}
          </span>
          <div className="row">
            {failed.length > 0 ? (
              <button
                className="button button-secondary"
                onClick={onRetryFailed}
                disabled={isUploading}
                type="button"
              >
                <RetryIcon size={14} />
                Reintentar {failed.length} {plural(failed.length, 'fallido', 'fallidos')}
              </button>
            ) : null}
            {queued.length > 0 ? (
              <>
                <button
                  className="button button-quiet"
                  onClick={onClearQueue}
                  disabled={isUploading}
                  type="button"
                >
                  Vaciar cola
                </button>
                <button
                  className="button button-primary"
                  onClick={onUpload}
                  disabled={isUploading || disabled}
                  type="button"
                >
                  {isUploading
                    ? 'Subiendo…'
                    : `Subir ${queued.length} ${plural(queued.length, 'archivo', 'archivos')}`}
                </button>
              </>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  )
}

/* El resultado de una tanda, en cifras, sin obligar a leer fila por fila. */
function UploadOutcomeSummary({ outcome }: { outcome: UploadOutcome }) {
  const problems = outcome.review + outcome.duplicate + outcome.invalid + outcome.failed
  return (
    <div
      className={`alert alert-${problems === 0 ? 'ok' : 'warn'}`}
      role="status"
      aria-live="polite"
    >
      <span className="alert-icon">
        {problems === 0 ? <CheckCircleIcon size={18} /> : <AlertIcon size={18} />}
      </span>
      <div className="alert-body">
        <strong>
          Carga finalizada · {outcome.total} {plural(outcome.total, 'archivo', 'archivos')}{' '}
          {plural(outcome.total, 'procesado', 'procesados')}
        </strong>
        <p>
          {problems === 0
            ? 'Todos los archivos se asignaron a su empleado.'
            : `${problems} ${plural(problems, 'archivo necesita', 'archivos necesitan')} una decisión tuya antes de publicar.`}
        </p>
        <div className="outcome-grid">
          <OutcomeItem
            value={outcome.matched}
            label="asignados"
            icon={<CheckCircleIcon size={12} />}
            tone="ok"
          />
          {outcome.review > 0 ? (
            <OutcomeItem
              value={outcome.review}
              label="sin identificar"
              icon={<AlertIcon size={12} />}
              tone="warn"
            />
          ) : null}
          {outcome.duplicate > 0 ? (
            <OutcomeItem
              value={outcome.duplicate}
              label="duplicados"
              icon={<AlertIcon size={12} />}
              tone="warn"
            />
          ) : null}
          {outcome.invalid > 0 ? (
            <OutcomeItem
              value={outcome.invalid}
              label="PDFs inválidos"
              icon={<ErrorIcon size={12} />}
              tone="risk"
            />
          ) : null}
          {outcome.failed > 0 ? (
            <OutcomeItem
              value={outcome.failed}
              label="fallaron"
              icon={<ErrorIcon size={12} />}
              tone="risk"
            />
          ) : null}
        </div>
      </div>
    </div>
  )
}

function OutcomeItem({
  value,
  label,
  icon,
  tone,
}: {
  value: number
  label: string
  icon: ReactNode
  tone: Tone
}) {
  return (
    <span className="outcome-item">
      <span className={`status status-${tone}`} aria-hidden="true">
        {icon}
      </span>
      <span className="outcome-value num">{value}</span>
      <span className="meta-tight">{label}</span>
    </span>
  )
}
