'use client'

/*
WORKSPACE DE EMPLEADOS — RECURSOS HUMANOS
=====================================================================
Diseño intuitivo, moderno y amigable para gestión de personal.
Permite visualizar colaboradores, buscar, crear nuevos empleados y
vincular sus códigos para el procesamiento automático de nóminas en PDF.
*/

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { PortalHeader } from './portal-header'
import { EmployeeFormPanel } from './admin/employee-form-panel'
import { StatusPill, EmptyState, Skeleton } from './ui/primitives'
import {
  BuildingIcon,
  CopyIcon,
  CheckIcon,
  ExternalIcon,
  MailIcon,
  PersonIcon,
  PhoneIcon,
  PlusIcon,
  SearchIcon,
  SparklesIcon,
  UsersIcon,
} from './ui/icons'
import type {
  Department,
  DepartmentListResponse,
  EmployeeFull,
  EmployeeListResponse,
  Position,
  PositionListResponse,
} from '@/lib/payslip-types'

const STATUS_TONE = {
  ACTIVE: 'ok',
  INACTIVE: 'neutral',
  TERMINATED: 'risk',
} as const

const STATUS_LABEL = {
  ACTIVE: 'Activo',
  INACTIVE: 'Inactivo',
  TERMINATED: 'Terminado',
} as const

const PAGE_SIZE = 20

function getInitials(first: string, last: string): string {
  const f = first?.trim()[0] ?? ''
  const l = last?.trim()[0] ?? ''
  return (f + l).toUpperCase() || 'EM'
}

export function AdminEmployeesWorkspace() {
  const [employees, setEmployees] = useState<EmployeeFull[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [draftSearch, setDraftSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [deptFilter, setDeptFilter] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [departments, setDepartments] = useState<Department[]>([])
  const [positions, setPositions] = useState<Position[]>([])
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<EmployeeFull | null>(null)
  const [copiedCode, setCopiedCode] = useState<string | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  /* Cargar departamentos y cargos */
  useEffect(() => {
    async function loadMeta() {
      try {
        const [dr, pr] = await Promise.all([
          fetch('/api-backend/departments', { credentials: 'include' }),
          fetch('/api-backend/positions', { credentials: 'include' }),
        ])
        if (dr.ok) {
          const d: DepartmentListResponse = await dr.json()
          setDepartments(d.data)
        }
        if (pr.ok) {
          const p: PositionListResponse = await pr.json()
          setPositions(p.data)
        }
      } catch { /* ignorar */ }
    }
    void loadMeta()
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(PAGE_SIZE),
        ...(search ? { search } : {}),
        ...(statusFilter ? { status: statusFilter } : {}),
        ...(deptFilter ? { departmentId: deptFilter } : {}),
      })
      const res = await fetch(`/api-backend/employees?${params}`, { credentials: 'include' })
      if (!res.ok) return
      const data: EmployeeListResponse = await res.json()
      setEmployees(data.data)
      setTotal(data.pagination.total)
    } finally {
      setLoading(false)
    }
  }, [page, search, statusFilter, deptFilter])

  useEffect(() => { void load() }, [load])

  /* Copiar código con feedback visual */
  function copyToClipboard(code: string) {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      void navigator.clipboard.writeText(code)
      setCopiedCode(code)
      setTimeout(() => setCopiedCode(null), 2000)
    }
  }

  /* Búsqueda con debounce */
  function handleSearchChange(value: string) {
    setDraftSearch(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setSearch(value)
      setPage(1)
    }, 300)
  }

  function openCreate() {
    setEditing(null)
    setFormOpen(true)
  }

  function openEdit(emp: EmployeeFull) {
    setEditing(emp)
    setFormOpen(true)
  }

  function handleSaved() {
    setFormOpen(false)
    void load()
  }

  const activeCount = useMemo(() => {
    return employees.filter(e => e.status === 'ACTIVE').length
  }, [employees])

  const totalPages = Math.ceil(total / PAGE_SIZE)

  return (
    <div style={{ minHeight: '100dvh', background: 'var(--canvas)' }}>
      <PortalHeader role="ADMIN" name="Recursos Humanos" />

      <main className="page">
        {/* Cabecera amigable con bienvenida y botón de acción principal */}
        <div className="admin-emp-hero">
          <div className="admin-emp-hero-text">
            <div className="admin-badge-role">
              <UsersIcon size={13} />
              <span>Gestión de Personal</span>
            </div>
            <h1 className="admin-emp-hero-title">Directorio de Empleados</h1>
            <p className="admin-emp-hero-desc">
              Administra el equipo y vincula los códigos que identifican los recibos de nómina en PDF.
            </p>
          </div>
          <div className="admin-emp-hero-actions">
            <button
              type="button"
              className="button button-primary button-large-emp"
              onClick={openCreate}
            >
              <PlusIcon size={16} />
              <span>Registrar Empleado</span>
            </button>
          </div>
        </div>

        {/* Tarjetas informativas amigables (KPIs) */}
        <div className="admin-stats-grid">
          <div className="admin-stat-card">
            <div className="admin-stat-icon-wrap" style={{ background: 'var(--accent-tint)', color: 'var(--accent)' }}>
              <UsersIcon size={20} />
            </div>
            <div>
              <div className="admin-stat-value">{loading ? '—' : total}</div>
              <div className="admin-stat-label">Total colaboradores</div>
            </div>
          </div>

          <div className="admin-stat-card">
            <div className="admin-stat-icon-wrap" style={{ background: 'var(--ok-tint)', color: 'var(--ok)' }}>
              <CheckIcon size={20} />
            </div>
            <div>
              <div className="admin-stat-value">{loading ? '—' : activeCount}</div>
              <div className="admin-stat-label">Colaboradores activos</div>
            </div>
          </div>

          <div className="admin-stat-card">
            <div className="admin-stat-icon-wrap" style={{ background: 'var(--info-tint)', color: 'var(--info)' }}>
              <BuildingIcon size={20} />
            </div>
            <div>
              <div className="admin-stat-value">{departments.length}</div>
              <div className="admin-stat-label">Departamentos registrados</div>
            </div>
          </div>
        </div>

        {/* Banner didáctico: Cómo funciona la vinculación de PDFs */}
        <div className="admin-guide-card">
          <div className="admin-guide-icon">
            <SparklesIcon size={22} />
          </div>
          <div className="admin-guide-content">
            <strong>¿Cómo se vinculan los PDFs con cada empleado?</strong>
            <p>
              El sistema analiza automáticamente el nombre del archivo PDF al subir la nómina. Si el archivo contiene el <strong>Código de Empleado</strong> (ej: <code>Nomina_DEV-EMP-00001_Sept.pdf</code>), se asignará directamente al colaborador correspondiente.
            </p>
          </div>
          <Link href="/admin/payslips" className="admin-guide-link">
            <span>Subir Volantes</span>
            <ExternalIcon size={14} />
          </Link>
        </div>

        {/* Barra de Búsqueda y Filtros con diseño claro */}
        <div className="emp-search-panel">
          <div className="emp-search-wrap">
            <SearchIcon size={16} className="emp-search-icon" />
            <input
              ref={searchRef}
              className="input emp-search-input"
              type="search"
              placeholder="Buscar por nombre, código o correo electrónico..."
              value={draftSearch}
              onChange={(e) => handleSearchChange(e.target.value)}
            />
            {draftSearch && (
              <button
                type="button"
                className="emp-search-clear"
                onClick={() => { setDraftSearch(''); setSearch(''); setPage(1) }}
                aria-label="Limpiar búsqueda"
              >
                ✕
              </button>
            )}
          </div>

          <div className="emp-filters-group">
            <select
              className="select emp-filter-select"
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(1) }}
            >
              <option value="">Todos los estados</option>
              <option value="ACTIVE">🟢 Solo Activos</option>
              <option value="INACTIVE">⚪ Inactivos</option>
              <option value="TERMINATED">🔴 Terminados</option>
            </select>

            <select
              className="select emp-filter-select"
              value={deptFilter}
              onChange={(e) => { setDeptFilter(e.target.value); setPage(1) }}
            >
              <option value="">Todos los departamentos</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Directorio / Tabla */}
        <div className="admin-table-panel">
          <div className="admin-table-head only-wide">
            <span>Colaborador</span>
            <span>Código de Nómina</span>
            <span>Departamento</span>
            <span>Cargo</span>
            <span>Estado</span>
            <span style={{ textAlign: 'right' }}>Acciones</span>
          </div>

          {loading ? (
            <div className="stack" style={{ padding: 'var(--space-5)', gap: 'var(--space-3)' }}>
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} block />
              ))}
            </div>
          ) : employees.length === 0 ? (
            <div style={{ padding: 'var(--space-8) var(--space-4)' }}>
              <EmptyState
                icon={<UsersIcon size={36} />}
                title={search ? 'No se encontraron colaboradores' : 'No hay empleados registrados'}
                description={
                  search
                    ? `No se encontró ningún empleado que coincida con "${search}". Revisa la ortografía o limpia el filtro.`
                    : 'Aún no se han agregado colaboradores. Haz clic en "Registrar Empleado" para comenzar.'
                }
                action={
                  search ? (
                    <button
                      type="button"
                      className="button button-secondary"
                      onClick={() => { setDraftSearch(''); setSearch(''); setPage(1) }}
                    >
                      Limpiar búsqueda
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="button button-primary"
                      onClick={openCreate}
                    >
                      <PlusIcon size={14} /> Registrar primer empleado
                    </button>
                  )
                }
              />
            </div>
          ) : (
            <ul className="admin-emp-list" role="list">
              {employees.map((emp) => {
                const initials = getInitials(emp.firstName, emp.lastName)
                const isCopied = copiedCode === emp.employeeCode

                return (
                  <li key={emp.id} className="admin-emp-card">
                    {/* Colaborador con Avatar Elegante */}
                    <div className="admin-emp-profile-col">
                      <div className="admin-emp-avatar" aria-hidden="true">
                        {initials}
                      </div>
                      <div className="admin-emp-info">
                        <strong className="admin-emp-fullname">
                          {emp.firstName} {emp.lastName}
                        </strong>
                        <div className="admin-emp-contact-row">
                          {emp.email && (
                            <span className="admin-emp-email" title={emp.email}>
                              <MailIcon size={12} /> {emp.email}
                            </span>
                          )}
                          {emp.phone && (
                            <span className="admin-emp-phone">
                              <PhoneIcon size={12} /> {emp.phone}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Código de Nómina con Botón de Copiar */}
                    <div className="admin-emp-code-col">
                      <span className="admin-emp-col-label">Código PDF</span>
                      <div
                        className="admin-emp-code-badge"
                        title="Haz clic para copiar el código"
                        onClick={() => copyToClipboard(emp.employeeCode)}
                      >
                        <code>{emp.employeeCode}</code>
                        <button
                          type="button"
                          className="admin-emp-copy-btn"
                          aria-label={`Copiar código ${emp.employeeCode}`}
                        >
                          {isCopied ? <CheckIcon size={13} style={{ color: 'var(--ok)' }} /> : <CopyIcon size={13} />}
                        </button>
                        {isCopied && <span className="admin-copied-tooltip">¡Copiado!</span>}
                      </div>
                    </div>

                    {/* Departamento */}
                    <div className="admin-emp-dept-col">
                      <span className="admin-emp-col-label">Departamento</span>
                      <span className="admin-emp-meta-value">
                        {emp.department ? (
                          <><BuildingIcon size={13} className="admin-emp-meta-icon" /> {emp.department.name}</>
                        ) : (
                          <span className="meta-faint">Sin asignar</span>
                        )}
                      </span>
                    </div>

                    {/* Cargo */}
                    <div className="admin-emp-pos-col">
                      <span className="admin-emp-col-label">Cargo</span>
                      <span className="admin-emp-meta-value">
                        {emp.position?.name ?? <span className="meta-faint">Sin cargo</span>}
                      </span>
                    </div>

                    {/* Estado */}
                    <div className="admin-emp-status-col">
                      <span className="admin-emp-col-label">Estado</span>
                      <StatusPill
                        tone={STATUS_TONE[emp.status]}
                        label={STATUS_LABEL[emp.status]}
                      />
                    </div>

                    {/* Acciones */}
                    <div className="admin-emp-actions-col">
                      <button
                        type="button"
                        className="button button-secondary button-small admin-emp-edit-btn"
                        onClick={() => openEdit(emp)}
                      >
                        Editar ficha
                      </button>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}

          {/* Paginación */}
          {totalPages > 1 && (
            <div className="panel-foot">
              <span className="meta">
                Mostrando página {page} de {totalPages} · ({total} colaboradores)
              </span>
              <div className="row">
                <button
                  type="button"
                  className="button button-secondary button-small"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  Anterior
                </button>
                <button
                  type="button"
                  className="button button-secondary button-small"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Siguiente
                </button>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Formulario lateral interactivo */}
      <EmployeeFormPanel
        open={formOpen}
        employee={editing}
        departments={departments}
        positions={positions}
        onClose={() => setFormOpen(false)}
        onSaved={handleSaved}
      />
    </div>
  )
}
