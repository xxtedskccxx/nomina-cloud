'use client'

import { useState, type FormEvent } from 'react'
import { apiRequest, ApiRequestError } from '@/lib/api'
import { Alert } from '@/components/ui/primitives'
import { EyeIcon, EyeOffIcon } from '@/components/ui/icons'

interface SignInResponse {
  user?: { role?: string }
}

export default function LoginPage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleDemoFill = () => {
    setUsername('admin')
    setPassword('1234')
    setError('')
  }

  async function handleSubmit(event?: FormEvent<HTMLFormElement>) {
    if (event) {
      event.preventDefault()
      event.stopPropagation()
    }
    if (!username.trim() || !password) {
      setError('Por favor escribe tu usuario y contraseña.')
      return
    }
    setError('')
    setIsSubmitting(true)
    try {
      const trimmed = username.trim()
      const isEmail = trimmed.includes('@')
      const endpoint = isEmail ? '/auth/sign-in/email' : '/auth/sign-in/username'
      const payload = isEmail
        ? { email: trimmed.toLowerCase(), password }
        : { username: trimmed, password }

      const response = await apiRequest<SignInResponse>(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const target = response?.user?.role === 'ADMIN' ? '/admin/payslips' : '/me/payslips'
      window.location.replace(target)
    } catch (err: unknown) {
      if (err instanceof ApiRequestError) {
        setError(err.message || 'Código, correo o contraseña incorrectos.')
      } else {
        setError('No pudimos conectar con el servidor. Verifica tu conexión e intenta nuevamente.')
      }
      setIsSubmitting(false)
    }
  }

  return (
    <div className="login-shell">
      {/* Top Brand Bar */}
      <header className="login-topbar">
        <div className="login-brand-group">
          <div className="login-logo-mark" aria-hidden="true">
            N
          </div>
          <div>
            <span className="login-brand-text">NóminaCloud</span>
            <span className="login-badge-enterprise" style={{ marginLeft: '0.5rem' }}>
              Enterprise
            </span>
          </div>
        </div>

        <div className="login-status-indicator">
          <span className="login-status-dot" aria-hidden="true" />
          <span>Servidor en línea • TLS 256-bit</span>
        </div>
      </header>

      {/* Main Split Content */}
      <main className="login-main">
        {/* Left Column: Value Proposition & Trust */}
        <section className="login-hero-section" aria-label="Información del portal corporativo">
          <div className="login-pill-badge">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
            <span>Plataforma Segura de Nómina</span>
          </div>

          <h1 className="login-hero-title">
            Distribución inteligente y confidencial de <span>volantes de nómina</span>
          </h1>

          <p className="login-hero-desc">
            Acceso centralizado para consultar, descargar y auditar comprobantes de pago oficiales,
            retenciones y certificaciones laborales en tiempo real.
          </p>

          <div className="login-features-grid">
            <div className="login-feature-item">
              <div className="login-feature-icon" aria-hidden="true">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
              </div>
              <div className="login-feature-content">
                <h4>Seguridad de Extremo a Extremo</h4>
                <p>Cifrado bancario en tránsito y en reposo. Acceso restringido exclusivamente a tu registro personal.</p>
              </div>
            </div>

            <div className="login-feature-item">
              <div className="login-feature-icon" aria-hidden="true">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="16" y1="13" x2="8" y2="13" />
                  <line x1="16" y1="17" x2="8" y2="17" />
                  <polyline points="10 9 9 9 8 9" />
                </svg>
              </div>
              <div className="login-feature-content">
                <h4>Trazabilidad y Validez Legal</h4>
                <p>Registro auditado de visualización y descarga con valor probatorio laboral ante la entidad reguladora.</p>
              </div>
            </div>

            <div className="login-feature-item">
              <div className="login-feature-icon" aria-hidden="true">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
              </div>
              <div className="login-feature-content">
                <h4>Disponibilidad 24/7 en la Nube</h4>
                <p>Descarga tus comprobantes en cualquier momento desde tu teléfono móvil o computador.</p>
              </div>
            </div>
          </div>
        </section>

        {/* Right Column: Sign In Card */}
        <div className="login-card-wrapper">
          <section className="login-card-surface" aria-labelledby="login-title">
            <div className="login-card-header">
              <span className="login-card-badge">Portal de Acceso</span>
              <h2 id="login-title">Iniciar sesión</h2>
              <p>Ingresa tus credenciales autorizadas de colaborador o administrador</p>
            </div>

            <form
              className="login-form-group"
              action="#"
              onSubmit={(e) => {
                e.preventDefault()
                e.stopPropagation()
                void handleSubmit(e)
              }}
              noValidate
            >
              {/* Field: Username */}
              <div>
                <label className="login-input-label" htmlFor="username">
                  <span>Usuario o correo electrónico</span>
                </label>
                <div className="login-input-box">
                  <span className="login-input-icon" aria-hidden="true">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                      <circle cx="12" cy="7" r="4" />
                    </svg>
                  </span>
                  <input
                    className="login-text-input"
                    id="username"
                    name="username"
                    placeholder="Ej: admin o tu.correo@empresa.com"
                    autoComplete="username"
                    autoCapitalize="none"
                    spellCheck={false}
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        void handleSubmit()
                      }
                    }}
                    required
                  />
                </div>
              </div>

              {/* Field: Password */}
              <div>
                <label className="login-input-label" htmlFor="password">
                  <span>Contraseña</span>
                </label>
                <div className="login-input-box">
                  <span className="login-input-icon" aria-hidden="true">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                    </svg>
                  </span>
                  <input
                    className="login-text-input"
                    id="password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    autoComplete="current-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        void handleSubmit()
                      }
                    }}
                    required
                  />
                  <button
                    type="button"
                    className="login-password-toggle"
                    onClick={() => setShowPassword((prev) => !prev)}
                    aria-label={showPassword ? 'Ocultar contraseña' : 'Ver contraseña'}
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOffIcon size={18} /> : <EyeIcon size={18} />}
                  </button>
                </div>
              </div>

              {/* Evaluation / Quick Demo Helper */}
              <button
                type="button"
                className="login-demo-helper"
                onClick={handleDemoFill}
                title="Autocompletar credenciales de evaluación"
              >
                <span className="login-demo-text">
                  ⚡ <strong>Credenciales demo:</strong> Clic aquí para rellenar <code>admin</code> / <code>1234</code>
                </span>
                <span className="login-demo-tag">Autocompletar</span>
              </button>

              {/* Error feedback */}
              {error ? <Alert tone="risk" title={error} /> : null}

              {/* Submit Action */}
              <button
                className="login-submit-btn"
                type="button"
                onClick={() => void handleSubmit()}
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <>
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      style={{ animation: 'spin 1s linear infinite' }}
                    >
                      <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
                      <path d="M12 2a10 10 0 0 1 10 10" />
                    </svg>
                    <span>Iniciando sesión segura…</span>
                  </>
                ) : (
                  <>
                    <span>Acceder a la plataforma</span>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M5 12h14" />
                      <path d="m12 5 7 7-7 7" />
                    </svg>
                  </>
                )}
              </button>
            </form>

            <div className="login-card-foot">
              <p>
                ¿Olvidaste tu contraseña o no tienes acceso? Contacta a la gerencia de Gestión Humana para restablecer tu cuenta.
              </p>
            </div>
          </section>
        </div>
      </main>

      {/* Corporate Footer */}
      <footer className="login-footer-bar">
        <div>© 2026 NóminaCloud Enterprise • Todos los derechos reservados</div>
        <div>Cumplimiento normativo laboral • Protección de datos sensibles garantizada</div>
      </footer>
    </div>
  )
}
