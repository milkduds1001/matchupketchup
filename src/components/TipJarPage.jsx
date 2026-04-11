import logo from '../assets/matchupketchup_logo_mark.png'
import './TipJarPage.css'

/**
 * Optional tip / support page (About-adjacent, community-first).
 *
 * ---------------------------------------------------------------------------
 * PAYMENT LINKS — replace placeholders with your real URLs before launch:
 * ---------------------------------------------------------------------------
 */
export const TIP_JAR_PAYMENT_LINKS = {
  stripe: 'https://your-stripe-link',
  paypal: 'https://your-paypal-link',
  kofi: 'https://your-kofi-link',
}

export default function TipJarPage({ user, onNavigateHome, onNavigateLogin, onNavigateApp }) {
  return (
    <div className="tip-jar-page">
      <header className="tip-jar-header">
        <button type="button" className="tip-jar-logo-btn" onClick={onNavigateHome} aria-label="MatchupKetchup home">
          <img src={logo} alt="" className="tip-jar-logo" />
        </button>
        <nav className="tip-jar-header-nav" aria-label="Page">
          <button type="button" className="tip-jar-nav-link" onClick={onNavigateHome}>
            Home
          </button>
        </nav>
        <div className="tip-jar-header-actions">
          {user ? (
            <>
              <span className="tip-jar-header-user">{user.email}</span>
              <button type="button" className="tip-jar-cta tip-jar-cta--primary" onClick={() => onNavigateApp?.()}>
                Open app
              </button>
            </>
          ) : (
            <button type="button" className="tip-jar-cta tip-jar-cta--primary" onClick={() => onNavigateLogin?.()}>
              Sign in
            </button>
          )}
        </div>
      </header>

      <main className="tip-jar-main">
        <article className="tip-jar-article">
          <header className="tip-jar-hero">
            <h1 className="tip-jar-title">Support the Creator</h1>
            <p className="tip-jar-lead">This site is free, ad-free, and built for the MTG community.</p>
          </header>

          <section className="tip-jar-section" aria-labelledby="tip-jar-about-heading">
            <h2 id="tip-jar-about-heading" className="tip-jar-section-title">
              Why this exists
            </h2>
            <div className="tip-jar-prose">
              <p>
                I built MatchupKetchup because I wanted a straightforward way to plan sideboards, keep notes, and trade
                ideas with the metagame in front of me — not buried in spreadsheets or scattered tabs. If it helps you
                ship a better 75, prep for an event, or just feel less lost in the matchup, that’s the whole point.
              </p>
              <p>
                I love this game and the people who play it. The silly decks, the tight games, the “wait, I should’ve
                boarded in the third copy of that thing” moments — all of it.
              </p>
              <p>
                I’m not here to carpet-bomb you with ads, newsletter popups, or dark patterns. I’d rather keep the
                experience clean and let the tool speak for itself.
              </p>
            </div>
          </section>

          <section className="tip-jar-section tip-jar-section--cta" aria-labelledby="tip-jar-cta-heading">
            <h2 id="tip-jar-cta-heading" className="tip-jar-section-title">
              If you find this useful…
            </h2>
            <div className="tip-jar-prose">
              <p>
                No pressure — seriously. If the site has saved you time, made sideboarding easier, or you just want to
                throw a few mana my way (think: buying me a pack after a good match), you can optionally chip in below.
                It’s appreciated, never expected, and zero guilt if you don’t.
              </p>
            </div>
            <div className="tip-jar-actions">
              <a
                className="tip-jar-btn tip-jar-btn--stripe"
                href={TIP_JAR_PAYMENT_LINKS.stripe}
                target="_blank"
                rel="noopener noreferrer"
              >
                Tip via Stripe
              </a>
              <a
                className="tip-jar-btn tip-jar-btn--paypal"
                href={TIP_JAR_PAYMENT_LINKS.paypal}
                target="_blank"
                rel="noopener noreferrer"
              >
                Tip via PayPal
              </a>
              <a
                className="tip-jar-btn tip-jar-btn--kofi"
                href={TIP_JAR_PAYMENT_LINKS.kofi}
                target="_blank"
                rel="noopener noreferrer"
              >
                Tip via Ko-fi
              </a>
            </div>
          </section>

          <section className="tip-jar-section" aria-labelledby="tip-jar-transparency-heading">
            <h2 id="tip-jar-transparency-heading" className="tip-jar-section-title">
              Where it goes
            </h2>
            <ul className="tip-jar-list">
              <li>Hosting and keeping the lights on</li>
              <li>Data and API costs (cards don’t fetch themselves)</li>
              <li>Ongoing development and fixes</li>
              <li>Future features the community actually wants</li>
            </ul>
          </section>

          <section className="tip-jar-section tip-jar-section--philosophy" aria-labelledby="tip-jar-philosophy-heading">
            <h2 id="tip-jar-philosophy-heading" className="tip-jar-section-title">
              No ads. No paywalls. No nonsense.
            </h2>
            <div className="tip-jar-prose">
              <p>
                I want this site to stay fast, readable, and useful — not a billboard. No intrusive monetization, no
                “unlock the rest for $9.99” vibes. Community first, always.
              </p>
            </div>
          </section>

          <p className="tip-jar-footnote">Tips are not tax-deductible. Just genuine support.</p>
        </article>
      </main>
    </div>
  )
}
