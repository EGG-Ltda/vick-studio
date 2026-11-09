import { useNavigate } from 'react-router-dom'
import vickFlorezLogo from '../../assets/vick-florez-logo.webp'
import { routePaths } from '../../routes/routePaths'

function HomePage() {
  const navigate = useNavigate()

  function goToServices() {
    document.getElementById('servicos')?.scrollIntoView({ behavior: 'smooth' })
  }

  return (
    <main className="public-home-page">
      <svg className="home-art" viewBox="0 0 1024 577" preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <linearGradient id="home-ribbon-wine" x1="0" y1="0" x2="0.72" y2="1">
            <stop stopColor="#c32c4b" />
            <stop offset="0.48" stopColor="#a1072b" />
            <stop offset="1" stopColor="#67001b" />
          </linearGradient>
          <linearGradient id="home-ribbon-rose" x1="0" y1="0" x2="1" y2=".82">
            <stop stopColor="#f0a7ad" />
            <stop offset="1" stopColor="#d85068" />
          </linearGradient>
          <filter id="home-ribbon-shadow" x="-40%" y="-10%" width="190%" height="120%">
            <feDropShadow dx="7" dy="8" stdDeviation="7" floodColor="#722d24" floodOpacity=".2" />
          </filter>
        </defs>
        <path
          d="M0 0H182C179 55 143 86 112 119C81 153 70 195 80 236C88 273 115 295 129 328C145 367 132 409 107 444C88 470 77 507 78 577H0Z"
          fill="url(#home-ribbon-wine)"
          filter="url(#home-ribbon-shadow)"
        />
        <path
          d="M159 0C151 56 121 89 101 128C80 169 77 207 90 244C103 279 126 302 121 337C117 380 82 419 75 462C69 502 79 544 91 577H56C40 539 28 497 36 454C44 410 77 375 79 335C81 299 58 270 58 229C57 184 72 143 95 107C120 68 133 34 134 0Z"
          fill="url(#home-ribbon-rose)"
        />
        <path
          d="M180 0C171 61 132 94 104 132C79 167 67 208 73 246C81 294 108 318 106 356C104 409 62 453 45 508C39 529 37 551 37 577"
          fill="none"
          stroke="#e8b84a"
          strokeLinecap="round"
          strokeWidth="1.25"
        />
        <path
          d="M159 0C151 55 117 91 95 130C72 171 70 216 86 255C100 290 119 315 114 352C109 393 77 429 67 468C58 507 66 544 78 577"
          fill="none"
          stroke="rgb(255 235 229 / 72%)"
          strokeLinecap="round"
          strokeWidth="2.8"
        />
      </svg>
      <span className="home-dots" aria-hidden="true" />

      <header className="site-header">
        <a className="brand" href={routePaths.home} aria-label="Vick Florez - Início">
          <img src={vickFlorezLogo} alt="Vick Florez" />
        </a>
        <nav className="home-navigation" aria-label="Navegação principal">
          <a href="#servicos">Serviços</a>
          <a href="#sobre">Sobre</a>
          <a href="#contato">Contato</a>
        </nav>
        <div className="home-header-actions">
          <button className="home-primary-action home-header-booking" type="button" onClick={goToServices}>
            Agendar Agora <span aria-hidden="true">→</span>
          </button>
          <button
            className="home-salon-action"
            type="button"
            aria-label="Área do Salão"
            title="Entrar na Área do Salão"
            onClick={() => navigate(routePaths.login)}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
              <circle cx="12" cy="8" r="3.5" />
              <path d="M5 21v-2a7 7 0 0 1 14 0v2" />
            </svg>
          </button>
        </div>
      </header>

      <section className="home-hero" aria-labelledby="home-title">
        <div className="home-hero-content">
          <h1 id="home-title">Seu momento de florescer.</h1>
          <p className="hero-description">Cuidado, beleza e bem-estar pensados para você.</p>
        </div>
      </section>

      <section className="home-services-intro" id="servicos" aria-labelledby="services-title">
        <span aria-hidden="true" />
        <p id="services-title">Nossos serviços</p>
      </section>
      <section className="home-anchor-section" id="sobre" aria-label="Sobre" />
      <footer className="home-anchor-section" id="contato" aria-label="Contato" />
    </main>
  )
}

export default HomePage
