'use client'

import { useState, type FormEvent } from 'react'
import { apiRequest, ApiRequestError } from '@/lib/api'
import { Alert } from '@/components/ui/primitives'
import { EyeIcon, EyeOffIcon } from '@/components/ui/icons'

interface SignInResponse {
  user?: { role?: string }
}

/*
Una tarjeta, dos campos, un botón. El error es genérico a propósito:
no confirma si el usuario existe. La única ayuda que hace falta es de
dónde sale el código, porque el empleado no lo elige.
*/
export default function LoginPage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

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
        setError('Código, correo o contraseña incorrectos.')
      }
      setIsSubmitting(false)
    }
  }

  return (
    <main className="login-page">
      <section className="panel login-card" aria-labelledby="login-title">
        <p className="login-brand">
          <span className="brand-mark" aria-hidden="true">
            P
          </span>
          Proyecto Nómina
        </p>

        <h1 className="title-page" id="login-title">
          Iniciar sesión
        </h1>
        <p className="meta">Consulta y entrega de volantes de nómina.</p>

        <form
          className="login-form"
          action="#"
          onSubmit={(e) => {
            e.preventDefault()
            e.stopPropagation()
            void handleSubmit(e)
          }}
          noValidate
        >
          <div className="field">
            <label className="field-label" htmlFor="username">
              Correo, código o usuario
            </label>
            <input
              className="input"
              id="username"
              name="username"
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
              aria-describedby="username-hint"
              required
            />
            <span className="meta-tight" id="username-hint">
              Usa tu correo electrónico o tu usuario asignado.
            </span>
          </div>

          <div className="field">
            <label className="field-label" htmlFor="password">
              Contraseña
            </label>
            <div className="password-input-wrap">
              <input
                className="input"
                id="password"
                name="password"
                type={showPassword ? 'text' : 'password'}
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
                className="password-toggle-btn"
                onClick={() => setShowPassword((prev) => !prev)}
                aria-label={showPassword ? 'Ocultar contraseña' : 'Ver contraseña'}
                title={showPassword ? 'Ocultar contraseña' : 'Ver contraseña'}
                tabIndex={-1}
              >
                {showPassword ? <EyeOffIcon size={18} /> : <EyeIcon size={18} />}
              </button>
            </div>
          </div>

          {error ? <Alert tone="risk" title={error} /> : null}

          <button
            className="button button-primary button-block"
            type="button"
            onClick={() => void handleSubmit()}
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Entrando…' : 'Entrar al portal'}
          </button>
        </form>

        <p className="meta-tight login-foot">
          ¿Olvidaste tu contraseña? Escribe a Recursos Humanos para restablecerla.
        </p>
      </section>
    </main>
  )
}
