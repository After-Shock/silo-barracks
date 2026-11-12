import React from "react";
import Loading from "./general/loading";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import axios from "../../lib/axios_instance";
import { Trans } from "react-i18next";

export default function IpInfoModal(props) {
  const token = localStorage.getItem("token");
  const [geodata, setGeodata] = React.useState(null);
  const fetchData = async () => {
    const result = await axios.post(
      `/utils/geolocateIp`,
      {
        ipAddress: props.ipAddress,
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      }
    );

    setGeodata(result.data);
  };

  if (!geodata && props.show) {
    fetchData();
  }

  return (
    <Dialog
      open={Boolean(props.show)}
      onOpenChange={(open) => {
        if (!open) {
          props.onHide();
        }
      }}
    >
      <DialogContent className="tw:max-w-[640px] tw:sm:max-w-[640px]" showCloseButton={false}>
        <DialogTitle>
          <Trans i18nKey={"GEOLOCATION_INFO_FOR"} /> {props.ipAddress}
        </DialogTitle>
        <DialogDescription className="tw:sr-only">Geolocation details for the session IP address</DialogDescription>
        {geodata ? (
          <div className="StreamInfo">
            <TableContainer className="overflow-hidden">
              <Table aria-label="collapsible table">
                <TableHead>
                  <TableRow>
                    <TableCell />
                    <TableCell></TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {geodata.city?.names["en"] && (
                    <TableRow>
                      <TableCell className="py-0 pb-1">
                        <Trans i18nKey={"CITY"} />
                      </TableCell>
                      <TableCell>{geodata.city.names["en"]}</TableCell>
                    </TableRow>
                  )}
                  {geodata.country?.names["en"] && (
                    <TableRow>
                      <TableCell className="py-0 pb-1">
                        <Trans i18nKey={"COUNTRY"} />
                      </TableCell>
                      <TableCell>{geodata.country.names["en"]}</TableCell>
                    </TableRow>
                  )}
                  {geodata.postal?.code && (
                    <TableRow>
                      <TableCell className="py-0 pb-1">
                        <Trans i18nKey={"POSTCODE"} />
                      </TableCell>
                      <TableCell>{geodata.postal.code}</TableCell>
                    </TableRow>
                  )}
                  {geodata.traits?.autonomous_system_organization && (
                    <TableRow>
                      <TableCell className="py-0 pb-1">
                        <Trans i18nKey={"ISP"} />
                      </TableCell>
                      <TableCell>{geodata.traits.autonomous_system_organization}</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
              {geodata.location?.latitude && geodata.location?.longitude && (
                <iframe
                  width="100%"
                  height="450"
                  style={{ border: 0 }}
                  loading="async"
                  referrerPolicy="no-referrer-when-downgrade"
                  src={`https://www.google.com/maps/embed/v1/place?key=AIzaSyAxp7Zvxi5FnTJJHwCnUR-OcZ-E1H2-gf4&q=${geodata.location?.latitude},${geodata.location?.longitude}&zoom=14`}
                  allowFullScreen
                ></iframe>
              )}
            </TableContainer>
          </div>
        ) : (
          <Loading />
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => props.onHide()}>
            <Trans i18nKey={"CLOSE"} />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
