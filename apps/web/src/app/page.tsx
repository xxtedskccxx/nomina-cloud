import Link from 'next/link'

/*
La raíz no es una landing: es una puerta. Quien llega aquí ya trabaja
en la empresa y solo necesita entrar. Nada que leer, nada que vender.
*/
export default function HomePage() {
  return (
    <main className="login-page">
      <section className="panel login-card" aria-labelledby="home-title">
        <p className="login-brand">
          <span className="brand-mark" aria-hidden="true">
            P
          </span>
          Proyecto Nómina
        </p>
        <h1 className="title-page" id="home-title">
          Portal de volantes
        </h1>
        <p className="meta">
          Recursos Humanos publica los volantes de cada período. Cada empleado consulta únicamente
          los suyos.
        </p>
        <div className="login-form">
          <Link className="button button-primary button-block" href="/login">
            Iniciar sesión
          </Link>
        </div>
      </section>
    </main>
  )
}
