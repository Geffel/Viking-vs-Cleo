const $ = (selector) => document.querySelector(selector);
const ui = {
  summary: $('#summary'), users: $('#users'), empty: $('#empty-users'), global: $('#global-stats'), audit: $('#audit-list'),
  search: $('#search'), role: $('#role-filter'), migration: $('#migration-filter'), status: $('#status-filter'),
  previous: $('#previous-page'), next: $('#next-page'), pageLabel: $('#page-label'), count: $('#result-count'),
  drawer: $('#player-drawer'), backdrop: $('#drawer-backdrop'), title: $('#drawer-title'), badges: $('#drawer-badges'),
  content: $('#drawer-content'), tabs: $('#tabs'), dialog: $('#dialog'), dialogContent: $('#dialog-content'), toast: $('#toast'),
};
const list = { page: 1, pageSize: 25, sort: 'username', direction: 'asc', total: 0, pages: 1 };
let overview;
let selected;
let activeTab = 'overview';
let searchTimer;

await refreshDashboard();
$('#add-user').addEventListener('click', showAddUser);
$('#clear-filters').addEventListener('click', clearFilters);
$('#close-drawer').addEventListener('click', closeDrawer);
$('#refresh-audit').addEventListener('click', loadAudit);
ui.backdrop.addEventListener('click', closeDrawer);
ui.previous.addEventListener('click', () => changePage(list.page - 1));
ui.next.addEventListener('click', () => changePage(list.page + 1));
ui.search.addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(filtersChanged, 250); });
for (const control of [ui.role, ui.migration, ui.status]) control.addEventListener('change', filtersChanged);
ui.tabs.addEventListener('click', (event) => { const button = event.target.closest('[data-tab]'); if (button) switchTab(button.dataset.tab); });
document.addEventListener('click', handleClick);
document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && selected) closeDrawer(); });

async function refreshDashboard() {
  try {
    [overview] = await Promise.all([request('/api/admin/overview'), loadUsers(), loadAudit()]);
    renderOverview();
  } catch (error) { notify(error.message, true); }
}

function renderOverview() {
  ui.summary.innerHTML = [
    ['Konton', overview.summary.accounts, 'Totalt antal spelare'], ['Admins', overview.summary.admins, 'Behöriga administratörer'],
    ['Migrerade', overview.summary.migrated, 'Legacy-profiler flyttade'], ['Väntar', overview.summary.pendingMigration, 'Legacy-profiler kvar'],
    ['Nya konton', overview.summary.native, 'Skapade i kontosystemet'],
  ].map(([label, value, hint]) => `<div class="metric"><span>${label}</span><b>${value}</b><small>${hint}</small></div>`).join('');
  ui.global.innerHTML = ['cleo', 'viking'].map((team) => `<div class="global-card"><span>Team ${capitalize(team)}</span><b>${overview.globalStats.factionWins[team]}</b><button class="secondary" data-global-reset="factionWins.${team}">Resetta</button></div>`).join('');
}

async function loadUsers() {
  const params = new URLSearchParams({ page: list.page, pageSize: list.pageSize, sort: list.sort, direction: list.direction });
  if (ui.search.value.trim()) params.set('search', ui.search.value.trim());
  if (ui.role.value) params.set('role', ui.role.value);
  if (ui.migration.value) params.set('migration', ui.migration.value);
  if (ui.status.value === 'password') params.set('password', 'required'); else if (ui.status.value) params.set('status', ui.status.value);
  const data = await request(`/api/admin/users?${params}`);
  Object.assign(list, { page: data.page, pages: data.pages, total: data.total });
  ui.users.innerHTML = data.users.map(userRow).join('');
  ui.empty.hidden = data.users.length > 0;
  ui.count.textContent = `${list.total} spelare`;
  ui.pageLabel.textContent = `Sida ${list.page} av ${list.pages}`;
  ui.previous.disabled = list.page <= 1; ui.next.disabled = list.page >= list.pages;
  document.querySelectorAll('[data-sort]').forEach((button) => {
    button.classList.toggle('active', button.dataset.sort === list.sort);
    button.querySelector('span').textContent = button.dataset.sort === list.sort ? (list.direction === 'asc' ? '↑' : '↓') : '';
  });
}

function userRow(user) {
  const id = user.kind === 'legacy' ? user.profileId : user.accountId;
  return `<tr data-user-id="${id}" data-user-kind="${user.kind}" tabindex="0"><td class="name"><span class="avatar">${escapeHtml(user.username[0].toUpperCase())}</span><span><b>${escapeHtml(user.username)}</b><small>${user.kind === 'legacy' ? `legacy profile #${user.profileId}` : `konto #${user.accountId}`}</small></span></td>
    <td>${user.kind === 'legacy' ? '<span class="tag">Legacyprofil</span>' : `<span class="tag role-${user.role}">${capitalize(user.role)}</span>`}</td><td><div class="status-stack"><span class="status ${user.online ? 'online' : ''}">${user.online ? 'Online' : 'Offline'}</span>${user.mustChangePassword ? '<span class="tag warning">Lösenordsbyte</span>' : ''}</div></td>
    <td>${migrationBadge(user.migrationStatus)}</td><td>${relativeDate(user.lastSeenAt)}</td><td><button class="row-open" data-open-user="${id}" data-open-kind="${user.kind}" aria-label="Öppna ${escapeHtml(user.username)}">›</button></td></tr>`;
}

async function openUser(id, tab = 'overview', kind = 'account') {
  try {
    selected = await request(kind === 'legacy' ? `/api/admin/legacy-profiles/${id}` : `/api/admin/users/${id}`); activeTab = tab;
    ui.drawer.removeAttribute('hidden'); ui.backdrop.hidden = false; ui.drawer.setAttribute('aria-hidden', 'false');
    document.body.classList.add('drawer-open'); renderSelected();
  } catch (error) { notify(error.message, true); }
}

function closeDrawer() { ui.drawer.setAttribute('aria-hidden', 'true'); ui.backdrop.hidden = true; document.body.classList.remove('drawer-open'); selected = null; }
function switchTab(tab) { activeTab = tab; renderSelected(); }
function renderSelected() {
  if (!selected) return;
  ui.title.textContent = selected.username; ui.badges.innerHTML = userBadges(selected);
  ui.tabs.querySelectorAll('[data-tab]').forEach((button) => button.classList.toggle('active', button.dataset.tab === activeTab));
  ({ overview: renderPlayerOverview, stats: renderStats, achievements: renderAchievements, account: renderAccount })[activeTab]();
}

function renderPlayerOverview() {
  ui.content.innerHTML = `<div class="detail-metrics"><div><span>Statistikvärden</span><b>${selected.statTotal}</b></div><div><span>Achievements</span><b>${selected.achievementCount}</b></div><div><span>Skapad</span><b class="date-value">${date(selected.createdAt)}</b></div><div><span>Senast aktiv</span><b class="date-value">${date(selected.lastSeenAt)}</b></div></div>
    <section class="detail-section"><h3>Snabbåtgärder</h3><div class="action-grid"><button data-user-tab="stats">Visa statistik</button><button data-user-tab="achievements">Visa achievements</button>${selected.kind === 'legacy' ? '<button class="secondary" data-user-tab="account">Visa migrationsinfo</button>' : `<button class="secondary" data-password="${selected.accountId}">Temporärt lösenord</button><button class="secondary" data-user-tab="account">Hantera konto</button>`}</div></section>`;
}

function renderStats() {
  ui.content.innerHTML = `<div class="section-toolbar"><label class="search-field"><span>Sök statistik</span><input id="stat-search" type="search" placeholder="Namn eller teknisk nyckel…" /></label>${selected.kind === 'account' ? '<button class="danger ghost" data-reset-all>Resetta allt</button>' : ''}</div><div id="stat-groups">${statGroupsHtml(groupStats(selected.stats))}</div>`;
  $('#stat-search').addEventListener('input', (event) => { $('#stat-groups').innerHTML = statGroupsHtml(groupStats(selected.stats, event.target.value)); });
}

function statGroupsHtml(groups) {
  if (!groups.length) return '<div class="empty">Ingen statistik matchar sökningen.</div>';
  return groups.map((group, index) => `<details class="stat-group"${index < 2 ? ' open' : ''}><summary><span><b>${escapeHtml(group.label)}</b><small>${group.items.length} värden</small></span><span class="summary-actions">${selected.kind === 'account' ? `<button class="danger ghost mini" data-reset-group="${escapeHtml(group.prefix)}">Resetta grupp</button>` : ''}<i>⌄</i></span></summary><div>${group.items.map((item) => `<div class="stat-row"><span><b>${escapeHtml(statName(item.path))}</b><code>${escapeHtml(item.path)}</code></span><span><strong>${formatValue(item.value, item.path)}</strong>${selected.kind === 'account' ? `<button class="secondary mini" data-reset-path="${escapeHtml(item.path)}">Resetta</button>` : ''}</span></div>`).join('')}</div></details>`).join('');
}

function renderAchievements() {
  const groups = selected.achievements.reduce((result, item) => { (result[item.category] ??= []).push(item); return result; }, {});
  ui.content.innerHTML = `<div class="achievement-summary"><b>${selected.achievementCount}</b><span>av ${selected.achievements.length} upplåsta</span></div>${Object.entries(groups).map(([category, items]) => `<section class="achievement-group"><h3>${escapeHtml(category)}</h3><div class="achievement-list">${items.map((item) => `<div class="achievement ${item.unlockedAt ? 'unlocked' : ''}"><span class="achievement-icon">${item.unlockedAt ? '✓' : '○'}</span><span><b>${escapeHtml(item.title)}</b><small>${escapeHtml(item.description)}</small></span>${item.unlockedAt && selected.kind === 'account' ? `<button class="secondary mini" data-reset-path="achievements.unlocked.${escapeHtml(item.id)}">Resetta</button>` : ''}</div>`).join('')}</div></section>`).join('')}`;
}

function renderAccount() {
  if (selected.kind === 'legacy') {
    ui.content.innerHTML = `<section class="detail-section"><h3>Väntar på migrering</h3><p>Det här är en äldre profil och ännu inget konto. Spelaren behöver öppna spelet från sin tidigare webbläsare och skapa sitt lösenord för att slutföra migreringen.</p><p class="notice">När migreringen är klar ändras statusen automatiskt till Migrerad legacy-profil och kontofunktionerna blir tillgängliga.</p></section>`;
    return;
  }
  ui.content.innerHTML = `<section class="detail-section"><h3>Behörighet</h3><p class="muted">Nya konton får Player. Admin ger full åtkomst till panelen.</p><div class="role-picker"><label><input type="radio" name="role" value="player" ${selected.role === 'player' ? 'checked' : ''}/><span><b>Player</b><small>Kan spela men inte administrera.</small></span></label><label><input type="radio" name="role" value="admin" ${selected.role === 'admin' ? 'checked' : ''}/><span><b>Admin</b><small>Full åtkomst till adminpanelen.</small></span></label></div></section>
    <section class="detail-section"><h3>Inloggning</h3><button class="secondary" data-password="${selected.accountId}">Generera temporärt lösenord</button>${selected.mustChangePassword ? '<p class="notice">Spelaren måste byta lösenord vid nästa inloggning.</p>' : ''}</section>
    <section class="danger-zone"><h3>Farliga åtgärder</h3><p>Åtgärderna påverkar spelarens data och kan inte ångras.</p><div><button class="danger ghost" data-reset-all>Resetta all statistik</button><button class="danger" data-delete="${selected.accountId}">Ta bort konto</button></div></section>`;
  ui.content.querySelectorAll('input[name="role"]').forEach((input) => input.addEventListener('change', () => changeRole(input.value)));
}

async function handleClick(event) {
  const target = event.target;
  const sort = target.closest('[data-sort]'); const row = target.closest('tr[data-user-id]'); const open = target.closest('[data-open-user]');
  if (sort) return setSort(sort.dataset.sort);
  if (open || (row && !target.closest('button,input,select,a'))) return openUser(Number(open?.dataset.openUser ?? row.dataset.userId), 'overview', open?.dataset.openKind ?? row.dataset.userKind);
  const tab = target.closest('[data-user-tab]'); if (tab) return switchTab(tab.dataset.userTab);
  const password = target.closest('[data-password]'); if (password) return resetPassword(Number(password.dataset.password));
  const remove = target.closest('[data-delete]'); if (remove) return deleteUser(Number(remove.dataset.delete));
  const resetPath = target.closest('[data-reset-path]'); if (resetPath) return resetStat(resetPath.dataset.resetPath);
  const resetGroup = target.closest('[data-reset-group]'); if (resetGroup) return resetStat(`group:${resetGroup.dataset.resetGroup}`, true);
  if (target.closest('[data-reset-all]')) return resetAllStats();
  const globalReset = target.closest('[data-global-reset]'); if (globalReset) return resetGlobal(globalReset.dataset.globalReset);
}

async function changeRole(role) { try { await request(`/api/admin/users/${selected.accountId}/role`, { method: 'PATCH', body: { role } }); notify('Rollen har uppdaterats'); await reloadSelected(); await refreshData(); } catch (error) { notify(error.message, true); await reloadSelected(); } }
async function loadAudit() { try { const data = await request('/api/admin/audit?limit=20'); ui.audit.innerHTML = data.entries.length ? data.entries.map(auditRow).join('') : '<div class="empty">Inga adminåtgärder ännu.</div>'; } catch (error) { notify(error.message, true); } }
function auditRow(entry) { return `<div class="audit-entry"><span class="audit-icon">${entry.action.includes('reset') ? '↺' : entry.action.includes('delete') ? '×' : entry.action.includes('role') ? '◆' : '+'}</span><span><b>${escapeHtml(entry.actorName)}</b> ${escapeHtml(auditText(entry))}<small>${date(entry.createdAt)}</small></span></div>`; }
function auditText(entry) { const target = entry.targetName ?? entry.details?.username ?? (entry.targetAccountId ? `konto #${entry.targetAccountId}` : 'serverstatistik'); return ({ 'user.create': `skapade ${target}`, 'user.role': `ändrade rollen för ${target} till ${entry.details?.to ?? ''}`, 'user.password_reset': `skapade temporärt lösenord för ${target}`, 'user.delete': `tog bort ${target}`, 'stats.reset': `återställde statistik för ${target}`, 'global_stats.reset': 'återställde teamstatistik' })[entry.action] ?? `${entry.action} – ${target}`; }

function showAddUser() {
  ui.dialogContent.innerHTML = `<h2>Lägg till spelare</h2><p class="muted">Kontot får Player och måste ersätta sitt temporära lösenord vid första inloggningen.</p><div class="form-grid"><label>Spelarnamn<input id="new-name" maxlength="14" required autofocus /></label><button id="create-user" type="button">Skapa konto</button></div>`; ui.dialog.showModal();
  $('#create-user').onclick = async () => { try { const result = await request('/api/admin/users', { method: 'POST', body: { name: $('#new-name').value } }); showSecret(result.username, result.temporaryPassword); await refreshData(); } catch (error) { notify(error.message, true); } };
}
async function resetPassword(accountId) { const username = selected?.accountId === accountId ? selected.username : 'spelaren'; if (!confirm(`Skapa ett nytt temporärt lösenord för ${username}? Alla aktiva sessioner loggas ut.`)) return; try { const result = await request(`/api/admin/users/${accountId}/password`, { method: 'POST', body: {} }); showSecret(username, result.temporaryPassword); await refreshData(); if (selected) await reloadSelected(false); } catch (error) { notify(error.message, true); } }
function showSecret(username, secret) { ui.dialogContent.innerHTML = `<h2>Temporärt lösenord</h2><p>Kopiera lösenordet nu. Det visas endast en gång.</p><p><b>${escapeHtml(username)}</b></p><div class="secret">${escapeHtml(secret)}</div><button id="copy-secret" type="button">Kopiera lösenord</button>`; if (!ui.dialog.open) ui.dialog.showModal(); $('#copy-secret').onclick = async () => { await navigator.clipboard.writeText(secret); notify('Lösenordet har kopierats'); }; }
async function resetStat(path, group = false) { if (!confirm(`Resetta ${group ? `hela gruppen ${path.slice(6)}` : path}? Åtgärden kan inte ångras.`)) return; await performReset(path, 'Statistiken har återställts'); }
async function resetAllStats() { if (prompt(`Skriv ${selected.username} för att bekräfta att all statistik ska återställas.`) !== selected.username) return; await performReset('all', 'All statistik har återställts'); }
async function performReset(path, message) { try { await request(`/api/admin/users/${selected.accountId}/reset-stat`, { method: 'POST', body: { path } }); notify(message); await reloadSelected(); await refreshData(); } catch (error) { notify(error.message, true); } }
async function resetGlobal(path) { if (!confirm(`Resetta ${path === 'all' ? 'alla teamvinster' : path}?`)) return; try { const result = await request('/api/admin/global-stats/reset', { method: 'POST', body: { path } }); overview.globalStats = result.globalStats; renderOverview(); notify('Teamstatistiken har återställts'); await loadAudit(); } catch (error) { notify(error.message, true); } }
async function deleteUser(accountId) { if (prompt(`Skriv ${selected.username} för att permanent ta bort kontot och all statistik.`) !== selected.username) return; try { await request(`/api/admin/users/${accountId}`, { method: 'DELETE' }); closeDrawer(); notify('Kontot har tagits bort'); await refreshData(); } catch (error) { notify(error.message, true); } }

function groupStats(stats, search = '') { const labels = { points: 'Poäng', playMs: 'Speltid', seen: 'Sessioner', teamPlayMs: 'Team', killsAgainst: 'Besegrade motståndare', deathsBy: 'Förluster mot spelare', matches: 'Matcher', combat: 'Strid', abilities: 'Förmågor', combos: 'Combos', powerups: 'Powerups', achievements: 'Achievements' }; const needle = search.trim().toLowerCase(); const groups = new Map(); for (const item of stats) { if (needle && !item.path.toLowerCase().includes(needle) && !statName(item.path).toLowerCase().includes(needle)) continue; const parts = item.path.split('.'); const root = parts[0] === 'stats' ? parts[1] : parts[0]; const prefix = parts[0] === 'stats' ? `stats.${root}` : root; if (!groups.has(prefix)) groups.set(prefix, { prefix, label: labels[root] ?? capitalize(root), items: [] }); groups.get(prefix).items.push(item); } return [...groups.values()]; }
function userBadges(user) { return `${user.kind === 'legacy' ? '<span class="tag">Legacyprofil</span>' : `<span class="tag role-${user.role}">${capitalize(user.role)}</span>`}<span class="status ${user.online ? 'online' : ''}">${user.online ? 'Online' : 'Offline'}</span>${migrationBadge(user.migrationStatus)}${user.mustChangePassword ? '<span class="tag warning">Lösenordsbyte krävs</span>' : ''}`; }
function migrationBadge(status) { const values = { migrated: ['Migrerad legacy', 'ok'], native: ['Nytt konto', 'native'], pending: ['Väntar på migrering', 'pending'], blocked: ['Blockerad legacy', 'warning'] }; const [label, tone] = values[status] ?? ['Okänd', '']; return `<span class="tag ${tone}">${label}</span>`; }
function statName(path) { return path.split('.').at(-1).replace(/([a-z])([A-Z])/g, '$1 $2').replaceAll('_', ' ').replace(/^./, (letter) => letter.toUpperCase()); }
function formatValue(value, path) { if (path.endsWith('playMs') || path === 'playMs') { const minutes = Math.floor(Number(value) / 60000); return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h ${minutes % 60} min`; } return new Intl.NumberFormat('sv-SE').format(value); }
function date(timestamp) { return timestamp ? new Intl.DateTimeFormat('sv-SE', { dateStyle: 'medium', timeStyle: 'short' }).format(timestamp) : 'Aldrig'; }
function relativeDate(timestamp) { if (!timestamp) return '<span class="muted">Aldrig</span>'; const diff = Date.now() - timestamp; if (diff < 60000) return 'Nyss'; if (diff < 3600000) return `${Math.floor(diff / 60000)} min sedan`; if (diff < 86400000) return `${Math.floor(diff / 3600000)} h sedan`; return date(timestamp); }
async function reloadSelected(render = true) { selected = await request(selected.kind === 'legacy' ? `/api/admin/legacy-profiles/${selected.profileId}` : `/api/admin/users/${selected.accountId}`); if (render) renderSelected(); }
async function refreshData() { overview = await request('/api/admin/overview'); await Promise.all([loadUsers(), loadAudit()]); renderOverview(); }
function filtersChanged() { list.page = 1; loadUsers().catch((error) => notify(error.message, true)); }
function clearFilters() { ui.search.value = ''; ui.role.value = ''; ui.migration.value = ''; ui.status.value = ''; filtersChanged(); }
function changePage(page) { if (page < 1 || page > list.pages) return; list.page = page; loadUsers().catch((error) => notify(error.message, true)); }
function setSort(sort) { if (list.sort === sort) list.direction = list.direction === 'asc' ? 'desc' : 'asc'; else { list.sort = sort; list.direction = sort === 'username' ? 'asc' : 'desc'; } loadUsers().catch((error) => notify(error.message, true)); }
async function request(url, options = {}) { const response = await fetch(url, { method: options.method ?? 'GET', credentials: 'same-origin', headers: options.body ? { 'Content-Type': 'application/json' } : {}, body: options.body ? JSON.stringify(options.body) : undefined }); if (response.status === 204) return null; const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(data.message || `Anropet misslyckades (${response.status})`); return data; }
function capitalize(value) { return value ? value[0].toUpperCase() + value.slice(1) : ''; }
function escapeHtml(value) { return String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char])); }
function notify(message, error = false) { ui.toast.textContent = message; ui.toast.classList.toggle('error', error); ui.toast.classList.add('on'); setTimeout(() => ui.toast.classList.remove('on'), 3000); }
