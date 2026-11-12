import { RiBarChartFill, RiCalendarEventFill, RiChatCheckFill, RiCpuFill, RiDownloadCloud2Fill, RiGalleryFill, RiHistoryFill, RiHomeFill, RiInformationFill, RiMovie2Fill, RiServerFill, RiSettingsFill, RiTimeFill, RiUserFill, RiUserStarFill } from "@remixicon/react";
import { Trans } from 'react-i18next';


export const navData = [
    {
        id: 0,
        icon: <RiHomeFill/>,
        text: <Trans i18nKey="MENU_TABS.HOME" />,
        label: "Home",
        i18nKey: "MENU_TABS.HOME",
        link: ""
    },
    {
        id: 1,
        icon: <RiMovie2Fill />,
        text: <Trans i18nKey="MENU_TABS.RECENTLY_ADDED" />,
        label: "Recently Added",
        i18nKey: "MENU_TABS.RECENTLY_ADDED",
        link: "recently-added"
    },
    {
        id: 2,
        icon: <RiGalleryFill />,
        text: <Trans i18nKey="MENU_TABS.LIBRARIES" />,
        label: "Libraries",
        i18nKey: "MENU_TABS.LIBRARIES",
        link: "libraries"
    },
    {
        id: 3,
        icon: <RiUserFill />,
        text: <Trans i18nKey="MENU_TABS.USERS" />,
        label: "Users",
        i18nKey: "MENU_TABS.USERS",
        link: "users"
    },
    {
        id: 4,
        icon: <RiHistoryFill />,
        text: <Trans i18nKey="MENU_TABS.ACTIVITY" />,
        label: "Activity",
        i18nKey: "MENU_TABS.ACTIVITY",
        link: "activity"
    },
    {
        id: 16,
        icon: <RiTimeFill />,
        text: <Trans i18nKey="MENU_TABS.TIMELINE" />,
        label: "Timeline",
        i18nKey: "MENU_TABS.TIMELINE",
        link: "timeline"
    },
    {
        id: 5,
        icon: <RiCalendarEventFill />,
        text: <Trans i18nKey="MENU_TABS.CALENDAR" />,
        label: "Calendar",
        i18nKey: "MENU_TABS.CALENDAR",
        link: "calendar"
    },
    {
        id: 6,
        icon: <RiChatCheckFill />,
        text: <Trans i18nKey="MENU_TABS.REQUESTS" />,
        label: "Requests",
        i18nKey: "MENU_TABS.REQUESTS",
        link: "requests"
    },
    {
        id: 7,
        icon: <RiDownloadCloud2Fill />,
        text: <Trans i18nKey="MENU_TABS.DOWNLOADS" />,
        label: "Downloads",
        i18nKey: "MENU_TABS.DOWNLOADS",
        link: "downloads"
    },
    {
        id: 8,
        icon: <RiCpuFill />,
        text: <Trans i18nKey="MENU_TABS.ACTIVE_TRANSCODES" />,
        label: "Active Transcodes",
        i18nKey: "MENU_TABS.ACTIVE_TRANSCODES",
        link: "active-transcodes"
    },
    {
        id: 11,
        icon: <RiBarChartFill />,
        text: <Trans i18nKey="MENU_TABS.STATISTICS" />,
        label: "Statistics",
        i18nKey: "MENU_TABS.STATISTICS",
        link: "statistics"
    },

    {
        id: 12,
        icon: <RiServerFill />,
        text: <Trans i18nKey="MENU_TABS.SERVER" />,
        label: "Server",
        i18nKey: "MENU_TABS.SERVER",
        link: "server-management"
    },
    {
        id: 17,
        icon: <RiUserStarFill />,
        text: <Trans i18nKey="MENU_TABS.MY_GLANCE" />,
        label: "My Glance",
        i18nKey: "MENU_TABS.MY_GLANCE",
        link: "me"
    },
    {
        id: 13,
        icon: <RiSettingsFill />,
        text: <Trans i18nKey="MENU_TABS.SETTINGS" />,
        label: "Settings",
        i18nKey: "MENU_TABS.SETTINGS",
        link: "settings"
    }
    ,

    {
        id: 14,
        icon: <RiInformationFill />,
        text: <Trans i18nKey="MENU_TABS.ABOUT" />,
        label: "About",
        i18nKey: "MENU_TABS.ABOUT",
        link: "about"
    }

]
