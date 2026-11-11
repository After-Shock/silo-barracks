import { useParams } from "react-router-dom";
import { useState, useEffect } from "react";
import axios from "../../lib/axios_instance";
import { RiAccountCircleFill } from "@remixicon/react";
import Config from "../../lib/config";

import LastPlayed from "./user-info/lastplayed";
import UserActivity from "./user-info/user-activity";
import "../css/users/user-details.css";
import { Trans } from "react-i18next";
import baseUrl from "../../lib/baseurl";
import GlobalStats from "./general/globalStats";
import ActivityTimeline from "../activity_time_line";
import GenreUserStats from "./user-info/genre-user-stats.jsx";

function UserInfo() {
  const { UserId } = useParams();
  const [data, setData] = useState();
  const [imgError, setImgError] = useState(false);
  const [config, setConfig] = useState();
  const [activeTab, setActiveTab] = useState("tabOverview");

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const newConfig = await Config.getConfig();
        setConfig(newConfig);
      } catch (error) {
        console.log(error);
      }
    };

    const fetchData = async () => {
      if (config) {
        try {
          const userData = await axios.post(
            `/api/getUserDetails`,
            {
              userid: UserId,
            },
            {
              headers: {
                Authorization: `Bearer ${config.token}`,
                "Content-Type": "application/json",
              },
            }
          );
          setData(userData.data);
        } catch (error) {
          console.log(error);
        }
      }
    };
    fetchData();

    if (!config) {
      fetchConfig();
    }

    const intervalId = setInterval(fetchData, 60000 * 5);
    return () => clearInterval(intervalId);
  }, [config, UserId]);

  const handleImageError = () => {
    setImgError(true);
  };

  if (!data || !config) {
    return <></>;
  }

  return (
    <div>
      <div className="user-detail-container">
        <div className="user-image-container">
          {imgError ? (
            <RiAccountCircleFill size={"100%"} />
          ) : (
            <img
              className="user-image"
              src={baseUrl + "/proxy/Users/Images/Primary?id=" + UserId + "&quality=100"}
              onError={handleImageError}
              alt=""
            ></img>
          )}
        </div>

        <div>
          <p className="user-name">{data.Name}</p>
          <nav className="nav nav-pills" role="tablist" aria-label="User views">
            <div className="nav-item">
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === "tabOverview"}
                className={`nav-link ${activeTab === "tabOverview" ? "active" : ""}`.trim()}
                onClick={() => setActiveTab("tabOverview")}
              >
                <Trans i18nKey="TAB_CONTROLS.OVERVIEW" />
              </button>
            </div>
            <div className="nav-item">
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === "tabActivity"}
                className={`nav-link ${activeTab === "tabActivity" ? "active" : ""}`.trim()}
                onClick={() => setActiveTab("tabActivity")}
              >
                <Trans i18nKey="TAB_CONTROLS.ACTIVITY" />
              </button>
            </div>
            <div className="nav-item">
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === "tabTimeline"}
                className={`nav-link ${activeTab === "tabTimeline" ? "active" : ""}`.trim()}
                onClick={() => setActiveTab("tabTimeline")}
              >
                <Trans i18nKey="TAB_CONTROLS.TIMELINE" />
              </button>
            </div>
          </nav>
        </div>
      </div>

      <div className="user-detail-tab-content">
        {activeTab === "tabOverview" && (
          <div>
            <GlobalStats
              id={UserId}
              param={"userid"}
              endpoint={"getGlobalUserStats"}
              title={<Trans i18nKey="USERS_PAGE.USER_STATS" />}
            />
            <GenreUserStats UserId={UserId} />
            <LastPlayed UserId={UserId} />
          </div>
        )}
        {activeTab === "tabActivity" && <UserActivity UserId={UserId} />}
        {activeTab === "tabTimeline" && <ActivityTimeline preselectedUser={UserId} />}
      </div>
    </div>
  );
}
export default UserInfo;
