// Which hub tabs a viewer can see; shared by the navbar and the hub pages.
export const usersHubTabIds = ({ wizarr }) => (wizarr ? ['users', 'invites'] : ['users']);

export function serverHubTabIds({ isAdmin, isSilo, automation }) {
  const ids = [];
  if (isAdmin && !isSilo) ids.push('jobs'); // Jellyfin scheduled jobs; Silo has no equivalent
  if (automation) ids.push('automation');
  return ids;
}

export const showServerNav = (flags) => serverHubTabIds(flags).length > 0;

// Tabs a URL may open even when hidden from the nav (Server Jobs never on Silo).
export const serverHubReachableIds = ({ isAdmin, isSilo }) => (isAdmin && !isSilo ? ['jobs', 'automation'] : ['automation']);

// Visibility only drives the nav and tab bar; an explicitly requested reachable tab still opens.
export function resolveHubTabs({ visible, reachable, requested }) {
  const active = visible.includes(requested) || reachable.includes(requested) ? requested : visible[0] ?? null;
  const shown = active && !visible.includes(active) ? [...visible, active] : visible;
  return { active, shown };
}

// localStorage keys the navbar writes after checking integrations.
export const WIZARR_NAV_AVAILABLE_KEY = 'silo_barracks_wizarr_nav_available';
export const AUTOMATION_HEALTH_NAV_AVAILABLE_KEY = 'silo_barracks_automation_health_nav_available';

// Role, Silo mode and the integration availability the navbar caches.
export function readFlags() {
  let config = {};
  try { config = JSON.parse(localStorage.getItem('config') || '{}'); } catch { /* use defaults */ }
  const role = config?.settings?.auth?.role || 'Viewer';
  const flag = (key) => { try { return localStorage.getItem(key) === 'true'; } catch { return false; } };
  return {
    isAdmin: role === 'Owner' || role === 'Admin',
    isSilo: config?.IS_SILO === true,
    wizarr: flag(WIZARR_NAV_AVAILABLE_KEY),
    automation: flag(AUTOMATION_HEALTH_NAV_AVAILABLE_KEY),
  };
}
