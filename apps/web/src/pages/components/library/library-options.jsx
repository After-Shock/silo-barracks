import axios from "../../../lib/axios_instance";
import i18next from "i18next";
import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Trans } from "react-i18next";
import { useNavigate } from "react-router-dom";

function LibraryOptions(props) {
  const token = localStorage.getItem("token");
  const [show, setShow] = useState(false);
  const options = [
    {
      description: i18next.t("PURGE_OPTIONS.PURGE_LIBRARY_CACHE"),
      withActivity: false,
      isLibraryArchived: true,
      url: `/api/library/purge`,
    },
    {
      description: i18next.t("PURGE_OPTIONS.PURGE_LIBRARY_CACHE_WITH_ACTIVITY"),
      withActivity: true,
      isLibraryArchived: true,
      url: `/api/library/purge`,
    },
    {
      description: i18next.t("PURGE_OPTIONS.PURGE_LIBRARY_ITEMS_CACHE"),
      withActivity: false,
      isLibraryArchived: false,
      url: `/api/libraryItems/purge`,
    },
    {
      description: i18next.t("PURGE_OPTIONS.PURGE_LIBRARY_ITEMS_CACHE_WITH_ACTIVITY"),
      withActivity: true,
      isLibraryArchived: false,
      url: `/api/libraryItems/purge`,
    },
  ];
  const [selectedOption, setSelectedOption] = useState(options[0]);
  const navigate = useNavigate();

  async function execPurge(url, withActivity) {
    return await axios
      .delete(
        url,

        {
          data: {
            id: props.LibraryId,
            withActivity: withActivity,
          },
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        }
      )
      .then(() => {
        setShow(false);
        navigate(-1);
      })
      .catch((error) => {
        console.log("Unable to purge library cache", error);
      });
  }

  return (
    <div className="library-options-panel">
      <div className="library-options-heading">
        <div>
          <span>Cache maintenance</span>
          <h1>
            <Trans i18nKey="ITEM_INFO.ARCHIVED_DATA_OPTIONS" />
          </h1>
        </div>
      </div>

      <div className="library-options-list">
        {options
          .filter((option) => option.isLibraryArchived == props.isArchived)
          .map((option, index) => (
            <article className="library-option-row" key={index}>
              <div>
                <strong>{option.description}</strong>
                <span>{option.withActivity ? "Removes cached items and linked activity data for this library." : "Removes cached library item data only."}</span>
              </div>
              <Button
                variant="destructive"
                onClick={() => {
                  setSelectedOption(option);
                  setShow(true);
                }}
              >
                <Trans i18nKey="ITEM_INFO.PURGE" />
              </Button>
            </article>
          ))}
      </div>

      <Dialog
        open={show}
        onOpenChange={(open) => {
          if (!open) {
            setShow(false);
          }
        }}
      >
        <DialogContent showCloseButton={false}>
          <DialogTitle>
            <Trans i18nKey="ITEM_INFO.CONFIRM_ACTION" />
          </DialogTitle>
          <DialogDescription className="tw:sr-only">Confirm this cache purge before it runs</DialogDescription>
          <p>
            {i18next.t("ITEM_INFO.CONFIRM_ACTION_MESSAGE") +
              (selectedOption.withActivity ? ` ${i18next.t("ITEM_INFO.CONFIRM_ACTION_MESSAGE_2")}?` : "?")}
          </p>
          <DialogFooter>
            <Button
              variant="destructive"
              onClick={() => {
                execPurge(selectedOption.url, selectedOption.withActivity);
              }}
            >
              <Trans i18nKey="ITEM_INFO.PURGE" />
            </Button>
            <Button
              onClick={() => {
                setShow(false);
              }}
            >
              <Trans i18nKey="CLOSE" />
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default LibraryOptions;
