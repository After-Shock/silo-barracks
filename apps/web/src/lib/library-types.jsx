import i18next from "i18next";
import { RiBookOpenLine, RiCheckboxMultipleBlankLine, RiClapperboardLine, RiFileMusicLine, RiFilmLine, RiImageLine, RiMovieLine, RiTvLine, RiVideoLine } from "@remixicon/react";

// Library collection types as Jellyfin and Emby report them. Books libraries hold both books and
// audiobooks. Anything unknown (folders, null) is shown as mixed.
const LIBRARY_TYPES = {
  movies: { icon: RiFilmLine, key: "MOVIES" },
  tvshows: { icon: RiTvLine, key: "TVSHOWS" },
  music: { icon: RiFileMusicLine, key: "MUSIC" },
  musicvideos: { icon: RiVideoLine, key: "MUSICVIDEOS" },
  homevideos: { icon: RiMovieLine, key: "HOMEVIDEOS" },
  books: { icon: RiBookOpenLine, key: "BOOKS" },
  photos: { icon: RiImageLine, key: "PHOTOS" },
  trailers: { icon: RiClapperboardLine, key: "TRAILERS" },
  mixed: { icon: RiCheckboxMultipleBlankLine, key: "MIXED" },
};

// The original four keep their existing, already translated overview headings.
const OVERVIEW_HEADINGS = {
  movies: "LIBRARY_OVERVIEW.MOVIE_LIBRARIES",
  tvshows: "LIBRARY_OVERVIEW.SHOW_LIBRARIES",
  music: "LIBRARY_OVERVIEW.MUSIC_LIBRARIES",
  mixed: "LIBRARY_OVERVIEW.MIXED_LIBRARIES",
};

export const LIBRARY_TYPE_ORDER = Object.keys(LIBRARY_TYPES);

export function libraryTypeKey(collectionType) {
  const value = String(collectionType || "").toLowerCase();
  return LIBRARY_TYPES[value] ? value : "mixed";
}

// icon: the remixicon component; label: "Movie library"; name: "Movies"; units: what the item count means.
export function libraryTypeMeta(collectionType) {
  const type = libraryTypeKey(collectionType);
  const { icon, key } = LIBRARY_TYPES[type];
  return {
    type,
    icon,
    label: i18next.t(`LIBRARY_TYPES.${key}_LIBRARY`),
    name: i18next.t(`LIBRARY_TYPES.${key}`),
    heading: i18next.t(OVERVIEW_HEADINGS[type] || `LIBRARY_TYPES.${key}_LIBRARIES`),
    units: i18next.t(`LIBRARY_TYPES.${key}_UNITS`),
  };
}
