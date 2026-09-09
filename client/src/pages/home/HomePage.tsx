import { useNavigate } from 'react-router-dom'
import { routePaths } from '../../routes/routePaths'

function HomePage() {
  const navigate = useNavigate()

  return (
    <main className="page public-home-page">
      <header className="site-header">
        <a className="brand" href={routePaths.home}>
          Vick Studio
        </a>
        <button
          className="login-link"
          type="button"
          onClick={() => navigate(routePaths.login)}
        >
          Entrar
        </button>
      </header>

      <section className="home-hero" aria-labelledby="home-title">
        <p className="eyebrow">Test</p>
        <h1 id="home-title">Test h1.</h1>
        <p className="hero-description">Test description.</p>
      </section>

      <section className="ads-section" aria-labelledby="ads-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Anúncios</p>
            <h2 id="ads-title">Anúncios h2</h2>
          </div>
          <span className="ads-count">número de anúncios</span>{' '}
          {/*ajustar código para exibir o número real de anúncios conforme a variável adsCount */}
        </div>

        <div className="ads-grid">
          <article className="ad-card ad-card-featured">
            <span className="ad-label">Destaque</span>
            {/*Substituir os anúncios das box para que ela possa criar sem alterar no código*/}
            <h3>Título do anúncio</h3>
            <p>Texto do anúncio</p>
            <span className="ad-meta">Dia e hora</span>
          </article>
          <article className="ad-card">
            <span className="ad-label">Serviço</span>
            <h3>Título do anúncio</h3>
            <p>Texto do anúncio</p>
            <span className="ad-meta">Dia e hora</span>
          </article>
          <article className="ad-card">
            <span className="ad-label">Oportunidade</span>
            <h3>Título do anúncio</h3>
            <p>Texto do anúncio</p>
            <span className="ad-meta">Dia e hora</span>
          </article>
        </div>
      </section>
    </main>
  )
}

export default HomePage
