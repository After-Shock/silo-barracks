import { useEffect } from "react";
import { RiAdminLine, RiCheckLine, RiDashboardLine, RiDatabase2Line, RiKey2Line, RiPlugLine, RiRefreshLine, RiServerLine } from "@remixicon/react";
import logo from "../../../../public/brand/barracks-mark.svg";
import AuthArtworkBackground from "../AuthArtworkBackground";

const steps = [
  {
    id: 1,
    title: "Silo Server",
    hint: "Connect analytics",
    icon: RiServerLine,
    logo,
  },
  {
    id: 2,
    title: "Admin access",
    hint: "Local login or OIDC",
    icon: RiAdminLine,
  },
  {
    id: 3,
    title: "Integrations",
    hint: "Arr, Seerr, downloads",
    icon: RiPlugLine,
  },
  {
    id: 4,
    title: "History import",
    hint: "Tautulli backup",
    icon: RiDatabase2Line,
  },
  {
    id: 5,
    title: "First sync",
    hint: "Build dashboard data",
    icon: RiRefreshLine,
  },
];

const features = [
  {
    title: "Playback intelligence",
    text: "See active Silo viewers and turn observed playback into user insights.",
    icon: RiDashboardLine,
  },
  {
    title: "Local data store",
    text: "Keep the analytics cache close to your stack with PostgreSQL.",
    icon: RiDatabase2Line,
  },
  {
    title: "API-key sync",
    text: "Connect once, validate the server, then start the first sync.",
    icon: RiKey2Line,
  },
];

const defaultPosterTiles = Array.from({ length: 42 }, (_, index) => index);

export default function SetupShell({ step, eyebrow, title, description, children, minimal = false }) {
  const progress = Math.round((step / steps.length) * 100);
  const activeStepMeta = steps.find((item) => item.id === step) || steps[0];
  const completedSteps = Math.max(0, step - 1);

  useEffect(() => {
    document.body.classList.add("setup-mode");
    return () => {
      document.body.classList.remove("setup-mode");
    };
  }, []);

  return (
    <section className="setup-page">
      <div className="setup-background" />
      {step === 1 && (
        <div className="setup-default-artwork" aria-hidden="true">
          <div className="setup-default-artwork-grid">
            {defaultPosterTiles.map((item) => (
              <span className="setup-default-artwork-tile" key={item} />
            ))}
          </div>
          <div className="setup-default-artwork-scrim" />
          <div className="setup-default-artwork-vignette" />
        </div>
      )}
      <AuthArtworkBackground enabled={step > 1} />
      <div className="setup-card setup-card-remade">
        <header className="setup-header">
          <div className="setup-brand">
            <div className="setup-logo-mark">
              <img src={logo} alt="" />
            </div>
            <div>
              <p className="setup-brand-kicker">Initial Setup</p>
              <strong className="silo-wordmark">Silo Barracks</strong>
              <p className="setup-brand-author">Activity for Silo Server</p>
            </div>
          </div>

          <div className="setup-progress-badges" aria-hidden="true">
            <span>{completedSteps} done</span>
            <span>{steps.length - step} left</span>
            <span>{progress}% ready</span>
          </div>
        </header>

        <div className="setup-progress-strip" aria-label="Setup progress">
          {steps.map((item) => {
            const Icon = item.icon;
            const isActive = item.id === step;
            const isDone = item.id < step;
            const stepGraphic = item.logo && !isDone ? <img src={item.logo} alt="" /> : isDone ? <RiCheckLine /> : <Icon />;

            return (
              <div className={`setup-progress-step ${isActive ? "is-active" : ""} ${isDone ? "is-done" : ""}`} key={item.id}>
                <span className="setup-progress-node">{stepGraphic}</span>
                <div className="setup-progress-copy">
                  <small>{String(item.id).padStart(2, "0")}</small>
                  <strong>{item.title}</strong>
                </div>
              </div>
            );
          })}
          <div className="setup-progress-line" aria-hidden="true">
            <span style={{ width: `${progress}%` }} />
          </div>
        </div>

        <main className="setup-main">
          <div className="setup-content">
            {!minimal ? (
              <div className="setup-topbar">
                <div className="setup-intro">
                  <span className="setup-eyebrow">{eyebrow}</span>
                  <h2>{title}</h2>
                  <p>{description}</p>
                  <div className="setup-intro-meta">
                    <span>Step {step} of {steps.length}</span>
                    <span>{activeStepMeta.hint}</span>
                  </div>
                </div>

                <div className="setup-feature-grid">
                  {features.map((feature) => {
                    const Icon = feature.icon;
                    return (
                      <div className="setup-feature" key={feature.title}>
                        <span>
                          <Icon />
                        </span>
                        <div>
                          <strong>{feature.title}</strong>
                          <small>{feature.text}</small>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}

            <div className="setup-form-panel">
              {children}
            </div>
          </div>
        </main>

        <div className="setup-mobile-steps">
          <div className="setup-mobile-progress-meta">
            <span>{activeStepMeta.title}</span>
            <strong>{progress}%</strong>
          </div>
          {steps.map((item) => {
            const Icon = item.icon;
            const isActive = item.id === step;
            const isDone = item.id < step;
            const stepGraphic = item.logo && !isDone ? <img src={item.logo} alt="" /> : isDone ? <RiCheckLine /> : <Icon />;
            return (
              <span className={`setup-mobile-step ${isActive ? "is-active" : ""} ${isDone ? "is-done" : ""}`} key={item.id}>
                {stepGraphic}
                {item.title}
              </span>
            );
          })}
          <div className="setup-progress-track">
            <span style={{ width: `${progress}%` }} />
          </div>
        </div>
      </div>
    </section>
  );
}
