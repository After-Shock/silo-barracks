import { useState } from "react";
// import TableHead from "@mui/material/TableHead";
// import TableRow from "@mui/material/TableRow";
// import { Trans } from "react-i18next";
// import i18next from "i18next";

import Loading from "../general/loading";

function LibraryFilterModal(props) {
  if (!props || !props.libraries) {
    return <Loading />;
  }

  const handleLibrarySelection = (event) => {
    const selectedOptions = props.selectedLibraries.find((library) => library === event.target.value)
      ? props.selectedLibraries.filter((library) => library !== event.target.value)
      : [...props.selectedLibraries, event.target.value];

    props.onSelectionChange(selectedOptions);
  };

  return (
    <div className="library-filter-modal px-5 py-2">
      <div>
        {props.libraries.map((library) => (
          <label className="form-check" key={library.Id}>
            <input
              className="form-check-input"
              type="checkbox"
              id={library.Id}
              value={library.Id}
              onChange={handleLibrarySelection}
              checked={props.selectedLibraries.includes(library.Id)}
            />
            <span>{library.Name}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

export default LibraryFilterModal;
