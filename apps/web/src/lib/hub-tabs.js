// Which hub tabs a viewer can see; shared by the navbar and the hub pages.
export const usersHubTabIds = ({ wizarr }) => (wizarr ? ['users', 'invites'] : ['users']);

export function serverHubTabIds({ isAdmin, isSilo, automation }) {
  const ids = [];
  if (isAdmin && !isSilo) ids.push('jobs'); // Jellyfin scheduled jobs; Silo has no equivalent
  if (automation) ids.push('automation');
  return ids;
}

export const showServerNav = (flags) => serverHubTabIds(flags).length > 0;

export const pickTab = (visibleIds, requested) =>
  (visibleIds.includes(requested) ? requested : visibleIds[0] ?? null);

// Role, Silo mode and the integration availability the navbar caches.
export function readFlags() {
  let config = {};
  try { config = JSON.parse(localStorage.getItem('config') || '{}'); } catch { /* use defaults */ }
  const role = config?.settings?.auth?.role || 'Viewer';
  const flag = (key) => { try { return localStorage.getItem(key) === 'true'; } catch { return false; } };
  return {
    isAdmin: role === 'Owner' || role === 'Admin',
    isSilo: config?.IS_SILO === true,
    wizarr: flag('silo_barracks_wizarr_nav_available'),
    automation: flag('silo_barracks_automation_health_nav_available'),
  };
}
