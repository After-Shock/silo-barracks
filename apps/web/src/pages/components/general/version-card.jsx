import { useState, useEffect } from "react";
import axios from "../../../lib/axios_instance";
import StarFillIcon from "remixicon-react/StarFillIcon";

import { formatDisplayVersion as formatReleaseVersion, isBetaVersion } from "../../../lib/release-channel";
import "../../css/settings/version.css";

function formatDisplayVersion(version) {
  return version === "Loading" ? version : formatReleaseVersion(version);
}


export default function VersionCard() {

  const token = localStorage.getItem('token');
  const [data, setData] = useState({ current_version: "Loading", update_available: false, stars: null });

  useEffect(() => {

    const fetchVersion = () => {
      axios
        .get("/auth/isConfigured")
        .then((response) => {
          setData((current) => ({
            ...current,
            current_version: response.data.version || current.current_version,
          }));
        })
        .catch(() => {});

      if (token) {
        const url = `/api/CheckForUpdates`;

        axios
        .get(url, {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        })
          .then((data) => {
            setData(data.data);
          })
          .catch(() => {});
      }
    };
    fetchVersion();

    const intervalId = setInterval(fetchVersion, 60000 * 5);
    return () => clearInterval(intervalId);
  }, [token]);


    return (
    <div className="version">
        <div>
          Silo Barracks {formatDisplayVersion(data.current_version)}
          {isBetaVersion(data.current_version) ? (
            <span className="release-channel-badge version-channel-badge" title="This build is on the beta channel">Beta channel</span>
          ) : null}
        </div>
        <div className="version-community-row">
          <a href="https://github.com/After-Shock/silo-barracks" target="_blank" rel="noreferrer">Project repository</a>
          <a href="https://discord.gg/dMGhv8j2kx" target="_blank" rel="noreferrer">Join Discord</a>
          {Number.isFinite(data.stars) ? (
            <a
              className="version-stars"
              href={data.repository_url || "https://github.com/After-Shock/silo-barracks"}
              target="_blank"
              rel="noreferrer"
            >
              <StarFillIcon size={12} />
              {data.stars.toLocaleString()} {data.stars === 1 ? "star" : "stars"}
            </a>
          ) : null}
        </div>

        {data.update_available ? (
          <div>
            <a href={data.releases_url || "https://github.com/After-Shock/silo-barracks/releases"} target="_blank" rel="noreferrer" style={{ color: "var(--secondary-color)" }}>
              New version available: {data.latest_version}
            </a>
          </div>
        ) : null}
    </div>
    );


}
