'use client'

import { useMemo, useState } from 'react'
import { apiRequest } from '@/lib/api'
import {
  countByKind,
  describeError,
  employeeName,
  explainMessage,
  itemStatusLabel,
  plural,
} from '@/lib/payroll-view'
import type { AttentionKind } from '@/lib/payroll-view'
import type { EmployeeSummary, PayslipUploadBatchItem } from '@/lib/payslip-types'
import { DocumentIcon, RetryIcon, SearchIcon, UploadIcon } from '@/components/ui/icons'
import { Alert, StatusPill } from '@/components/ui/primitives'

const kindLabel: Record<AttentionKind, string> = {
  NEEDS_REVIEW: 'Sin identificar',
  DUPLICATE: 'Duplicados',
  INVALID: 'PDF inválido',
  FAILED: 'Falló la carga',
}

const kindTone: Record<AttentionKind, 'warn' | 'risk'> = {
  NEEDS_REVIEW: 'warn',
  DUPLICATE: 'warn',
  INVALID: 'risk',
  FAILED: 'risk',
}

/*
Diseño por excepción: si 247 archivos salieron bien y 3 no, el trabajo
son esos 3. Este panel se coloca por encima de la carga y de la lista
completa, agrupa los problemas por tipo y da la acción concreta de cada
uno. Los archivos correctos ya están guardados y no se tocan.
*/
export function AttentionPanel({
  items,
  replaceBusyId,
  onResolved,
  onReplace,
  onRetryFailed,
}: {
  items: PayslipUploadBatchItem[]
  replaceBusyId: string
  onResolved: () => void
  onReplace: (item: PayslipUploadBatchItem, file: File) => void
  onRetryFailed: (itemIds?: string[]) => void
}) {
  const counts = useMemo(() => countByKind(items), [items])
  const kinds = (Object.keys(kindLabel) as AttentionKind[]).filter((kind) => counts[kind] > 0)
  const [activeKind, setActiveKind] = useState<AttentionKind | null>(null)
  const currentKind = activeKind && counts[activeKind] > 0 ? activeKind : (kinds[0] ?? null)
  const visible = items.filter((item) => item.status === currentKind)

  if (items.length === 0 || !currentKind) return null

  return (
    <section
      className="panel panel-warn area-attention"
      aria-labelledby="attention-title"
      id="attention"
    >
      <div className="panel-head">
        <div>
          <h2 className="title-section" id="attention-title">
            Requiere tu atención
          </h2>
          <p className="meta-tight">
            {items.length} de esta tanda {plural(items.length, 'no pudo', 'no pudieron')} resolverse
            solo. El resto ya quedó guardado.
          </p>
        </div>
        <StatusPill
          tone="warn"
          label={`${items.length} ${plural(items.length, 'pendiente', 'pendientes')}`}
        />
      </div>

      {kinds.length > 1 ? (
        <div className="attention-tabs" role="tablist" aria-label="Tipos de excepción">
          {kinds.map((kind) => (
            <button
              key={kind}
              className="attention-tab"
              role="tab"
              type="button"
              aria-selected={kind === currentKind}
              onClick={() => setActiveKind(kind)}
            >
              {kindLabel[kind]}
              <span className={`attention-tab-count attention-tab-count-${kindTone[kind]}`}>
                {counts[kind]}
              </span>
            </button>
          ))}
        </div>
      ) : null}

      <div>
        {visible.map((item) => (
          <ExceptionRow
            key={item.id}
            item={item}
            replaceBusy={replaceBusyId === item.id}
            onResolved={onResolved}
            onReplace={onReplace}
            onRetryFailed={onRetryFailed}
          />
        ))}
      </div>
    </section>
  )
}

function ExceptionRow({
  item,
  replaceBusy,
  onResolved,
  onReplace,
  onRetryFailed,
}: {
  item: PayslipUploadBatchItem
  replaceBusy: boolean
  onResolved: () => void
  onReplace: (item: PayslipUploadBatchItem, file: File) => void
  onRetryFailed: (itemIds?: string[]) => void
}) {
  const state = itemStatusLabel(item.status)

  return (
    <div className="exception">
      <div className="exception-head">
        <div className="exception-file">
          <span className="file-icon" aria-hidden="true">
            <DocumentIcon size={16} />
          </span>
          <div className="file-row-text">
            <strong title={item.originalFileName}>{item.originalFileName}</strong>
            <p className="meta-tight">{explainMessage(item.message, state.help)}</p>
          </div>
        </div>
        <StatusPill tone={state.tone} label={state.label} />
      </div>

      {item.code || item.employee ? (
        <dl className="exception-detail">
          {item.code ? (
            <div>
              <dt>Código detectado</dt>
              <dd>{item.code}</dd>
            </div>
          ) : null}
          {item.employee ? (
            <div>
              <dt>Empleado</dt>
              <dd>
                {item.employee.employeeCode} · {employeeName(item.employee)}
              </dd>
            </div>
          ) : null}
        </dl>
      ) : null}

      {item.status === 'NEEDS_REVIEW' ? (
        <EmployeeMatcher
          fileName={item.originalFileName}
          payslipId={item.payslipId}
          onMatched={onResolved}
        />
      ) : null}

      {item.status === 'DUPLICATE' ? (
        <div className="stack-tight">
          <p className="hint">
            Ya existe un volante para este empleado en este período. Si no haces nada, se mantiene
            el volante actual y este archivo se descarta. Si lo reemplazas, el anterior queda
            archivado y el nuevo entra como borrador hasta que publiques.
          </p>
          <div className="row">
            <label className="button button-secondary">
              <UploadIcon size={14} />
              {replaceBusy ? 'Reemplazando…' : 'Reemplazar el volante actual'}
              <input
                className="visually-hidden"
                type="file"
                accept="application/pdf,.pdf"
                disabled={replaceBusy || !item.duplicateOfPayslipId}
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0]
                  if (file) onReplace(item, file)
                  event.currentTarget.value = ''
                }}
              />
            </label>
          </div>
        </div>
      ) : null}

      {item.status === 'INVALID' ? (
        <p className="hint">
          Vuelve a generar este documento desde tu sistema de nómina y súbelo otra vez. No hace
          falta repetir la tanda completa.
        </p>
      ) : null}

      {item.status === 'FAILED' ? (
        <div className="row">
          <button
            className="button button-secondary"
            onClick={() => onRetryFailed([item.id])}
            type="button"
          >
            <RetryIcon size={14} />
            Reintentar este archivo
          </button>
        </div>
      ) : null}
    </div>
  )
}

/*
Asignación manual: el sistema nunca adivina. Se busca por código,
nombre o apellido y se elige explícitamente a la persona.
*/
function EmployeeMatcher({
  fileName,
  payslipId,
  onMatched,
}: {
  fileName: string
  payslipId: string | null
  onMatched: () => void
}) {
  const [term, setTerm] = useState('')
  const [results, setResults] = useState<EmployeeSummary[]>([])
  const [searched, setSearched] = useState(false)
  const [isSearching, setIsSearching] = useState(false)
  const [isMatching, setIsMatching] = useState(false)
  const [error, setError] = useState('')

  async function search() {
    if (!term.trim()) return
    setIsSearching(true)
    setError('')
    try {
      const response = await apiRequest<{ data: EmployeeSummary[] }>(
        `/employees?page=1&pageSize=8&search=${encodeURIComponent(term.trim())}`,
      )
      setResults(response.data)
      setSearched(true)
    } catch {
      setError('No pudimos buscar empleados. Revisa tu conexión e inténtalo otra vez.')
    } finally {
      setIsSearching(false)
    }
  }

  async function assign(employee: EmployeeSummary) {
    if (!payslipId) return
    setIsMatching(true)
    setError('')
    try {
      await apiRequest(`/payslips/${payslipId}/match`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employeeId: employee.id }),
      })
      onMatched()
    } catch (requestError) {
      setError(describeError(requestError, 'No pudimos asignar el empleado. Inténtalo otra vez.'))
    } finally {
      setIsMatching(false)
    }
  }

  return (
    <div className="stack-tight">
      <div className="search-row">
        <input
          className="input"
          aria-label={`Buscar empleado para ${fileName}`}
          placeholder="Código, nombre o apellido"
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              void search()
            }
          }}
        />
        <button
          className="button button-secondary"
          onClick={() => void search()}
          disabled={isSearching || !term.trim()}
          type="button"
        >
          <SearchIcon size={14} />
          {isSearching ? 'Buscando…' : 'Buscar'}
        </button>
      </div>

      {results.length > 0 ? (
        <div className="result-list">
          {results.map((employee) => (
            <button
              className="result-option"
              key={employee.id}
              onClick={() => void assign(employee)}
              disabled={isMatching}
              type="button"
            >
              <span>
                <strong>{employee.employeeCode}</strong>
                <span className="meta-tight"> · {employeeName(employee)}</span>
                {employee.department ? (
                  <span className="meta-tight"> · {employee.department.name}</span>
                ) : null}
              </span>
              <span className="meta-tight">Asignar</span>
            </button>
          ))}
        </div>
      ) : null}

      {searched && results.length === 0 && !isSearching ? (
        <p className="meta-tight">
          Ningún empleado coincide con «{term}». Prueba con el código completo.
        </p>
      ) : null}

      {error ? (
        <Alert tone="risk" title="No pudimos completar la acción">
          {error}
        </Alert>
      ) : null}
    </div>
  )
}
