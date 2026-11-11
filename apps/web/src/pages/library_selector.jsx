import { useState, useEffect } from "react";
import axios from "../lib/axios_instance";
import Config from "../lib/config";

import "./css/library/libraries.css";
import Loading from "./components/general/loading";
import SelectionCard from "./components/LibrarySelector/SelectionCard";
import ErrorBoundary from "./components/general/ErrorBoundary";
import { RiInformationLine, RiSave3Line } from "@remixicon/react";

import { Tooltip } from "@mui/material";
import { Button } from "@/components/ui/button";
import DismissibleAlert from "./components/settings/dismissible-alert";
import { Trans } from "react-i18next";

function LibrarySelector() {
  const [data, setData] = useState();
  const [config, setConfig] = useState(null);
  const [showLibraryCardNames, setShowLibraryCardNames] = useState(true);
  const [savingDisplaySettings, setSavingDisplaySettings] = useState(false);
  const [displaySettingsMessage, setDisplaySettingsMessage] = useState(null);

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const newConfig = await Config.getConfig();
        setConfig(newConfig);
        setShowLibraryCardNames(newConfig?.settings?.ShowLibraryCardNames !== false);
      } catch (error) {
        if (error.code === "ERR_NETWORK") {
          console.log(error);
        }
      }
    };

    const fetchLibraries = () => {
      if (config) {
        const url = `/api/TrackedLibraries`;
        axios
          .get(url, {
            headers: {
              Authorization: `Bearer ${config.token}`,
              "Content-Type": "application/json",
            },
          })
          .then((data) => {
            setData(data.data);
          })
          .catch((error) => {
            console.log(error);
          });
      }
    };

    if (!config) {
      fetchConfig();
    }

    fetchLibraries();
    const intervalId = setInterval(fetchLibraries, 60000 * 60);
    return () => clearInterval(intervalId);
  }, [config]);

  async function saveDisplaySettings(event) {
    event.preventDefault();

    try {
      setSavingDisplaySettings(true);
      setDisplaySettingsMessage(null);
      await axios.post(
        "/api/library-display-settings",
        { showLibraryCardNames },
        {
          headers: {
            Authorization: `Bearer ${config.token}`,
            "Content-Type": "application/json",
          },
        }
      );
      await Config.setConfig();
      setDisplaySettingsMessage({ type: "success", text: "Library display settings saved." });
    } catch (error) {
      setDisplaySettingsMessage({ type: "danger", text: error.response?.data?.error || "Unable to save library display settings." });
    } finally {
      setSavingDisplaySettings(false);
    }
  }

  if (!data) {
    return <Loading />;
  }

  return (
    <div className="libraries">
      <h1 className="py-4">
        <Trans i18nKey={"SETTINGS_PAGE.SELECT_LIBRARIES_TO_IMPORT"} />{" "}
        <Tooltip title={<Trans i18nKey={"SETTINGS_PAGE.SELECT_LIBRARIES_TO_IMPORT_TOOLTIP"} />}>
          <span>
            {" "}
            <RiInformationLine />
          </span>
        </Tooltip>
      </h1>

      <form className="library-display-settings" onSubmit={saveDisplaySettings}>
        <div>
          <span>Library Cards</span>
          <strong>Display library names</strong>
          <small>Hide names when your library artwork already includes the same profile or collection text.</small>
        </div>
        <label className="form-check form-switch">
          <input
            id="show-library-card-names"
            type="checkbox"
            role="switch"
            className="form-check-input"
            checked={showLibraryCardNames}
            onChange={(event) => setShowLibraryCardNames(event.target.checked)}
          />
          <span>Show library names on cards</span>
        </label>
        <Button type="submit" disabled={savingDisplaySettings}>
          <RiSave3Line size={16} />
          <span>{savingDisplaySettings ? "Saving..." : "Save"}</span>
        </Button>
      </form>

      {displaySettingsMessage ? (
        <DismissibleAlert type={displaySettingsMessage.type} onClose={() => setDisplaySettingsMessage(null)}>
          {displaySettingsMessage.text}
        </DismissibleAlert>
      ) : null}

      <div xs={1} md={2} lg={4} className="g-0 libraries-container">
        {data &&
          data.map((item) => (
            <ErrorBoundary key={item.Id}>
              <SelectionCard data={item} base_url={config.settings?.EXTERNAL_URL ?? config.hostUrl} />
            </ErrorBoundary>
          ))}
      </div>
    </div>
  );
}

export default LibrarySelector;
