
import axios from "../../../lib/axios_instance";
import i18next from "i18next";
import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Trans } from "react-i18next";
import { useNavigate } from "react-router-dom";


function ItemOptions(props) {

  const token = localStorage.getItem('token');
  const [show, setShow] = useState(false);
  const options=[
    {
      description:i18next.t("PURGE_OPTIONS.PURGE_CACHE"),
      withActivity:false
    },
    {
      description: i18next.t("PURGE_OPTIONS.PURGE_CACHE_WITH_ACTIVITY"),
      withActivity:true
    }
  ];
  const [selectedOption, setSelectedOption] = useState(options[0]);
  const navigate = useNavigate();



  async function execPurge(withActivity) {
    const url=`/api/item/purge`;

    return await axios.delete(url,

        {
        data:{
                id: props.itemid,
                withActivity:withActivity,
            },
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      }).then(() => {
        setShow(false);
        navigate(-1);
      }).catch((error) => {
        console.log("Unable to purge item cache", error);
      });
  }



  return (
    <div className="Activity">
        <div className="Heading mb-3">
            <h1><Trans i18nKey="ITEM_INFO.ARCHIVED_DATA_OPTIONS"/></h1>
        </div>
        <div>
            {options.map((option, index) => (
                <div className="item-option-row" key={index}>
                    <div>
                        <span>{option.description}</span>
                    </div>

                    <Button variant="destructive" className="w-25" onClick={()=>{setSelectedOption(option);setShow(true);}}><Trans i18nKey="ITEM_INFO.PURGE"/></Button>

                </div>

                ))}

            <Dialog open={show} onOpenChange={(open) => { if (!open) { setShow(false); } }}>
                <DialogContent showCloseButton={false}>
                    <DialogTitle><Trans i18nKey="ITEM_INFO.CONFIRM_ACTION"/></DialogTitle>
                    <DialogDescription className="tw:sr-only">Confirm this cache purge before it runs</DialogDescription>
                    <p>{i18next.t("ITEM_INFO.CONFIRM_ACTION_MESSAGE")+(selectedOption.withActivity ? ` ${i18next.t("ITEM_INFO.CONFIRM_ACTION_MESSAGE_2")}?` : "?")}</p>
                    <DialogFooter>
                      <Button variant="destructive" onClick={() => {execPurge(selectedOption.withActivity);}}>
                      <Trans i18nKey="ITEM_INFO.PURGE"/>
                      </Button>
                      <Button onClick={()=>{setShow(false);}}>
                      <Trans i18nKey="CLOSE"/>
                      </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

        </div>


    </div>
  );
}

export default ItemOptions;
