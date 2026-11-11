import React, { useEffect } from "react";
import axios from "../../../lib/axios_instance";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent } from "@/components/ui/collapsible";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import AddCircleFillIcon from 'remixicon-react/AddCircleFillIcon';
import IndeterminateCircleFillIcon from 'remixicon-react/IndeterminateCircleFillIcon';



import "../../css/settings/backups.css";

import TerminalComponent from "./TerminalComponent";
import { Trans } from "react-i18next";

const token = localStorage.getItem('token');


function Row(logs) {
  const { data } = logs;
  const [open, setOpen] = React.useState(false);


  const twelve_hr = JSON.parse(localStorage.getItem('12hr'));

  const options = {
    day: "numeric",
    month: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    hour12: twelve_hr,
  };


  
function formatDurationTime(seconds) {
  if(seconds==='0')
  {
    return '0 second'; 
  }

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;

  let timeString = '';

  if (hours > 0) {
    timeString += `${hours} ${hours === 1 ? 'hr' : 'hrs'} `;
  }

  if (minutes > 0) {
    timeString += `${minutes} ${minutes === 1 ? 'min' : 'mins'} `;
  }

  if (remainingSeconds > 0) {
    timeString += `${remainingSeconds} ${remainingSeconds === 1 ? 'second' : 'seconds'}`;
  }

  return timeString.trim();
}


  return (
    <React.Fragment>
      <TableRow className="settings-logs-row">
        <TableCell>
          <Button
            variant="ghost"
            size="icon"
            className="settings-logs-expand"
            aria-label="expand row"
            aria-expanded={open}
            onClick={() => {if(data.Log !== null && data.Log.length>0){setOpen(!open);}}}
            >
              {!open ? <AddCircleFillIcon opacity={data.Log !== null && data.Log.length>0 ?1 : 0} cursor={data.Log !== null && data.Log.length>1 ? "pointer":"default"}/> : <IndeterminateCircleFillIcon />}
          </Button>
        </TableCell>
        <TableCell>{data.Name}</TableCell>
        <TableCell>{data.Type}</TableCell>
        <TableCell>{Intl.DateTimeFormat('en-UK', options).format(new Date(data.TimeRun))}</TableCell>
        <TableCell>{formatDurationTime(data.Duration)}</TableCell>
        <TableCell>{data.ExecutionType}</TableCell>
        <TableCell><Badge variant="destructive" className={`settings-logs-result ${ data.Result.toLowerCase() ==='success' ? 'is-success' : data.Result.toLowerCase() ==='running' ? 'is-running' : 'is-failed'}`} >{data.Result}</Badge></TableCell>

      </TableRow>
      <TableRow className="settings-logs-detail-row">
        <TableCell style={{ paddingBottom: 0, paddingTop: 0 }} colSpan={7}>
          <Collapsible open={open}>
            <CollapsibleContent className="settings-logs-collapse">
            <div className="settings-logs-detail">

              <Table aria-label="sub-activity" className='rounded-2'>

                <TableBody>
                <TableRow key={data.Id}>
                        <TableCell colSpan="7" ><TerminalComponent data={data.Log}/></TableCell>
                    </TableRow>
                </TableBody>
              </Table>
            </div>
            </CollapsibleContent>
          </Collapsible>
        </TableCell>
      </TableRow>
    </React.Fragment>
  );
}


export default function Logs() {

    const [data, setData]=React.useState([]);
    const [rowsPerPage] = React.useState(10);
    const [page, setPage] = React.useState(0);
    const sortedLogs = [...data].sort((a, b) =>new Date(b.TimeRun) - new Date(a.TimeRun));
    const pageStart = data.length ? page * rowsPerPage + 1 : 0;
    const pageEnd = Math.min(page * rowsPerPage + rowsPerPage, data.length);





useEffect(() => {
    const fetchData = async () => {
      try {
        const logs = await axios.get(`/logs/getLogs`, {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        });
        setData(logs.data);
      } catch (error) {
        console.log(error);
      }
    };

    fetchData();

    const intervalId = setInterval(fetchData, 1000 * 5);
    return () => clearInterval(intervalId);
  }, []);


const handleNextPageClick = () => {
  setPage((prevPage) => prevPage + 1);
};

const handlePreviousPageClick = () => {
  setPage((prevPage) => prevPage - 1);
};
      

    
      return (
        <div className="settings-logs-page">
          <h1 className="my-2"><Trans i18nKey={"SETTINGS_PAGE.LOGS"}/></h1>

            <div className='settings-logs-table rounded-2'>
                    <Table aria-label="collapsible table" >
                      <TableHeader>
                        <TableRow>
                        <TableHead/>
                          <TableHead><Trans i18nKey={"SETTINGS_PAGE.NAME"}/></TableHead>
                          <TableHead><Trans i18nKey={"TYPE"}/></TableHead>
                          <TableHead><Trans i18nKey={"DATE"}/></TableHead>
                          <TableHead><Trans i18nKey={"SETTINGS_PAGE.DURATION"}/></TableHead>
                          <TableHead><Trans i18nKey={"SETTINGS_PAGE.EXECUTION_TYPE"}/></TableHead>
                          <TableHead><Trans i18nKey={"SETTINGS_PAGE.RESULTS"}/></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {sortedLogs.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)
                          .map((log,index) => (
                            <Row key={index} data={log} />
                          ))}
                          {data.length===0 ? <TableRow><TableCell colSpan="7" className='settings-logs-empty py-2'><Trans i18nKey={"ERROR_MESSAGES.NO_LOGS"}/></TableCell></TableRow> :''}

                            
                      </TableBody>
                    </Table>
            </div>

            <div className='d-flex justify-content-end my-2'>
              


                <div role="group" className="pagination-buttons tw:inline-flex">
                    <Button className="page-btn" onClick={()=>setPage(0)} disabled={page === 0}>
                    <Trans i18nKey={"TABLE_NAV_BUTTONS.FIRST"}/>
                    </Button>

                    <Button className="page-btn" onClick={handlePreviousPageClick}  disabled={page === 0}>
                    <Trans i18nKey={"TABLE_NAV_BUTTONS.PREVIOUS"}/>
                    </Button>

                    <div className="page-number d-flex align-items-center justify-content-center">{`${pageStart}-${pageEnd} of ${data.length}`}</div>

                    <Button className="page-btn" onClick={handleNextPageClick}  disabled={page >= Math.ceil(data.length / rowsPerPage) - 1}>
                    <Trans i18nKey={"TABLE_NAV_BUTTONS.NEXT"}/>
                    </Button>

                    <Button className="page-btn" onClick={()=>setPage(Math.ceil(data.length / rowsPerPage) - 1)} disabled={page >= Math.ceil(data.length / rowsPerPage) - 1}>
                    <Trans i18nKey={"TABLE_NAV_BUTTONS.LAST"}/>
                    </Button>
                </div>
            </div>       
        </div>
      );


}
