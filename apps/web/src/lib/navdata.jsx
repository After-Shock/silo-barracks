

import { RiBarChartFill, RiCalendarEventFill, RiChatCheckFill, RiCpuFill, RiDownloadCloud2Fill, RiGalleryFill, RiHistoryFill, RiHomeFill, RiInformationFill, RiMovie2Fill, RiServerFill, RiSettingsFill, RiTimeFill, RiUserFill } from "@remixicon/react";
import { Trans } from 'react-i18next';


export const navData = [
    {
        id: 0,
        icon: <RiHomeFill/>,
        text: <Trans i18nKey="MENU_TABS.HOME" />,
        label: "Home",
        link: ""
    },
    {
        id: 1,
        icon: <RiMovie2Fill />,
        text: "Recently Added",
        label: "Recently Added",
        link: "recently-added"
    },
    {
        id: 2,
        icon: <RiGalleryFill />,
        text: <Trans i18nKey="MENU_TABS.LIBRARIES" />,
        label: "Libraries",
        link: "libraries"
    },
    {
        id: 3,
        icon: <RiUserFill />,
        text: <Trans i18nKey="MENU_TABS.USERS" />,
        label: "Users",
        link: "users"
    },
    {
        id: 4,
        icon: <RiHistoryFill />,
        text: <Trans i18nKey="MENU_TABS.ACTIVITY" />,
        label: "Activity",
        link: "activity"
    },
    {
        id: 16,
        icon: <RiTimeFill />,
        text: <Trans i18nKey="MENU_TABS.TIMELINE" />,
        label: "Timeline",
        link: "timeline"
    },
    {
        id: 5,
        icon: <RiCalendarEventFill />,
        text: "Calendar",
        label: "Calendar",
        link: "calendar"
    },
    {
        id: 6,
        icon: <RiChatCheckFill />,
        text: "Requests",
        label: "Requests",
        link: "requests"
    },
    {
        id: 7,
        icon: <RiDownloadCloud2Fill />,
        text: "Downloads",
        label: "Downloads",
        link: "downloads"
    },
    {
        id: 8,
        icon: <RiCpuFill />,
        text: "Active Transcodes",
        label: "Active Transcodes",
        link: "active-transcodes"
    },
    {
        id: 11,
        icon: <RiBarChartFill />,
        text: <Trans i18nKey="MENU_TABS.STATISTICS" />,
        label: "Statistics",
        link: "statistics"
    },

    {
        id: 12,
        icon: <RiServerFill />,
        text: <Trans i18nKey="MENU_TABS.SERVER" />,
        label: "Server",
        link: "server-management"
    },
    {
        id: 13,
        icon: <RiSettingsFill />,
        text: <Trans i18nKey="MENU_TABS.SETTINGS" />,
        label: "Settings",
        link: "settings"
    }
    ,

    {
        id: 14,
        icon: <RiInformationFill />,
        text: <Trans i18nKey="MENU_TABS.ABOUT" />,
        label: "About",
        link: "about"
    }

]
