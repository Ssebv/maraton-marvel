import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import './styles.css'

// Si algo revienta al pintar, la página se quedaba en blanco: sin explicación
// y, lo peor, sin manera de rescatar el progreso. Esto da las dos cosas.
class Salvavidas extends React.Component {
  constructor(props) {
    super(props)
    this.state = { error: null, copiado: false }
  }
  static getDerivedStateFromError(error) { return { error } }
  componentDidCatch(error, info) { console.error('Maratón Marvel:', error, info) }

  copia() {
    try {
      const datos = {}
      for (const k of Object.keys(localStorage)) {
        if (k.startsWith('maraton-marvel')) datos[k] = localStorage.getItem(k)
      }
      const blob = new Blob([JSON.stringify({ app: 'maraton-marvel', fecha: new Date().toISOString(), datos }, null, 1)],
        { type: 'application/json' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `maraton-marvel-rescate-${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(a.href)
      this.setState({ copiado: true })
    } catch {}
  }

  render() {
    if (!this.state.error) return this.props.children
    let titulos = 0
    try { titulos = Object.keys(JSON.parse(localStorage.getItem('maraton-marvel-v1') || '{}')).length } catch {}
    return (
      <div className="wrap">
        <div className="aviso peligro salvavidas">
          <p className="sr-titulo">Algo ha fallado al dibujar la página</p>
          <p className="aviso-texto">
            Tu progreso sigue guardado en este navegador
            {titulos > 0 ? <> — <b>{titulos} título{titulos === 1 ? '' : 's'}</b> marcados</> : null}.
            Antes de nada puedes descargar una copia, y luego recargar.
          </p>
          <div className="aviso-acciones">
            <button className="chip-btn destacado" aria-pressed="false" onClick={() => this.copia()}>
              {this.state.copiado ? 'Copia descargada' : 'Descargar copia de mi progreso'}
            </button>
            <button className="chip-btn" onClick={() => window.location.reload()}>Recargar la página</button>
            <button className="chip-btn" onClick={() => { window.location.search = ''; }}>Abrir sin parámetros</button>
          </div>
          <details className="salvavidas-detalle">
            <summary>Detalle técnico</summary>
            <pre>{String(this.state.error && this.state.error.message || this.state.error)}</pre>
          </details>
        </div>
      </div>
    )
  }
}

createRoot(document.getElementById('root')).render(
  <Salvavidas><App /></Salvavidas>
)
