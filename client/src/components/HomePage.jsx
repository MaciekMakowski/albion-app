import { Link } from "react-router-dom";
import { getHomePageCopy } from "../features/recipeSimulator/translations";

const SUPPORT_URL = "https://buymeacoffee.com/";
const VISUAL_IMAGE_BY_ACCENT = {
  MD: "/images/hero-market-data.png",
  CP: "/images/hero-craft-planner.png",
  AR: "/images/hero-craft-arbitrage.webp",
};

export default function HomePage({ language }) {
  const copy = getHomePageCopy(language);

  return (
    <div className="home-page">
      <section className="home-hero">
        <div className="home-hero-copy">
          <div className="home-eyebrow">{copy.eyebrow}</div>
          <h1>{copy.title}</h1>
          <p>{copy.intro}</p>
          <p>{copy.lead}</p>
          <div className="home-hero-actions">
            <Link className="home-primary-link" to="/price-checker">
              {copy.primaryCta}
            </Link>
            <a
              className="home-secondary-link"
              href={SUPPORT_URL}
              target="_blank"
              rel="noreferrer"
            >
              {copy.supportCta}
            </a>
          </div>
        </div>

        <div className="home-hero-panel">
          {copy.heroStats.map((stat) => (
            <div key={stat.title} className="home-stat-card">
              <strong>{stat.title}</strong>
              <span>{stat.text}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="home-visual-grid" aria-label="Visual placeholders">
        {copy.visuals.map((visual) => (
          <article key={visual.title} className="home-visual-card">
            {VISUAL_IMAGE_BY_ACCENT[visual.accent] ? (
              <img
                src={VISUAL_IMAGE_BY_ACCENT[visual.accent]}
                alt={visual.text}
                className="home-visual-image"
              />
            ) : (
              <div className="home-visual-placeholder" aria-hidden="true">
                <span>{visual.accent}</span>
              </div>
            )}
            <div className="home-visual-copy">
              <div className="home-visual-label">{visual.label}</div>
              <h2>{visual.title}</h2>
              <p>{visual.text}</p>
            </div>
          </article>
        ))}
      </section>

      <section className="home-section-grid">
        {copy.sections.map((section) => (
          <article key={section.title} className="home-info-card">
            <h2>{section.title}</h2>
            <div className="home-list">
              {section.items.map((item) => (
                <p key={item}>{item}</p>
              ))}
            </div>
          </article>
        ))}
      </section>

      <section className="home-feature-grid">
        {copy.features.map((feature) => (
          <article key={feature.title} className="home-feature-card">
            <div className="home-feature-badge">{feature.badge}</div>
            <h3>{feature.title}</h3>
            <p>{feature.text}</p>
            <Link className="home-feature-link" to={feature.to}>
              {feature.cta}
            </Link>
          </article>
        ))}
      </section>

      <section className="home-seo-card">
        <h2>{copy.seo.title}</h2>
        {copy.seo.paragraphs.map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}
        <div className="home-keyword-row" aria-label="SEO keywords">
          {copy.seo.keywords.map((keyword) => (
            <span key={keyword} className="home-keyword-pill">
              {keyword}
            </span>
          ))}
        </div>
      </section>

      <section className="home-support-card">
        <h2>Buy Me a Coffee</h2>
        <p>{copy.supportText}</p>
        <a href={SUPPORT_URL} target="_blank" rel="noreferrer">
          {copy.supportCta}
        </a>
      </section>
    </div>
  );
}
