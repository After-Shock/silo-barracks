import { useState } from "react";
import axios from "../../../lib/axios_instance";
import "../../css/library/library-card.css";

import { RiCheckboxMultipleBlankLine, RiFileMusicLine, RiFilmLine, RiTvLine } from "@remixicon/react";
import { Trans } from "react-i18next";
import baseUrl from "../../../lib/baseurl";

function SelectionCard(props) {
  const [imageLoaded, setImageLoaded] = useState(true);
  const [checked, setChecked] = useState(props.data.Tracked);
  const SeriesIcon = <RiTvLine size={"50%"} color="var(--barracks-text-overlay)" />;
  const MovieIcon = <RiFilmLine size={"50%"} color="var(--barracks-text-overlay)" />;
  const MusicIcon = <RiFileMusicLine size={"50%"} color="var(--barracks-text-overlay)" />;
  const MixedIcon = <RiCheckboxMultipleBlankLine size={"50%"} color="var(--barracks-text-overlay)" />;
  const token = localStorage.getItem("token");

  const libraryType =
    props.data.CollectionType === "tvshows" ? (
      <Trans i18nKey="SERIES" />
    ) : props.data.CollectionType === "movies" ? (
      <Trans i18nKey="MOVIES" />
    ) : props.data.CollectionType === "music" ? (
      <Trans i18nKey="MUSIC" />
    ) : (
      "Mixed"
    );
  const default_image = (
    <div className="default_library_image-inv d-flex justify-content-center align-items-center">
      {props.data.CollectionType === "tvshows" ? SeriesIcon : props.data.CollectionType === "movies" ? MovieIcon : props.data.CollectionType === "music" ? MusicIcon : MixedIcon}{" "}
    </div>
  );

  const handleChange = async () => {
    await axios
      .post(
        "/api/setExcludedLibraries",
        {
          libraryID: props.data.Id,
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        }
      )
      .then(() => {
        setChecked((current) => !current);
      })
      .catch((error) => {
        console.error(error);
      });
  };

  return (
    <div className={`bg-transparent lib-card selector-library-card rounded-3 ${checked ? "is-tracked" : "is-untracked"}`}>
      <div className="library-card-image selector-library-image">
        {imageLoaded ? (
          <img
            className="library-card-banner default_library_image"
            src={baseUrl + "/proxy/Items/Images/Primary?id=" + props.data.Id + "&fillWidth=520&quality=48"}
            loading="lazy"
            decoding="async"
            onError={() => setImageLoaded(false)}
          />
        ) : (
          default_image
        )}
        <div className="selector-library-overlay" />
      </div>

      <div className="library-card-details-inv">
        <div className="space-between-end card-row">
          <div className="col card-label">
            <Trans i18nKey={"LIBRARY_CARD.LIBRARY"} />
          </div>
          <div className="col text-end">{props.data.Name}</div>
        </div>

        <div className="space-between-end card-row">
          <div className="col card-label">
            <Trans i18nKey={"TYPE"} />
          </div>
          <div className="col text-end">{libraryType}</div>
        </div>

        <div className="space-between-end card-row">
          <div className="col card-label">
            <Trans i18nKey={"LIBRARY_CARD.TRACKED"} />
          </div>
          <div className="col text-end">
            <form className="form">
              <label className="form-check form-switch">
                <input
                  type="checkbox"
                  className="form-check-input"
                  checked={checked}
                  onChange={handleChange}
                />
              </label>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}

export default SelectionCard;
