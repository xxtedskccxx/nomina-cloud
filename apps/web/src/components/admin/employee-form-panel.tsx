'use client'

/*
PANEL DE FICHA DE EMPLEADO — RECURSOS HUMANOS
=====================================================================
Drawer lateral accesible, amigable y claro.
Incluye avatar en tiempo real y vista previa interactiva del nombre
de archivo PDF para que el usuario entienda con total claridad cómo
vincular sus recibos de nómina.
*/

import { useEffect, useMemo, useRef, useState } from 'react'
import type { Department, EmployeeFull, Position } from '@/lib/payslip-types'
import {
  BuildingIcon,
  CalendarIcon,
  CloseIcon,
  IdCardIcon,
  MailIcon,
  PersonIcon,
  PhoneIcon,
  SparklesIcon,
} from '@/components/ui/icons'
import { Alert } from '@/components/ui/primitives'

interface EmployeeFormValues {
  employeeCode: string
  firstName: string
  lastName: string
  email: string
  phone: string
  documentType: string
  documentNumber: string
  hireDate: string
  status: 'ACTIVE' | 'INACTIVE' | 'TERMINATED'
  departmentId: string
  positionId: string
}

function initValues(emp?: EmployeeFull): EmployeeFormValues {
  return {
    employeeCode: emp?.employeeCode ?? '',
    firstName: emp?.firstName ?? '',
    lastName: emp?.lastName ?? '',
    email: emp?.email ?? '',
    phone: emp?.phone ?? '',
    documentType: emp?.documentType ?? 'DNI',
    documentNumber: emp?.documentNumber ?? '',
    hireDate: emp?.hireDate ? emp.hireDate.slice(0, 10) : new Date().toISOString().slice(0, 10),
    status: emp?.status ?? 'ACTIVE',
    departmentId: emp?.departmentId ?? '',
    positionId: emp?.positionId ?? '',
  }
}

const STATUS_LABELS: Record<EmployeeFormValues['status'], string> = {
  ACTIVE: '🟢 Activo (laborando actualmente)',
  INACTIVE: '⚪ Inactivo (licencia / suspendido)',
  TERMINATED: '🔴 Retirado / Liquidado',
}

function getInitials(first: string, last: string): string {
  const f = first?.trim()[0] ?? ''
  const l = last?.trim()[0] ?? ''
  return (f + l).toUpperCase() || '👤'
}

export function EmployeeFormPanel({
  open,
  employee,
  departments,
  positions,
  onClose,
  onSaved,
}: {
  open: boolean
  employee?: EmployeeFull | null
  departments: Department[]
  positions: Position[]
  onClose: () => void
  onSaved: () => void
}) {
  const isEdit = Boolean(employee)
  const [values, setValues] = useState<EmployeeFormValues>(() => initValues(employee ?? undefined))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const firstInputRef = useRef<HTMLInputElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open) {
      setValues(initValues(employee ?? undefined))
      setError(null)
      setSaving(false)
      setTimeout(() => firstInputRef.current?.focus(), 100)
    }
  }, [open, employee])

  useEffect(() => {
    if (!open) return undefined
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  useEffect(() => {
    if (!open) return undefined
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [open])

  function set<K extends keyof EmployeeFormValues>(key: K, value: EmployeeFormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }))
  }

  async function handleSave() {
    setError(null)
    setSaving(true)

    const cleanCode = values.employeeCode.trim().toUpperCase()
    const cleanFirst = values.firstName.trim()
    const cleanLast = values.lastName.trim()

    if (!cleanCode) {
      setError('Por favor indica un código de empleado (ej: EMP-001 o DEV-EMP-00001).')
      setSaving(false)
      return
    }
    if (!cleanFirst) {
      setError('El nombre del colaborador es requerido.')
      setSaving(false)
      return
    }
    if (!cleanLast) {
      setError('El apellido del colaborador es requerido.')
      setSaving(false)
      return
    }
    if (!values.hireDate) {
      setError('La fecha de ingreso a la empresa es requerida.')
      setSaving(false)
      return
    }

    const body: Record<string, unknown> = {
      employeeCode: cleanCode,
      firstName: cleanFirst,
      lastName: cleanLast,
      hireDate: values.hireDate,
      status: values.status,
      ...(values.email.trim() ? { email: values.email.trim() } : {}),
      ...(values.phone.trim() ? { phone: values.phone.trim() } : {}),
      ...(values.documentType.trim() && values.documentNumber.trim()
        ? { documentType: values.documentType.trim(), documentNumber: values.documentNumber.trim() }
        : {}),
      departmentId: values.departmentId || null,
      positionId: values.positionId || null,
    }

    try {
      const url = isEdit
        ? `/api-backend/employees/${employee!.id}`
        : '/api-backend/employees'
      const method = isEdit ? 'PATCH' : 'POST'

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        const msg = data?.message ?? `Error al guardar (código ${res.status})`
        setError(Array.isArray(msg) ? msg.join(', ') : String(msg))
        setSaving(false)
        return
      }

      onSaved()
    } catch {
      setError('Error de conexión con el servidor. Comprueba la red e inténtalo de nuevo.')
      setSaving(false)
    }
  }

  const liveInitials = useMemo(() => {
    return getInitials(values.firstName, values.lastName)
  }, [values.firstName, values.lastName])

  const previewFilename = useMemo(() => {
    const code = values.employeeCode.trim() || 'DEV-EMP-00001'
    return `Volante_${code}_Septiembre2026.pdf`
  }, [values.employeeCode])

  if (!open) return null

  return (
    <>
      <div className="emp-panel-backdrop" onClick={onClose} aria-hidden="true" />

      <div
        ref={panelRef}
        className="emp-panel"
        role="dialog"
        aria-modal="true"
        aria-label={isEdit ? 'Editar ficha de empleado' : 'Nuevo registro de empleado'}
      >
        {/* Cabecera del Panel con Avatar en vivo */}
        <div className="emp-panel-head">
          <div className="emp-panel-header-content">
            <div className="emp-panel-live-avatar" aria-hidden="true">
              {liveInitials}
            </div>
            <div>
              <span className="emp-panel-subtitle">
                {isEdit ? 'Editar Colaborador' : 'Nuevo Colaborador'}
              </span>
              <h2 className="emp-panel-title">
                {values.firstName || values.lastName
                  ? `${values.firstName} ${values.lastName}`.trim()
                  : 'Ficha de Empleado'}
              </h2>
            </div>
          </div>
          <button
            type="button"
            className="button button-quiet button-small"
            onClick={onClose}
            aria-label="Cerrar formulario"
          >
            <CloseIcon size={16} />
          </button>
        </div>

        {/* Cuerpo del Formulario */}
        <div className="emp-panel-body">
          {/* SECCIÓN 1: Identificador de Nómina (Código para vincular con PDFs) */}
          <div className="emp-form-card emp-form-card--highlight">
            <div className="emp-form-card-head">
              <div className="emp-form-card-badge">Paso 1</div>
              <strong className="emp-form-card-title">Código de Nómina (Para PDFs)</strong>
            </div>

            <div className="field">
              <label className="field-label" htmlFor="empCode">
                Código Único del Empleado <span className="emp-required">*</span>
              </label>
              <input
                ref={firstInputRef}
                id="empCode"
                className="input input-code-large"
                type="text"
                placeholder="Ej: DEV-EMP-00001 o EMP-001"
                value={values.employeeCode}
                onChange={(e) => set('employeeCode', e.target.value.toUpperCase())}
                disabled={saving}
                autoCapitalize="characters"
                spellCheck={false}
              />
            </div>

            {/* Vista previa en vivo del archivo de nómina */}
            <div className="emp-pdf-preview-box">
              <div className="emp-pdf-preview-head">
                <SparklesIcon size={14} />
                <span>¿Cómo debe nombrarse el PDF de este empleado?</span>
              </div>
              <div className="emp-pdf-preview-file">
                <span className="emp-pdf-preview-icon">📄</span>
                <code className="emp-pdf-preview-name">{previewFilename}</code>
              </div>
              <p className="emp-pdf-preview-hint">
                Al subir la nómina, el sistema reconocerá el código <strong>{values.employeeCode || '...'}</strong> y vinculará el volante automáticamente.
              </p>
            </div>
          </div>

          {/* SECCIÓN 2: Información Personal */}
          <div className="emp-form-card">
            <div className="emp-form-card-head">
              <PersonIcon size={16} className="emp-form-icon" />
              <strong className="emp-form-card-title">Datos Personales</strong>
            </div>

            <div className="emp-form-grid">
              <div className="field">
                <label className="field-label" htmlFor="empFirst">
                  Nombre(s) <span className="emp-required">*</span>
                </label>
                <input
                  id="empFirst"
                  className="input"
                  type="text"
                  placeholder="Ej: Carlos"
                  value={values.firstName}
                  onChange={(e) => set('firstName', e.target.value)}
                  disabled={saving}
                />
              </div>
              <div className="field">
                <label className="field-label" htmlFor="empLast">
                  Apellido(s) <span className="emp-required">*</span>
                </label>
                <input
                  id="empLast"
                  className="input"
                  type="text"
                  placeholder="Ej: Rodríguez"
                  value={values.lastName}
                  onChange={(e) => set('lastName', e.target.value)}
                  disabled={saving}
                />
              </div>
            </div>

            <div className="emp-form-grid">
              <div className="field">
                <label className="field-label" htmlFor="empMail">
                  <MailIcon size={12} /> Correo Electrónico
                </label>
                <input
                  id="empMail"
                  className="input"
                  type="email"
                  placeholder="carlos@empresa.com"
                  value={values.email}
                  onChange={(e) => set('email', e.target.value)}
                  disabled={saving}
                />
              </div>
              <div className="field">
                <label className="field-label" htmlFor="empPhone">
                  <PhoneIcon size={12} /> Teléfono Móvil
                </label>
                <input
                  id="empPhone"
                  className="input"
                  type="tel"
                  placeholder="+58 412 1234567"
                  value={values.phone}
                  onChange={(e) => set('phone', e.target.value)}
                  disabled={saving}
                />
              </div>
            </div>
          </div>

          {/* SECCIÓN 3: Documento de Identidad */}
          <div className="emp-form-card">
            <div className="emp-form-card-head">
              <IdCardIcon size={16} className="emp-form-icon" />
              <strong className="emp-form-card-title">Documento de Identidad</strong>
            </div>

            <div className="emp-form-grid emp-form-grid--doc">
              <div className="field">
                <label className="field-label" htmlFor="empDocType">Tipo</label>
                <select
                  id="empDocType"
                  className="select"
                  value={values.documentType}
                  onChange={(e) => set('documentType', e.target.value)}
                  disabled={saving}
                >
                  <option value="DNI">Cédula / DNI</option>
                  <option value="RIF">RIF</option>
                  <option value="PASSPORT">Pasaporte</option>
                  <option value="CE">Cédula Extranjera</option>
                  <option value="OTHER">Otro Documento</option>
                </select>
              </div>
              <div className="field">
                <label className="field-label" htmlFor="empDocNum">Número de Documento</label>
                <input
                  id="empDocNum"
                  className="input"
                  type="text"
                  placeholder="V-18.456.789"
                  value={values.documentNumber}
                  onChange={(e) => set('documentNumber', e.target.value)}
                  disabled={saving}
                />
              </div>
            </div>
          </div>

          {/* SECCIÓN 4: Cargo y Departamento */}
          <div className="emp-form-card">
            <div className="emp-form-card-head">
              <BuildingIcon size={16} className="emp-form-icon" />
              <strong className="emp-form-card-title">Ubicación Organizacional</strong>
            </div>

            <div className="emp-form-grid">
              <div className="field">
                <label className="field-label" htmlFor="empDept">Departamento</label>
                <select
                  id="empDept"
                  className="select"
                  value={values.departmentId}
                  onChange={(e) => set('departmentId', e.target.value)}
                  disabled={saving}
                >
                  <option value="">Seleccionar departamento...</option>
                  {departments.filter((d) => d.isActive).map((d) => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label className="field-label" htmlFor="empPos">Cargo / Posición</label>
                <select
                  id="empPos"
                  className="select"
                  value={values.positionId}
                  onChange={(e) => set('positionId', e.target.value)}
                  disabled={saving}
                >
                  <option value="">Seleccionar cargo...</option>
                  {positions.filter((p) => p.isActive).map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* SECCIÓN 5: Empleo y Estado */}
          <div className="emp-form-card">
            <div className="emp-form-card-head">
              <CalendarIcon size={16} className="emp-form-icon" />
              <strong className="emp-form-card-title">Estatus Laboral</strong>
            </div>

            <div className="emp-form-grid">
              <div className="field">
                <label className="field-label" htmlFor="empHire">
                  Fecha de Ingreso <span className="emp-required">*</span>
                </label>
                <input
                  id="empHire"
                  className="input"
                  type="date"
                  value={values.hireDate}
                  onChange={(e) => set('hireDate', e.target.value)}
                  disabled={saving}
                />
              </div>
              <div className="field">
                <label className="field-label" htmlFor="empStatus">Estado en Empresa</label>
                <select
                  id="empStatus"
                  className="select"
                  value={values.status}
                  onChange={(e) => set('status', e.target.value as EmployeeFormValues['status'])}
                  disabled={saving}
                >
                  {(Object.keys(STATUS_LABELS) as EmployeeFormValues['status'][]).map((k) => (
                    <option key={k} value={k}>{STATUS_LABELS[k]}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {error && (
            <Alert tone="risk" title="Atención requerida">
              {error}
            </Alert>
          )}
        </div>

        {/* Pie con botones grandes y claros */}
        <div className="emp-panel-foot">
          <button
            type="button"
            className="button button-secondary"
            onClick={onClose}
            disabled={saving}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="button button-primary button-save-emp"
            onClick={() => void handleSave()}
            disabled={saving}
          >
            {saving ? 'Guardando ficha…' : isEdit ? 'Guardar Cambios' : 'Registrar Empleado'}
          </button>
        </div>
      </div>
    </>
  )
}
