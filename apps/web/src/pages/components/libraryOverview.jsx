import "../css/libraryOverview.css";
import { useState, useEffect } from "react";
import axios from "../../lib/axios_instance";
import Loading from "./general/loading";

import LibraryStatComponent from "./libraryStatCard/library-stat-component";

import { RiCheckboxMultipleBlankLine, RiFileMusicLine, RiFilmLine, RiTvLine } from "@remixicon/react";
import { Trans } from "react-i18next";
import i18next from "i18next";

export default function LibraryOverView() {
  const token = localStorage.getItem("token");
  const SeriesIcon = <RiTvLine size={"100%"} />;
  const MovieIcon = <RiFilmLine size={"100%"} />;
  const MusicIcon = <RiFileMusicLine size={"100%"} />;
  const MixedIcon = <RiCheckboxMultipleBlankLine size={"100%"} />;
  const [data, setData] = useState();

  useEffect(() => {
    const fetchData = () => {
      const url = `/stats/getLibraryOverview`;
      axios
        .get(url, {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        })
        .then((response) => setData(response.data))
        .catch((error) => console.log(error));
    };

    if (!data) {
      fetchData();
    }
  }, [data, token]);

  if (!data) {
    return <Loading />;
  }

  return (
    <div>
      <h1 className="my-3">
        <Trans i18nKey="HOME_PAGE.LIBRARY_OVERVIEW" />
      </h1>
      <div className="overview-container">
        <LibraryStatComponent
          data={data.filter((stat) => stat.CollectionType === "movies")}
          heading={<Trans i18nKey="LIBRARY_OVERVIEW.MOVIE_LIBRARIES" />}
          units={<Trans i18nKey="MOVIES" />}
          icon={MovieIcon}
        />
        <LibraryStatComponent
          data={data.filter((stat) => stat.CollectionType === "tvshows")}
          heading={<Trans i18nKey="LIBRARY_OVERVIEW.SHOW_LIBRARIES" />}
          units={`${i18next.t("SERIES")} / ${i18next.t("SEASONS")} / ${i18next.t("EPISODES")}`}
          icon={SeriesIcon}
        />
        <LibraryStatComponent
          data={data.filter((stat) => stat.CollectionType === "music")}
          heading={<Trans i18nKey="LIBRARY_OVERVIEW.MUSIC_LIBRARIES" />}
          units={<Trans i18nKey="SONGS" />}
          icon={MusicIcon}
        />
        <LibraryStatComponent
          data={data.filter((stat) => stat.CollectionType === "mixed")}
          heading={<Trans i18nKey="LIBRARY_OVERVIEW.MIXED_LIBRARIES" />}
          units={<Trans i18nKey="UNITS.ITEMS" />}
          icon={MixedIcon}
        />
      </div>
    </div>
  );
}
