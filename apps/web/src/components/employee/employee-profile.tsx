'use client'

/*
PERFIL LABORAL DEL EMPLEADO
=====================================================================
Muestra los datos de empleo del empleado autenticado: cargo,
departamento, fechas, documento e información de contacto.
Todos los datos vienen de GET /employees/me — sin cálculos adicionales.
*/

import { useEffect, useState } from 'react'
import { apiRequest, formatSpanishDate } from '@/lib/api'
import type { EmployeeProfile } from '@/lib/payslip-types'
import {
  PersonIcon,
  BuildingIcon,
  CalendarIcon,
  IdCardIcon,
  PhoneIcon,
  MailIcon,
} from '@/components/ui/icons'
import { Alert, Skeleton } from '@/components/ui/primitives'

function statusLabel(status: EmployeeProfile['status']): { label: string; tone: string } {
  if (status === 'ACTIVE') return { label: 'Activo', tone: 'ok' }
  if (status === 'INACTIVE') return { label: 'Inactivo', tone: 'warn' }
  return { label: 'Terminado', tone: 'risk' }
}

interface ProfileRowProps {
  icon: React.ReactNode
  label: string
  value: string | null | undefined
  placeholder?: string
}

function ProfileRow({ icon, label, value, placeholder = '—' }: ProfileRowProps) {
  return (
    <div className="profile-row">
      <span className="profile-row-icon" aria-hidden="true">{icon}</span>
      <div className="profile-row-body">
        <span className="profile-row-label">{label}</span>
        <span className="profile-row-value">{value ?? placeholder}</span>
      </div>
    </div>
  )
}

export function EmployeeProfile() {
  const [profile, setProfile] = useState<EmployeeProfile | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    apiRequest<{ data: EmployeeProfile }>('/employees/me')
      .then((res) => setProfile(res.data))
      .catch(() =>
        setError(
          'No pudimos cargar tu perfil. Revisa tu conexión e inténtalo de nuevo.',
        ),
      )
      .finally(() => setIsLoading(false))
  }, [])

  if (isLoading) {
    return (
      <div className="stack">
        <div className="panel panel-body stack-tight">
          <Skeleton />
          <Skeleton block />
          <Skeleton block />
        </div>
      </div>
    )
  }

  if (error || !profile) {
    return (
      <Alert tone="risk" title="No pudimos mostrar tu perfil">
        {error || 'No se encontró un perfil asociado a tu cuenta.'}
      </Alert>
    )
  }

  const displayName = profile.preferredName
    ? `${profile.preferredName} ${profile.lastName}`
    : `${profile.firstName} ${profile.lastName}`

  const { label: statusText, tone } = statusLabel(profile.status)

  const docLabel =
    profile.documentType === 'CEDULA'
      ? 'Cédula'
      : profile.documentType
        ? profile.documentType
        : 'Documento'

  const initials = `${profile.firstName?.[0] ?? ''}${profile.lastName?.[0] ?? ''}`.toUpperCase()

  return (
    <div className="stack">
      {/* Avatar y nombre */}
      <section className="panel profile-hero" aria-label="Identidad">
        <div className="profile-avatar-monogram" aria-hidden="true">
          {initials || 'EM'}
        </div>
        <div className="profile-hero-body">
          <h2 className="title-section">{displayName}</h2>
          {profile.position && (
            <p className="meta">{profile.position.name}</p>
          )}
          <span className={`profile-status profile-status--${tone}`}>
            {profile.status === 'ACTIVE' && <span className="pulse-dot" aria-hidden="true" />}
            {statusText}
          </span>
        </div>
      </section>

      {/* Datos de empleo */}
      <section className="panel" aria-labelledby="empleo-title">
        <div className="panel-head">
          <h3 className="title-sub" id="empleo-title">Empleo</h3>
        </div>
        <div className="profile-section-body">
          <ProfileRow
            icon={<BuildingIcon size={16} />}
            label="Departamento"
            value={profile.department?.name}
          />
          <ProfileRow
            icon={<PersonIcon size={16} />}
            label="Código de empleado"
            value={profile.employeeCode}
          />
          <ProfileRow
            icon={<CalendarIcon size={16} />}
            label="Fecha de ingreso"
            value={formatSpanishDate(profile.hireDate)}
          />
          {profile.terminationDate && (
            <ProfileRow
              icon={<CalendarIcon size={16} />}
              label="Fecha de salida"
              value={formatSpanishDate(profile.terminationDate)}
            />
          )}
        </div>
      </section>

      {/* Contacto */}
      {(profile.email || profile.phone) && (
        <section className="panel" aria-labelledby="contacto-title">
          <div className="panel-head">
            <h3 className="title-sub" id="contacto-title">Contacto</h3>
          </div>
          <div className="profile-section-body">
            {profile.email && (
              <ProfileRow
                icon={<MailIcon size={16} />}
                label="Correo electrónico"
                value={profile.email}
              />
            )}
            {profile.phone && (
              <ProfileRow
                icon={<PhoneIcon size={16} />}
                label="Teléfono"
                value={profile.phone}
              />
            )}
          </div>
        </section>
      )}

      {/* Documento */}
      {(profile.documentType || profile.documentNumber) && (
        <section className="panel" aria-labelledby="doc-title">
          <div className="panel-head">
            <h3 className="title-sub" id="doc-title">Identificación</h3>
          </div>
          <div className="profile-section-body">
            <ProfileRow
              icon={<IdCardIcon size={16} />}
              label={docLabel}
              value={profile.documentNumber}
            />
          </div>
        </section>
      )}
    </div>
  )
}
