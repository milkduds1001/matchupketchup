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
            Build your sideboard plan for Magic: The Gathering—decklists, metagame matchups, and a printable guide in one place.
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

        <section className="home-features" aria-labelledby="home-features-heading">
          <h2 id="home-features-heading" className="home-features-title">
            How it works
          </h2>
          <ol className="home-steps">
            <li>
              <strong>Select a format</strong> and your decklist.
            </li>
            <li>
              <strong>Choose a metagame</strong> with the archetypes you expect to face.
            </li>
            <li>
              <strong>Fill in your sideboard plan</strong>—what comes in and out in each matchup.
            </li>
            <li>
              <strong>Print or save as PDF</strong> your sideboard guide and deck registration sheet.
            </li>
          </ol>
        </section>
      </main>
    </div>
  )
}
