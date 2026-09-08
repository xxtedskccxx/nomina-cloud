'use client'

/*
BARRA DE NAVEGACIÓN INFERIOR — EMPLEADO
=====================================================================
En móvil: barra fija en la parte inferior con tres destinos.
En escritorio (≥ 768px): se oculta, la navegación queda en el header.
*/

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { HomeIcon, DocumentIcon, PersonIcon } from '@/components/ui/icons'

interface Tab {
  href: string
  label: string
  icon: React.ComponentType<{ size?: number; className?: string }>
  matchExact?: boolean
}

const TABS: Tab[] = [
  {
    href: '/me/payslips',
    label: 'Inicio',
    icon: HomeIcon,
  },
  {
    href: '/me/payslips#historial',
    label: 'Historial',
    icon: DocumentIcon,
  },
  {
    href: '/me/profile',
    label: 'Mi perfil',
    icon: PersonIcon,
  },
]

export function BottomTabBar() {
  const pathname = usePathname()

  function isActive(tab: Tab): boolean {
    if (tab.label === 'Mi perfil') {
      return pathname.startsWith('/me/profile')
    }
    return pathname.startsWith('/me/payslips') && !pathname.startsWith('/me/profile')
  }

  return (
    <nav className="bottom-tab-bar" aria-label="Navegación principal">
      {TABS.map((tab) => {
        const Icon = tab.icon
        const active = isActive(tab)
        return (
          <Link
            key={tab.label}
            href={tab.href}
            className={`bottom-tab${active ? ' bottom-tab--active' : ''}`}
            aria-current={active ? 'page' : undefined}
          >
            <span className="bottom-tab-icon-wrap">
              <Icon size={20} />
            </span>
            <span className="bottom-tab-label">{tab.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
