import { resetDemo } from './api'
import './demo.css'
export function DemoNotice() {
  return (
    <aside className="demo-notice" aria-label="Ambiente de demonstração">
      <strong>DEMONSTRAÇÃO · DADOS FICTÍCIOS · SEM BACKEND</strong>
      <span>
        Salão: master.demo / admin.demo / carla.demo · Cliente:
        cliente@demo.test · Senha de teste: demo12345. Use somente dados
        fictícios.
      </span>
      <button
        onClick={() => {
          resetDemo()
          location.assign('/')
        }}
      >
        Reiniciar demonstração
      </button>
    </aside>
  )
}
