import logo from '../assets/matchupketchup_logo_mark.png'
import './HomePage.css'

/**
 * Public landing page. Default route for the app before sign-in.
 */
export default function HomePage({ user, onNavigateLogin, onNavigateApp, onLogoClick }) {
  function handleLogoClick() {
    onLogoClick?.()
  }

  return (
    <div className="home-page">
      <header className="home-header">
        <button type="button" className="home-logo-btn" onClick={handleLogoClick} aria-label="MatchupKetchup home">
          <img src={logo} alt="" className="home-logo" />
        </button>
        <div className="home-header-actions">
          {user ? (
            <>
              <span className="home-header-user">{user.email}</span>
              <button type="button" className="home-header-cta home-header-cta--primary" onClick={() => onNavigateApp?.()}>
                Open app
              </button>
            </>
          ) : (
            <button type="button" className="home-header-cta home-header-cta--primary" onClick={() => onNavigateLogin?.()}>
              Sign in
            </button>
          )}
        </div>
      </header>

      <main className="home-main">
        <section className="home-hero">
          <h1 className="home-hero-brand">
            <img src={logo} alt="MatchupKetchup" className="home-hero-logo" />
          </h1>
          <p className="home-hero-lead">
            Create, save, and print your sideboard plans.
          </p>
          {!user && (
            <div className="home-hero-actions">
              <button type="button" className="home-cta home-cta--primary" onClick={() => onNavigateLogin?.()}>
                Sign in or create an account
              </button>
            </div>
          )}
          {user && (
            <div className="home-hero-actions">
              <button type="button" className="home-cta home-cta--primary" onClick={() => onNavigateApp?.()}>
                Continue to the app
              </button>
            </div>
          )}
        </section>
      </main>
    </div>
  )
}
