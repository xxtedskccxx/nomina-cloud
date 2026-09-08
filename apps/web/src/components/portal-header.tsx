'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import { apiRequest } from '@/lib/api'
import { DocumentIcon, PersonIcon, UsersIcon } from '@/components/ui/icons'

/*
Una sola barra, siempre igual, siempre visible. Confirma dónde estás,
permite navegar y salir de la sesión.
*/
export function PortalHeader({ role, name }: { role: 'ADMIN' | 'EMPLOYEE'; name?: string }) {
  const pathname = usePathname()
  const [isSigningOut, setIsSigningOut] = useState(false)
  const homePath = role === 'ADMIN' ? '/admin/payslips' : '/me/payslips'

  async function signOut() {
    setIsSigningOut(true)
    try {
      await apiRequest('/auth/sign-out', { method: 'POST' })
    } finally {
      window.location.assign('/login')
    }
  }

  return (
    <header className="site-header">
      <div className="site-header-inner">
        <Link href={homePath} className="brand-lockup" aria-label="Ir al inicio del portal">
          <span className="brand-mark" aria-hidden="true">
            I
          </span>
          <span>Integra Nómina</span>
        </Link>
        <span className="header-role">{role === 'ADMIN' ? 'RRHH' : 'Empleado'}</span>

        {role === 'EMPLOYEE' && (
          <nav className="header-nav-desktop" aria-label="Navegación empleado">
            <Link
              href="/me/payslips"
              className={`header-nav-link${pathname.startsWith('/me/payslips') ? ' header-nav-link--active' : ''}`}
            >
              <DocumentIcon size={14} />
              <span>Mis volantes</span>
            </Link>
            <Link
              href="/me/profile"
              className={`header-nav-link${pathname.startsWith('/me/profile') ? ' header-nav-link--active' : ''}`}
            >
              <PersonIcon size={14} />
              <span>Mi perfil</span>
            </Link>
          </nav>
        )}
        {role === 'ADMIN' && (
          <nav className="header-nav-desktop" aria-label="Navegación RRHH">
            <Link
              href="/admin/payslips"
              className={`header-nav-link${pathname.startsWith('/admin/payslips') ? ' header-nav-link--active' : ''}`}
            >
              <DocumentIcon size={14} />
              <span>Volantes</span>
            </Link>
            <Link
              href="/admin/employees"
              className={`header-nav-link${pathname.startsWith('/admin/employees') ? ' header-nav-link--active' : ''}`}
            >
              <UsersIcon size={14} />
              <span>Empleados</span>
            </Link>
          </nav>
        )}
        <div className="header-spacer" />
        <div className="header-identity">
          {name ? <span className="meta-tight truncate">{name}</span> : null}
          <button
            className="button button-quiet button-small"
            onClick={() => void signOut()}
            disabled={isSigningOut}
            type="button"
          >
            {isSigningOut ? 'Saliendo…' : 'Salir'}
          </button>
        </div>
      </div>
    </header>
  )
}
