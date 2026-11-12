import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import axios from "../lib/axios_instance";

import "./css/about.css";
import { RiArchiveLine, RiArrowDownSLine, RiCheckLine, RiCodeSSlashLine, RiDatabase2Line, RiDownloadCloud2Line, RiFilmLine, RiGitBranchLine, RiGithubFill, RiHeartPulseLine, RiLayoutGridLine, RiPriceTag3Line, RiPulseLine, RiRadarLine, RiSettings3Line, RiShieldCheckLine, RiTaskLine, RiTimerFlashLine } from "@remixicon/react";
import { mediaServerName } from "../lib/media-server";

function stripMarkdown(value) {
  return String(value || "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[`*_~>#]/g, "")
    .trim();
}

function formatReleaseDate(value) {
  if (!value) return "";
  try {
    return new Intl.DateTimeFormat(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    }).format(new Date(value));
  } catch {
    return "";
  }
}

function parseReleaseBody(body) {
  const sections = [];
  let current = { title: "Changes", items: [] };

  String(body || "")
    .split("\n")
    .map((line) => line.trim())
    .forEach((line) => {
      if (!line || /^<!--/.test(line)) return;

      const heading = line.match(/^#{2,6}\s+(.+)/);
      if (heading) {
        if (current.items.length) sections.push(current);
        current = { title: stripMarkdown(heading[1]), items: [] };
        return;
      }

      const bullet = line.match(/^[-*]\s+(.+)/);
      const numbered = line.match(/^\d+\.\s+(.+)/);
      const text = stripMarkdown(bullet?.[1] || numbered?.[1] || line);

      if (text && !/^full changelog/i.test(text)) {
        current.items.push(text);
      }
    });

  if (current.items.length) sections.push(current);
  return sections.length ? sections : [{ title: "Notes", items: ["No release notes were provided for this version."] }];
}

// The API already drops automation and AI accounts; this is a second guard for
// older servers. Keep in line with apps/api/utils/github-contributors.js.
const EXCLUDED_CONTRIBUTORS = new Set([
  "dependabot", "dependabot-preview", "renovate", "renovate-bot", "renovatebot", "github-actions", "actions-user", "web-flow",
  "copilot", "copilot-swe-agent", "github-copilot", "cursor", "cursoragent", "cursor-agent", "claude", "claude-code", "anthropic-claude",
  "codex", "chatgpt-codex-connector", "openai-codex", "devin", "devin-ai-integration", "jellyglance-bot", "jellyglance-security-bot",
  "imgbot", "allcontributors", "snyk-bot", "pre-commit-ci",
]);

function isBotContributor(contributor) {
  if (String(contributor?.type || "").toLowerCase() === "bot") return true;
  const login = String(contributor?.login || "").trim().toLowerCase();
  if (!login || login.endsWith("[bot]") || login.endsWith("-bot") || login.endsWith("_bot")) return true;
  return EXCLUDED_CONTRIBUTORS.has(login.replace(/\[bot\]$/, ""));
}

const PROJECT_OWNER_LOGIN = "Nerdy-Technician";
const PROJECT_OWNER_FALLBACK = {
  id: "project-owner",
  login: PROJECT_OWNER_LOGIN,
  avatar_url: `https://github.com/${PROJECT_OWNER_LOGIN}.png?size=160`,
  profile_url: `https://github.com/${PROJECT_OWNER_LOGIN}`,
  contributions: 0,
};

function aboutUpdateMessage(data) {
  if (data.update_available) {
    return data.latest_version ? `Update ${data.latest_version} available` : "Update available";
  }
  const message = String(data.message || "");
  if (/is up to date/i.test(message)) return "Up to date";
  if (/beta version/i.test(message)) return "Using a beta build";
  if (/Unable to check/i.test(message)) return "Unable to check";
  return message || "Checking…";
}

export default function SettingsAbout() {
  const token = localStorage.getItem("token");
  const [data, setData] = useState({
    current_version: "0.1.0",
    message: "Version check pending",
    update_available: false,
  });
  const [releaseData, setReleaseData] = useState({ releases: [], releases_url: "" });
  const [releaseMessage, setReleaseMessage] = useState("Loading release notes...");
  const [selectedReleaseId, setSelectedReleaseId] = useState("");
  const [releaseMenuOpen, setReleaseMenuOpen] = useState(false);
  const [contributors, setContributors] = useState([]);
  const [contributorsMessage, setContributorsMessage] = useState("Loading GitHub profiles...");
  const updateMessage = aboutUpdateMessage(data);
  const selectedRelease = releaseData.releases.find((release) => String(release.id) === selectedReleaseId) || releaseData.releases[0];
  const selectedReleaseSections = parseReleaseBody(selectedRelease?.body);
  const projectOwner = contributors.find((contributor) => contributor.login?.toLowerCase() === PROJECT_OWNER_LOGIN.toLowerCase()) || PROJECT_OWNER_FALLBACK;
  const projectContributors = contributors.filter((contributor) => contributor.login?.toLowerCase() !== PROJECT_OWNER_LOGIN.toLowerCase());

  useEffect(() => {
    const fetchVersion = () => {
      if (!token) return;

      axios
        .get("/api/CheckForUpdates", {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        })
        .then((response) => {
          setData(response.data);
        })
        .catch((error) => {
          console.log(error);
          setData((current) => ({
            ...current,
            message: "Unable to check for updates",
          }));
        });
    };

    fetchVersion();

    const intervalId = setInterval(fetchVersion, 60000 * 5);
    return () => clearInterval(intervalId);
  }, [token]);

  useEffect(() => {
    if (!token) return;

    axios
      .get("/api/CheckForUpdates/releases", {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      })
      .then((response) => {
        const releases = response.data?.releases || [];
        setReleaseData({
          releases,
          releases_url: response.data?.releases_url || "https://github.com/After-Shock/silo-barracks/releases",
          channel: response.data?.channel || "stable",
        });
        setSelectedReleaseId(String(releases[0]?.id || ""));
        setReleaseMessage(releases.length ? "" : "No release notes were returned.");
      })
      .catch((error) => {
        console.log(error);
        setReleaseMessage("Unable to load release notes.");
      });
  }, [token]);

  useEffect(() => {
    if (!token) return;

    axios
      .get("/api/github/contributors", {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      })
      .then((response) => {
        const profiles = (response.data?.contributors || []).filter((contributor) => !isBotContributor(contributor));
        setContributors(profiles);
        setContributorsMessage(profiles.length ? "" : "No GitHub profiles found.");
      })
      .catch((error) => {
        console.log(error);
        setContributorsMessage("Unable to load GitHub profiles.");
      });
  }, [token]);

  return (
    <div className="about-page" data-theme-screen="about">
      <header className="about-header">
        <p>About</p>
        <h1>Silo Barracks</h1>
        <span>Local {mediaServerName()} visibility for sessions, libraries, requests, downloads, transcodes, automation health, and scheduled jobs.</span>
      </header>

      <main className="about-layout">
        <section className="about-section">
          <div className="about-project-grid">
            <div className="about-project-copy">
              <h2>Project</h2>
              <p>
                Silo Barracks connects to Silo Server’s native API to show active accounts and profiles,
                playback progress and stream information. Observed playback is stored in PostgreSQL.
                The dashboard is derived from JellyGlance by Nerdy-Technician and contributors.
              </p>

              <div className="about-feature-grid" aria-label="Silo Barracks capabilities">
                <article>
                  <RiPulseLine />
                  <strong>Live status</strong>
                  <span>See active streams, playback method, viewer, client, internal or remote IP, bitrate, transcode progress, and session history.</span>
                </article>
                <article>
                  <RiFilmLine />
                  <strong>Library visibility</strong>
                  <span>Track recent additions, library totals, missing artwork, item details, user activity, watch trends, and media quality signals.</span>
                </article>
                <article>
                  <RiTaskLine />
                  <strong>Operations</strong>
                  <span>Run syncs, backups, imports, health checks, notification tests, repairs, logs, and background maintenance tasks.</span>
                </article>
                <article>
                  <RiDatabase2Line />
                  <strong>Integrations</strong>
                  <span>Connect Seerr, download clients, Sonarr/Radarr/Lidarr, Tdarr, Bazarr, Prowlarr, Tautulli, Jellystat, webhooks, and newsletters.</span>
                </article>
                <article>
                  <RiTaskLine />
                  <strong>Requests</strong>
                  <span>Review pending approvals, per-user queues, availability, issue reports, request trends, and Seerr search results.</span>
                </article>
                <article>
                  <RiDownloadCloud2Line />
                  <strong>Downloads</strong>
                  <span>Monitor torrent and usenet clients with queue state, progress, speeds, ETA, stalled items, and failed jobs.</span>
                </article>
                <article>
                  <RiTimerFlashLine />
                  <strong>Active transcodes</strong>
                  <span>Track Tdarr processing, queued items, history, thumbnails, source-to-target conversion, savings, and live percentages.</span>
                </article>
                <article>
                  <RiRadarLine />
                  <strong>Automation health</strong>
                  <span>Check Bazarr subtitle gaps, subtitle grabs, Prowlarr indexer health, failed indexers, and connected app sync status.</span>
                </article>
                <article>
                  <RiLayoutGridLine />
                  <strong>Custom layouts</strong>
                  <span>Collapse the sidebar, reorder navigation, hide tabs, resize Home widgets, and save browser-specific dashboard layouts.</span>
                </article>
                <article>
                  <RiSettings3Line />
                  <strong>Admin tools</strong>
                  <span>Manage settings, devices, integrations, API keys, webhooks, backups, imports, repair tasks, and application logs.</span>
                </article>
              </div>

              <section className="about-note">
                <h2>How it works</h2>
                <p>
                  Silo Barracks runs beside your Jellyfin server and talks to the configured APIs with your saved settings. The
                  dashboard keeps local cache and task history so pages can show useful operational context without making
                  every view feel like a raw API browser. Optional GitHub data powers release notes and project profile cards
                  on this page.
                </p>
              </section>

              <section className="about-note">
                <h2>What to configure</h2>
                <ul>
                  <li>{mediaServerName()} connection and authentication mode for the main dashboard.</li>
                  <li>Optional Jellyseerr or Overseerr instances for request management, approvals, user queues, issue reports, and request trends.</li>
                  <li>Optional qBittorrent, Transmission, Deluge, SABnzbd, NZBGet, or similar clients for download monitoring.</li>
                  <li>Optional Tdarr for active transcodes, queue, history, conversion detail, thumbnails, and live progress.</li>
                  <li>Optional Bazarr and Prowlarr for subtitle gaps, subtitle history, indexer health, failed indexers, and app sync status.</li>
                  <li>Optional backups, webhooks, newsletter delivery, imports, health monitoring, custom navbar order, hidden tabs, and Home widgets.</li>
                </ul>
              </section>

              <section className="about-contributors">
                <div className="about-profile-group">
                  <h3>Project Owner</h3>
                  <a className="about-owner-card" href={projectOwner.profile_url} target="_blank" rel="noreferrer">
                    <img src={projectOwner.avatar_url} alt="" loading="lazy" />
                    <span>
                      <strong>{projectOwner.login}</strong>
                      <small>{projectOwner.contributions ? `${projectOwner.contributions} contribution${projectOwner.contributions === 1 ? "" : "s"}` : "Project owner"}</small>
                    </span>
                  </a>
                </div>
                <div className="about-profile-group">
                  <h3>Contributors</h3>
                  {contributorsMessage ? <p>{contributorsMessage}</p> : null}
                  <div className="about-contributor-list">
                    {projectContributors.map((contributor) => (
                      <a key={contributor.id || contributor.login} href={contributor.profile_url} target="_blank" rel="noreferrer">
                        <img src={contributor.avatar_url} alt="" loading="lazy" />
                        <span>
                          <strong>{contributor.login}</strong>
                          <small>{contributor.contributions} contribution{contributor.contributions === 1 ? "" : "s"}</small>
                        </span>
                      </a>
                    ))}
                  </div>
                </div>
              </section>
            </div>

            <section className="about-release-notes">
              <div className="about-release-head">
                <div>
                  <h2>{releaseData.channel === "beta" ? "Beta Notes" : "Release Notes"}</h2>
                  <p>Choose a version to review previous changes.</p>
                </div>
                <div className="about-release-picker">
                  <span>Version</span>
                  <button
                    type="button"
                    onClick={() => setReleaseMenuOpen((isOpen) => !isOpen)}
                    disabled={!releaseData.releases.length}
                    aria-haspopup="listbox"
                    aria-expanded={releaseMenuOpen}
                  >
                    <strong>{selectedRelease?.version || "No releases"}</strong>
                    {selectedRelease?.date ? <em>{formatReleaseDate(selectedRelease.date)}</em> : null}
                    <RiArrowDownSLine aria-hidden="true" size={16} />
                  </button>
                  {releaseMenuOpen ? (
                    <div className="about-release-menu" role="listbox" aria-label="Release versions">
                      {releaseData.releases.map((release) => {
                        const releaseId = String(release.id);
                        const selected = releaseId === selectedReleaseId;
                        return (
                          <button
                            key={release.id}
                            type="button"
                            className={selected ? "is-selected" : ""}
                            onClick={() => {
                              setSelectedReleaseId(releaseId);
                              setReleaseMenuOpen(false);
                            }}
                            role="option"
                            aria-selected={selected}
                          >
                            <strong>{release.version}</strong>
                            <em>{formatReleaseDate(release.date)}</em>
                            {selected ? <RiCheckLine aria-hidden="true" size={16} /> : null}
                          </button>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              </div>

              {releaseMessage ? <div className="about-release-empty">{releaseMessage}</div> : null}

              {selectedRelease ? (
                <article className="about-release-card">
                  <header>
                    <div>
                      <RiPriceTag3Line />
                      <strong>{selectedRelease.version}</strong>
                      {selectedRelease.prerelease ? <span>Pre-release</span> : null}
                    </div>
                    <time dateTime={selectedRelease.date || undefined}>{formatReleaseDate(selectedRelease.date)}</time>
                  </header>

                  {selectedReleaseSections.map((section) => (
                    <section key={section.title}>
                      <h3>{section.title}</h3>
                      <ul>
                        {section.items.map((item, index) => (
                          <li key={`${section.title}-${index}`}>{item}</li>
                        ))}
                      </ul>
                    </section>
                  ))}

                  <a href={selectedRelease.url || releaseData.releases_url} target="_blank" rel="noreferrer">
                    View full release on GitHub
                  </a>
                </article>
              ) : null}
            </section>
          </div>
        </section>

        <aside className="about-sidebar">
          <section className="about-install">
            <h2>Install</h2>
            <dl>
              <div>
                <dt>
                  <RiGitBranchLine />
                  Version
                </dt>
                <dd>
                  {data.current_version}
                  {data.current_version && /-(alpha|beta|rc|pre|preview)/i.test(data.current_version) ? <span className="release-channel-badge">Beta channel</span> : null}
                </dd>
              </div>
              <div className={data.update_available ? "is-update" : ""}>
                <dt>
                  <RiHeartPulseLine />
                  Updates
                </dt>
                <dd>
                  <a href={data.releases_url || "https://github.com/After-Shock/silo-barracks/releases"} target="_blank" rel="noreferrer">
                    {updateMessage}
                  </a>
                </dd>
              </div>
              <div>
                <dt>
                  <RiFilmLine />
                  Media source
                </dt>
                <dd>{mediaServerName()}</dd>
              </div>
              <div>
                <dt>
                  <RiShieldCheckLine />
                  License
                </dt>
                <dd>GPL-3.0</dd>
              </div>
            </dl>
          </section>

          <section className="about-links">
            <h2>Links</h2>
            <a href="https://discord.gg/dMGhv8j2kx" target="_blank" rel="noreferrer">
              <RiPulseLine />
              Join Discord
            </a>
            <Link to="/settings/api-key">
              <RiCodeSSlashLine />
              API / Swagger
            </Link>
            <a href="https://jellyglance.com/" target="_blank" rel="noreferrer">
              <RiRadarLine />
              Website
            </a>
            <a href="https://docs.jellyglance.com/" target="_blank" rel="noreferrer">
              <RiCodeSSlashLine />
              Documentation
            </a>
            <a href="https://github.com/After-Shock/silo-barracks/issues/new/choose" target="_blank" rel="noreferrer">
              <RiGithubFill />
              Documentation feedback
            </a>
            <a href="https://github.com/After-Shock/silo-barracks/tree/main/docs" target="_blank" rel="noreferrer">
              <RiGithubFill />
              Documentation source
            </a>
            <a href="https://github.com/After-Shock/silo-barracks" target="_blank" rel="noreferrer">
              <RiGithubFill />
              Source code
            </a>
            <a href="https://github.com/After-Shock/silo-barracks/pkgs/container/jellyglance" target="_blank" rel="noreferrer">
              <RiArchiveLine />
              Container image
            </a>
            <a href="https://github.com/Nerdy-Technician" target="_blank" rel="noreferrer">
              <RiGithubFill />
              Maintainer profile
            </a>
            <a href="https://buymeacoffee.com/nerdytechnician" target="_blank" rel="noreferrer">
              <RiHeartPulseLine />
              Buy me a coffee
            </a>
          </section>
        </aside>
      </main>
    </div>
  );
}
