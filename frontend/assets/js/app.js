const API_BASE = window.APP_CONFIG?.API_BASE || 'http://localhost:4000';
const page = document.body.dataset.page;
const requiredRole = document.body.dataset.role;
const requireAuthOnly = document.body.dataset.auth === 'true';
const AUTH_STORAGE_KEY = 'park_auth';
const SIDEBAR_COLLAPSE_KEY = 'sidebar_collapsed';
let refreshSummary = null;
const topbarNoticeState = {
 persistent: null,
 items: [],
 counter: 0,
 unreadIds: new Set(),
 timers: new Map(),
};
const topbarToastState = {
 items: [],
 counter: 0,
 timers: new Map(),
};
const notificationFeedState = {
 initialized: false,
 snapshot: null,
 intervalId: null,
};

function padDatePart(value) {
 return String(value).padStart(2, '0');
}

function formatNumericDate(value) {
 const date = value instanceof Date ? value : new Date(value);
 if (Number.isNaN(date.getTime())) return String(value);
 return `${padDatePart(date.getDate())}/${padDatePart(date.getMonth() + 1)}/${date.getFullYear()}`;
}

function formatNumericTime(value) {
 const date = value instanceof Date ? value : new Date(value);
 if (Number.isNaN(date.getTime())) return String(value);
 return `${padDatePart(date.getHours())}:${padDatePart(date.getMinutes())}`;
}

function formatNumericDateTime(value) {
 const date = value instanceof Date ? value : new Date(value);
 if (Number.isNaN(date.getTime())) return String(value);
 return `${formatNumericDate(date)} ${formatNumericTime(date)}`;
}

function formatNumericShortDate(value) {
 const date = value instanceof Date ? value : new Date(value);
 if (Number.isNaN(date.getTime())) return String(value);
 return `${padDatePart(date.getDate())}/${padDatePart(date.getMonth() + 1)}`;
}

const SLOT_LAYOUT_ORDER = [
 'A-01',
 'A-02',
 'A-03',
 'A-04',
 'A-05',
 'A-06',
 'A-07',
 'A-08',
 'B-01',
 'B-02',
 'B-03',
 'B-04',
 'B-05',
 'B-06',
 'B-07',
 'B-08',
 'C-01',
 'C-02',
 'C-03',
 'C-04',
 'C-05',
 'C-06',
 'C-07',
 'C-08',
];

const SLOT_LAYOUT_INDEX = new Map(
 SLOT_LAYOUT_ORDER.map((slotNumber, index) => [slotNumber.toUpperCase(), index])
);

function getSlotDisplayKey(slot) {
 return String(slot?.slot_number || slot?.slot_id || '')
  .trim()
  .toUpperCase();
}

function formatSlotSketchLabel(value) {
 const label = String(value || '').trim().toUpperCase();
 const match = label.match(/^([A-Z]+)-?0*([0-9]+)$/);
 if (match) {
  return `${match[1]}${match[2]}`;
 }
 return label.replace(/-/g, '');
}

function sortSlotsForDisplay(slots = []) {
 return [...slots].sort((left, right) => {
  const leftKey = getSlotDisplayKey(left);
  const rightKey = getSlotDisplayKey(right);
  const leftOrder = SLOT_LAYOUT_INDEX.get(leftKey);
  const rightOrder = SLOT_LAYOUT_INDEX.get(rightKey);

  if (leftOrder !== undefined && rightOrder !== undefined) {
   return leftOrder - rightOrder;
  }
  if (leftOrder !== undefined) return -1;
  if (rightOrder !== undefined) return 1;
  return leftKey.localeCompare(rightKey, undefined, { numeric: true });
 });
}

function parseJwt(token) {
 try {
  const payload = token.split('.')[1];
  const decoded = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
  return JSON.parse(decoded);
 } catch (err) {
  return null;
 }
}

function saveAuth(token, user) {
 const payload = parseJwt(token);
 const expiresAt = payload?.exp ? payload.exp * 1000 : Date.now() + 24 * 60 * 60 * 1000;
 const data = { token, user, expiresAt };
 localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(data));
}

function updateAuthUser(updates) {
 const auth = loadAuth();
 if (!auth?.user) return;
 auth.user = { ...auth.user, ...updates };
 localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(auth));
}

function loadAuth() {
 const raw = localStorage.getItem(AUTH_STORAGE_KEY);
 if (!raw) return null;
 try {
  return JSON.parse(raw);
 } catch (err) {
  return null;
 }
}

function clearAuth() {
 localStorage.removeItem(AUTH_STORAGE_KEY);
}

function getAuth() {
 const auth = loadAuth();
 if (!auth) return null;
 if (auth.expiresAt && Date.now() > auth.expiresAt) {
  clearAuth();
  return null;
 }
 return auth;
}

function roleHome(role) {
 if (role === 'admin') return 'admin.html';
 if (role === 'attendant') return 'attendant.html';
 return 'driver.html';
}

function mustChangePassword(auth = getAuth()) {
 return Boolean(auth?.user?.must_change_password);
}

function forcedPasswordDestination() {
 return 'profile.html?forcePasswordChange=1';
}
function getUserDisplay(user) {
 const fullName = user?.name?.trim() || 'User';
 const [firstName = 'User'] = fullName.split(/\s+/);
 const role = user?.role || requiredRole || 'driver';
 const roleLabel =
  role === 'admin' ? 'Administrator' : role === 'attendant' ? 'Attendant' : 'Driver';

 return {
  fullName,
  firstName,
  initial: firstName.charAt(0).toUpperCase() || 'U',
  roleLabel,
 };
}

function getShellContext(topbar) {
 const topbarLeft = topbar?.querySelector('.topbar-left');
 const topbarRight = topbar?.querySelector('.topbar-right');
 const branding = topbarLeft?.querySelector('.topbar-branding');
 const existingStatus = topbarRight?.querySelector('.topbar-pill-live')?.textContent?.trim();
 const existingPage = topbarRight?.querySelector('.topbar-crumb')?.textContent?.trim();

 return {
  kicker:
   document.body.dataset.shellKicker ||
   topbar?.dataset.shellKicker ||
   branding?.querySelector('.topbar-kicker')?.textContent?.trim() ||
   '',
  title:
   document.body.dataset.shellTitle ||
   topbar?.dataset.shellTitle ||
   branding?.querySelector('strong')?.textContent?.trim() ||
   '',
  status:
   document.body.dataset.shellStatus || topbar?.dataset.shellStatus || existingStatus || '',
  pageLabel:
   document.body.dataset.shellPageLabel || topbar?.dataset.shellPageLabel || existingPage || '',
 };
}

function createSidebarMetaItem(label, options = {}) {
 const item = document.createElement(options.clock ? 'time' : 'span');
 item.className = 'sidebar-meta-item';
 if (options.live) {
  item.classList.add('is-live');
 }
 if (options.clock) {
  item.setAttribute('data-admin-clock', 'true');
 }
 if (options.icon) {
  item.setAttribute('data-icon', options.icon);
 }
 item.textContent = label;
 return item;
}

function handleLogoutRedirect() {
 clearAuth();
 window.location.href = 'index.html';
}

function focusRequiredPasswordUpdate() {
 const passwordSection = document.getElementById('profilePasswordForm');
 const currentPasswordInput = document.getElementById('profileCurrentPassword');
 if (passwordSection) {
  passwordSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
 }
 if (currentPasswordInput) {
  setTimeout(() => currentPasswordInput.focus(), 120);
 }
 setMessage('profilePasswordMessage', 'Update your password first to unlock the dashboard.', true);
}

function buildTopbarProfileShell() {
 const auth = getAuth();
 const user = auth?.user;
 const passwordResetRequired = mustChangePassword(auth);
 const { fullName, firstName, initial, roleLabel } = getUserDisplay(user);
 const dashboardHref = passwordResetRequired ? '#profilePasswordForm' : roleHome(user?.role || requiredRole || 'driver');
 const dashboardTitle = passwordResetRequired ? 'Update password first' : 'Go to dashboard';
 const dashboardSubtitle = passwordResetRequired
  ? 'Finish the required password change before leaving this page'
  : 'Return to your dashboard';
 const shell = document.createElement('div');
 shell.className = 'topbar-profile-shell';
 shell.setAttribute('data-topbar-profile', 'true');

 shell.innerHTML = `
  <button type="button" class="topbar-profile-trigger" aria-haspopup="menu" aria-expanded="false" aria-label="${firstName} profile menu">
   <span class="topbar-profile-avatar" aria-hidden="true">${initial}</span>
   <span class="topbar-profile-copy">
    <strong class="topbar-profile-name">${firstName}</strong>
    <span class="topbar-profile-meta">${roleLabel}</span>
   </span>
   <span class="topbar-profile-caret" aria-hidden="true">&#9662;</span>
  </button>
  <div class="topbar-profile-menu" role="menu" aria-hidden="true">
   <div class="topbar-profile-menu-head">
    <span class="topbar-profile-menu-kicker">Signed in as</span>
    <strong>${fullName}</strong>
    <span>${roleLabel}</span>
   </div>
   <a class="topbar-profile-action" href="profile.html" role="menuitem">
    <span class="topbar-profile-action-icon" aria-hidden="true">
     <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21a8 8 0 0 0-16 0"></path><circle cx="12" cy="8" r="4"></circle></svg>
    </span>
    <span class="topbar-profile-action-copy"><strong>Open profile</strong><span>Update your details</span></span>
   </a>
   <a class="topbar-profile-action${passwordResetRequired ? ' is-locked' : ''}" href="${dashboardHref}" role="menuitem">
    <span class="topbar-profile-action-icon" aria-hidden="true">
     <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11.5 12 4l9 7.5"></path><path d="M5 10.5V20h14v-9.5"></path></svg>
    </span>
    <span class="topbar-profile-action-copy"><strong>${dashboardTitle}</strong><span>${dashboardSubtitle}</span></span>
   </a>
   <button class="topbar-profile-action is-logout" type="button" role="menuitem">
    <span class="topbar-profile-action-icon" aria-hidden="true">
     <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M10 17l5-5-5-5"></path><path d="M15 12H3"></path><path d="M13 3h8v18h-8"></path></svg>
    </span>
    <span class="topbar-profile-action-copy"><strong>Logout</strong><span>Sign out of your account</span></span>
   </button>
  </div>
 `;

 const trigger = shell.querySelector('.topbar-profile-trigger');
 const menu = shell.querySelector('.topbar-profile-menu');
 const logoutButton = shell.querySelector('.is-logout');
 const menuItems = [...shell.querySelectorAll('[role="menuitem"]')];

 const setMenuAccessibility = (isOpen) => {
  menu?.setAttribute('aria-hidden', isOpen ? 'false' : 'true');
  menuItems.forEach((item) => {
   item.tabIndex = isOpen ? 0 : -1;
  });
 };

 const closeMenu = () => {
  if (!menu || !trigger) return;
  shell.classList.remove('is-open');
  trigger.setAttribute('aria-expanded', 'false');
  setMenuAccessibility(false);
 };

 const openMenu = () => {
  if (!menu || !trigger) return;
  document.querySelectorAll('.topbar-profile-shell.is-open').forEach((node) => {
   if (node !== shell) {
    node.classList.remove('is-open');
    node.querySelector('.topbar-profile-trigger')?.setAttribute('aria-expanded', 'false');
    node.querySelector('.topbar-profile-menu')?.setAttribute('aria-hidden', 'true');
    node.querySelectorAll('[role="menuitem"]').forEach((item) => {
     item.tabIndex = -1;
    });
   }
  });
  shell.classList.add('is-open');
  trigger.setAttribute('aria-expanded', 'true');
  setMenuAccessibility(true);
 };

 setMenuAccessibility(false);

 trigger?.addEventListener('click', (event) => {
  event.preventDefault();
  event.stopPropagation();
  if (!shell.classList.contains('is-open')) {
   openMenu();
   return;
  }
  closeMenu();
 });

 shell.querySelectorAll('.topbar-profile-action[href]').forEach((link) => {
  link.addEventListener('click', (event) => {
   const href = link.getAttribute('href') || '';
   closeMenu();
   if (href === '#profilePasswordForm') {
    event.preventDefault();
    focusRequiredPasswordUpdate();
   }
  });
 });

 logoutButton?.addEventListener('click', async (event) => {
  event.preventDefault();
  try {
   await api('/api/auth/logout', { method: 'POST' });
  } catch (err) {
   // ignore logout errors
  }
  handleLogoutRedirect();
 });

 document.addEventListener('click', (event) => {
  if (!shell.contains(event.target)) {
   closeMenu();
  }
 });

 document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
   closeMenu();
  }
  if (event.key === 'ArrowDown' && document.activeElement === trigger) {
   event.preventDefault();
   openMenu();
   menuItems[0]?.focus();
  }
 });

 return shell;
}

function supportsTopbarNotices() {
 return Boolean(document.querySelector('.topbar')) && !['login', 'register', 'forgot-password', 'reset-password'].includes(page);
}

function getTopbarNoticeDefinition(type = 'info') {
 const definitions = {
  success: {
   label: 'Success',
   dismissLabel: 'Dismiss success notification',
   autoCloseMs: 5000,
   icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 4 4L19 6"></path></svg>',
  },
  error: {
   label: 'Error',
   dismissLabel: 'Dismiss error notification',
   autoCloseMs: 0,
   icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"></circle><path d="M12 8v5"></path><path d="M12 16h.01"></path></svg>',
  },
  warn: {
   label: 'Attention',
   dismissLabel: 'Dismiss warning notification',
   autoCloseMs: 0,
   icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 2 21h20L12 3Z"></path><path d="M12 9v4"></path><path d="M12 17h.01"></path></svg>',
  },
  info: {
   label: 'Update',
   dismissLabel: 'Dismiss notification',
   autoCloseMs: 7000,
   icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"></circle><path d="M12 11v5"></path><path d="M12 8h.01"></path></svg>',
  },
 };

 return definitions[type] || definitions.info;
}

function getTopbarToastDuration(type = 'info') {
 if (type === 'error' || type === 'warn') return 950;
 return 800;
}

function ensureTopbarToastRegion() {
 let region = document.querySelector('[data-topbar-toast-stack]');
 if (region) return region;

 region = document.createElement('div');
 region.className = 'topbar-toast-stack';
 region.setAttribute('data-topbar-toast-stack', 'true');
 document.body.appendChild(region);
 return region;
}

function renderTopbarToasts() {
 const region = ensureTopbarToastRegion();
 if (!region) return;

 if (!topbarToastState.items.length) {
  region.innerHTML = '';
  region.hidden = true;
  return;
 }

 region.hidden = false;
 region.innerHTML = topbarToastState.items
  .map((item, index) => {
   const definition = getTopbarNoticeDefinition(item.type);
   return (
    '<article class="topbar-toast is-' + item.type + '" style="--toast-index:' + index + '">' +
    '<span class="topbar-toast-icon" aria-hidden="true">' + definition.icon + '</span>' +
    '<div class="topbar-toast-copy">' +
    '<div class="topbar-toast-meta"><span class="topbar-toast-label">' + definition.label + '</span><span class="topbar-toast-category">' + escapeHtml(item.category || 'System') + '</span></div>' +
    '<strong>' + escapeHtml(item.message) + '</strong>' +
    '</div>' +
    '</article>'
   );
  })
  .join('');
}

function queueTopbarToastPreview(notice, onComplete) {
 const toast = {
  id: 'toast-' + (++topbarToastState.counter),
  type: notice.type,
  category: notice.category,
  message: notice.message,
 };

 topbarToastState.items = [toast, ...topbarToastState.items].slice(0, 3);
 renderTopbarToasts();

 const duration = getTopbarToastDuration(notice.type);
 const timer = setTimeout(() => {
  topbarToastState.items = topbarToastState.items.filter((item) => item.id !== toast.id);
  topbarToastState.timers.delete(toast.id);
  renderTopbarToasts();
  if (typeof onComplete === 'function') {
   onComplete();
  }
 }, duration);

 topbarToastState.timers.set(toast.id, timer);
}

function createTopbarNoticeRecord(message, options = {}) {
 return {
  id: options.id || 'local-' + (++topbarNoticeState.counter),
  message,
  type: options.type || 'info',
  category: options.category || 'System',
  persistent: Boolean(options.persistent),
  createdAt: options.createdAt || new Date().toISOString(),
  source: options.source || 'local',
 };
}

function getTopbarNoticeItems() {
 const items = [];
 if (topbarNoticeState.persistent?.message) {
  items.push(topbarNoticeState.persistent);
 }
 items.push(...topbarNoticeState.items);
 return items;
}

function clearTopbarNoticeTimer(id) {
 const timer = topbarNoticeState.timers.get(id);
 if (timer) {
  clearTimeout(timer);
  topbarNoticeState.timers.delete(id);
 }
}

function removeTopbarNotice(id) {
 if (id === 'persistent') {
  topbarNoticeState.persistent = null;
 } else {
  topbarNoticeState.items = topbarNoticeState.items.filter((item) => item.id !== id);
 }
 topbarNoticeState.unreadIds.delete(id);
 clearTopbarNoticeTimer(id);
 renderTopbarNotice();
}

function markTopbarNoticesRead(ids = []) {
 ids.forEach((id) => topbarNoticeState.unreadIds.delete(id));
 renderTopbarNotice();
}

function markVisibleTopbarNoticesRead() {
 markTopbarNoticesRead(getTopbarNoticeItems().map((item) => item.id));
}

function getUnreadTopbarCount() {
 return getTopbarNoticeItems().filter((item) => topbarNoticeState.unreadIds.has(item.id)).length;
}

function openTopbarNoticeMenu(shell) {
 if (!shell) return;
 closeTopbarNoticeMenus();
 shell.classList.add('is-open');
 shell.querySelector('.topbar-notice-trigger')?.setAttribute('aria-expanded', 'true');
 shell.querySelector('.topbar-notice-menu')?.setAttribute('aria-hidden', 'false');
 markVisibleTopbarNoticesRead();
}

function closeTopbarNoticeMenus() {
 document.querySelectorAll('.topbar-notice-shell.is-open').forEach((shell) => {
  shell.classList.remove('is-open');
  shell.querySelector('.topbar-notice-trigger')?.setAttribute('aria-expanded', 'false');
  shell.querySelector('.topbar-notice-menu')?.setAttribute('aria-hidden', 'true');
 });
}

function ensureTopbarNoticeRegion() {
 const topbarRight = document.querySelector('.topbar-right');
 if (!topbarRight) return null;

 let shell = topbarRight.querySelector('[data-topbar-notices]');
 if (shell) return shell;

 shell = document.createElement('div');
 shell.className = 'topbar-notice-shell';
 shell.setAttribute('data-topbar-notices', 'true');
 shell.innerHTML =
  '<button type="button" class="topbar-notice-trigger" aria-haspopup="dialog" aria-expanded="false" aria-label="Open notifications">' +
  '<span class="topbar-notice-trigger-icon" aria-hidden="true">' +
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M15 17h5l-1.4-1.4A2 2 0 0 1 18 14.17V11a6 6 0 1 0-12 0v3.17a2 2 0 0 1-.59 1.42L4 17h5"></path><path d="M10 20a2 2 0 0 0 4 0"></path></svg>' +
  '</span>' +
  '<span class="topbar-notice-badge" hidden>0</span>' +
  '</button>' +
  '<div class="topbar-notice-menu" role="dialog" aria-hidden="true" aria-label="Notifications">' +
  '<div class="topbar-notice-menu-head">' +
  '<div><span class="topbar-notice-menu-kicker">Inbox</span><strong>Notifications</strong></div>' +
  '<button type="button" class="topbar-notice-clear">Clear</button>' +
  '</div>' +
  '<div class="topbar-notice-list"></div>' +
  '</div>';

 const trigger = shell.querySelector('.topbar-notice-trigger');
 const menu = shell.querySelector('.topbar-notice-menu');
 const clearButton = shell.querySelector('.topbar-notice-clear');

 trigger?.addEventListener('click', (event) => {
  event.preventDefault();
  event.stopPropagation();
  const willOpen = !shell.classList.contains('is-open');
  if (willOpen) {
   openTopbarNoticeMenu(shell);
   return;
  }
  closeTopbarNoticeMenus();
 });

 clearButton?.addEventListener('click', (event) => {
  event.preventDefault();
  topbarNoticeState.items.forEach((item) => clearTopbarNoticeTimer(item.id));
  topbarNoticeState.items = [];
  topbarNoticeState.unreadIds.clear();
  renderTopbarNotice();
 });

 document.addEventListener('click', (event) => {
  if (!shell.contains(event.target)) {
   closeTopbarNoticeMenus();
  }
 });

 document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
   closeTopbarNoticeMenus();
  }
 });

 topbarRight.prepend(shell);
 if (menu) menu.scrollTop = 0;
 return shell;
}

function renderTopbarNotice() {
 const shell = ensureTopbarNoticeRegion();
 if (!shell) return;

 const badge = shell.querySelector('.topbar-notice-badge');
 const list = shell.querySelector('.topbar-notice-list');
 const clearButton = shell.querySelector('.topbar-notice-clear');
 const items = getTopbarNoticeItems();
 const unreadCount = getUnreadTopbarCount();

 shell.classList.toggle('has-unread', unreadCount > 0);

 if (badge) {
  badge.hidden = unreadCount === 0;
  badge.textContent = unreadCount > 9 ? '9+' : String(unreadCount);
 }

 if (!list) return;

 if (!items.length) {
  list.innerHTML = '<div class="topbar-notice-empty">No notifications yet.</div>';
  if (clearButton) clearButton.hidden = true;
  return;
 }

 if (clearButton) {
  clearButton.hidden = topbarNoticeState.items.length === 0;
 }

 list.innerHTML = items
  .map((item, index) => {
   const definition = getTopbarNoticeDefinition(item.type);
   const timestamp = item.createdAt ? formatNumericDateTime(item.createdAt) : 'Just now';
   const unreadClass = topbarNoticeState.unreadIds.has(item.id) ? ' is-unread' : '';
   const category = escapeHtml(item.category || 'System');
   const dismissControl = item.persistent
    ? ''
    : '<button type="button" class="topbar-notice-item-dismiss" data-notice-id="' + item.id + '" aria-label="' + definition.dismissLabel + '">&times;</button>';
   return (
    '<article class="topbar-notice-item is-' + item.type + (item.persistent ? ' is-persistent' : '') + unreadClass + '" style="--notice-index:' + index + '">' +
    '<span class="topbar-notice-item-icon" aria-hidden="true">' + definition.icon + '</span>' +
    '<div class="topbar-notice-item-copy">' +
    '<div class="topbar-notice-item-meta"><span class="topbar-notice-item-label">' + definition.label + '</span><span class="topbar-notice-item-category">' + category + '</span></div>' +
    '<strong>' + item.message + '</strong>' +
    '<span>' + timestamp + '</span>' +
    '</div>' +
    dismissControl +
    '</article>'
   );
  })
  .join('');

 list.querySelectorAll('.topbar-notice-item-dismiss').forEach((button) => {
  button.addEventListener('click', (event) => {
   event.preventDefault();
   removeTopbarNotice(Number(button.dataset.noticeId));
  });
 });
}

function scheduleTopbarNoticeRemoval(notice) {
 if (!notice || notice.persistent) return;
 const autoCloseMs = getTopbarNoticeDefinition(notice.type).autoCloseMs;
 if (!autoCloseMs) return;
 clearTopbarNoticeTimer(notice.id);
 const timer = setTimeout(() => {
  removeTopbarNotice(notice.id);
 }, autoCloseMs);
 topbarNoticeState.timers.set(notice.id, timer);
}

function commitTopbarNotice(notice, options = {}) {
 const nextItems = [notice, ...topbarNoticeState.items];
 const removedItems = nextItems.slice(8);
 removedItems.forEach((item) => {
  topbarNoticeState.unreadIds.delete(item.id);
  clearTopbarNoticeTimer(item.id);
 });

 topbarNoticeState.items = nextItems.slice(0, 8);
 if (options.markUnread !== false) {
  topbarNoticeState.unreadIds.add(notice.id);
 }
 renderTopbarNotice();
 scheduleTopbarNoticeRemoval(notice);

 const shouldOpen = options.open === true || notice.type === 'error' || notice.type === 'warn';
 if (shouldOpen) {
  const shell = ensureTopbarNoticeRegion();
  if (shell) {
   openTopbarNoticeMenu(shell);
  }
 }
}

function showTopbarNotice(message, options = {}) {
 if (!supportsTopbarNotices()) return false;
 const cleanMessage = sanitizeMessage(message);
 if (!cleanMessage) return true;

 const notice = createTopbarNoticeRecord(cleanMessage, {
  type: options.type,
  category: options.category,
  createdAt: options.createdAt,
  source: options.source || 'local',
 });

 const complete = () => commitTopbarNotice(notice, options);
 if (options.preview === false) {
  complete();
  return true;
 }

 queueTopbarToastPreview(notice, complete);
 return true;
}

function setPersistentTopbarNotice(message, options = {}) {
 if (!supportsTopbarNotices()) return;
 const cleanMessage = sanitizeMessage(message);
 if (!cleanMessage) {
  clearPersistentTopbarNotice();
  return;
 }

 const existing = topbarNoticeState.persistent;
 topbarNoticeState.persistent = {
  id: 'persistent',
  message: cleanMessage,
  type: options.type || 'warn',
  category: options.category || 'System',
  persistent: true,
  createdAt: existing?.createdAt || new Date().toISOString(),
 };

 if (existing?.message !== cleanMessage || existing?.type !== topbarNoticeState.persistent.type) {
  topbarNoticeState.unreadIds.add('persistent');
 }

 renderTopbarNotice();
 if (options.open) {
  const shell = ensureTopbarNoticeRegion();
  if (shell) {
   openTopbarNoticeMenu(shell);
  }
 }
}

function clearPersistentTopbarNotice() {
 topbarNoticeState.unreadIds.delete('persistent');
 topbarNoticeState.persistent = null;
 renderTopbarNotice();
}

function refreshTopbarProfile() {
 const topbarRight = document.querySelector('.topbar-right');
 if (!topbarRight) return;

 const profileShell = buildTopbarProfileShell();
 const currentProfile = topbarRight.querySelector('[data-topbar-profile]');
 if (currentProfile) {
  currentProfile.replaceWith(profileShell);
  return;
 }

 topbarRight.appendChild(profileShell);
}

function initAppChrome() {
 const topbar = document.querySelector('.topbar');
 const sidebar = document.querySelector('.sidebar');
 if (!topbar || !sidebar) return;

 const topbarLeft = topbar.querySelector('.topbar-left');
 const branding = topbarLeft?.querySelector('.topbar-branding');
 const topbarRight = topbar.querySelector('.topbar-right');
 const sidebarUtility = sidebar.querySelector('.sidebar-utility');

 sidebarUtility?.remove();
 branding?.remove();

 if (topbarRight) {
  topbarRight.innerHTML = '';
  topbarRight.appendChild(buildTopbarProfileShell());
 }

 ensureTopbarNoticeRegion();
 renderTopbarNotice();
}
function initVisibilityToggles() {
 document.querySelectorAll('.toggle-visibility').forEach((button) => {
  const targetId = button.getAttribute('data-target');
  if (!targetId) {
   button.remove();
   return;
  }
  const input = document.getElementById(targetId);
  if (!input || input.tagName !== 'INPUT' || input.type !== 'password') {
   button.remove();
   return;
  }

  const visibilityLabel = button.getAttribute('data-visibility-label') || 'password';

  const setState = (isVisible) => {
   button.classList.toggle('is-visible', isVisible);
   const label = `${isVisible ? 'Hide' : 'Show'} ${visibilityLabel}`;
   button.setAttribute('aria-label', label);
   button.setAttribute('title', label);
  };

  setState(false);

  button.addEventListener('click', () => {
   const isVisible = input.type !== 'password';
   input.type = isVisible ? 'password' : 'text';
   setState(!isVisible);
   input.focus();
  });
 });
}

function initSidebarToggle() {
 const toggles = document.querySelectorAll('[data-sidebar-toggle]');
 if (!toggles.length) return;

 const storedValue = localStorage.getItem(SIDEBAR_COLLAPSE_KEY);
 const stored =
  storedValue === null ? window.matchMedia('(max-width: 960px)').matches : storedValue === 'true';
 if (stored) {
  document.body.classList.add('sidebar-collapsed');
 }

 toggles.forEach((toggle) => {
  toggle.addEventListener('click', () => {
   document.body.classList.toggle('sidebar-collapsed');
   const collapsed = document.body.classList.contains('sidebar-collapsed');
   localStorage.setItem(SIDEBAR_COLLAPSE_KEY, collapsed ? 'true' : 'false');
  });
 });
}

function guardPage() {
 const auth = getAuth();
 if (requiredRole) {
  if (!auth?.token) {
   window.location.href = 'index.html';
   return;
  }
  if (auth.user?.role !== requiredRole) {
   window.location.href = roleHome(auth.user?.role || 'driver');
   return;
  }
  if (mustChangePassword(auth) && page !== 'profile') {
   window.location.href = forcedPasswordDestination();
   return;
  }
 } else if (requireAuthOnly) {
  if (!auth?.token) {
   window.location.href = 'index.html';
   return;
  }
  if (mustChangePassword(auth) && page !== 'profile') {
   window.location.href = forcedPasswordDestination();
   return;
  }
 } else if ((page === 'login' || page === 'register') && auth?.token) {
  window.location.href = mustChangePassword(auth)
   ? forcedPasswordDestination()
   : roleHome(auth.user?.role || 'driver');
 }
}

guardPage();
initVisibilityToggles();
initSidebarToggle();
initAppChrome();
initAdminTopbarClock();
refreshSummary = initSummaryPanel();
refreshSummary?.();

document.querySelectorAll('[data-logout="true"]').forEach((link) => {
 link.addEventListener('click', async (event) => {
  event.preventDefault();
  try {
   await api('/api/auth/logout', { method: 'POST' });
  } catch (err) {
   // ignore logout errors
  }
  clearAuth();
  window.location.href = 'index.html';
 });
});

async function api(path, options = {}) {
 const auth = getAuth();
 const headers = {
  'Content-Type': 'application/json',
  ...(options.headers || {}),
 };
 if (auth?.token) {
  headers.Authorization = `Bearer ${auth.token}`;
 }
 const config = {
  credentials: 'include',
  ...options,
 };
 config.headers = headers;
 let response;
 try {
  response = await fetch(`${API_BASE}${path}`, config);
 } catch (err) {
  throw new Error('Unable to reach the server. Check that the backend is running.');
 }

 let data = null;
 try {
  data = await response.json();
 } catch (err) {
  data = null;
 }

 if (!response.ok) {
  if (response.status === 401 || response.status === 403) {
   clearAuth();
   if (requiredRole) {
    window.location.href = 'index.html';
   }
  }
  const message = data?.message || 'Unable to complete request.';
  throw new Error(message);
 }
 return data;
}

function initSummaryPanel() {
 const summaryPanel = document.getElementById('summaryPanel');
 if (!summaryPanel) return null;

 const role = requiredRole || getAuth()?.user?.role || 'admin';
 const roleCards = {
  admin: [
   {
    key: 'total_slots',
    label: 'Total Parking Slots',
    description: 'Monitor the full slot inventory and operational status.',
    className: 'stat-blue',
    icon: '&#127359;',
    link: 'admin-slots.html',
   },
   {
    key: 'total_users',
    label: 'Total Users',
    description: 'Track drivers, attendants, and administrators with access.',
    className: 'stat-orange',
    icon: '&#128100;',
    link: 'admin-users.html',
   },
   {
    key: 'active_bookings',
    label: 'Total Parking',
    description: 'Follow the live booking volume moving through the system.',
    className: 'stat-green',
    icon: '&#128202;',
    link: 'admin-payments.html',
   },
  ],
  attendant: [
   {
    key: 'total_slots',
    label: 'Total Parking Slots',
    className: 'stat-blue',
    icon: '&#127359;',
    link: 'occupancy.html',
   },
   {
    key: 'occupied_slots',
    label: 'Occupied Slots',
    className: 'stat-orange',
    icon: '&#128663;',
    link: 'occupancy.html',
   },
   {
    key: 'pending_reservations',
    label: 'Pending Reservations',
    className: 'stat-green',
    icon: '&#128197;',
    link: 'reservations.html',
   },
  ],
  driver: [
   {
    key: 'available_slots',
    label: 'Available Slots',
    className: 'stat-blue',
    icon: '&#127359;',
    link: 'driver.html#driver-slot-catalog',
   },
   {
    key: 'my_active_bookings',
    label: 'My Active Bookings',
    className: 'stat-orange',
    icon: '&#128197;',
    link: 'driver.html#driver-active-booking-section',
   },
   {
    key: 'my_total_bookings',
    label: 'My Booking History',
    className: 'stat-green',
    icon: '&#128221;',
    link: 'driver.html#driver-history-section',
   },
  ],
 };

 const cards = roleCards[role] || roleCards.admin;

 const renderCards = (summary) => {
  summaryPanel.innerHTML = '';
  cards.forEach((card) => {
   const value = summary?.[card.key] ?? 0;
   const item = document.createElement('div');
   item.className = `stat-card ${card.className}${card.link ? ' is-clickable' : ''}`;

   const valueEl = document.createElement('div');
   valueEl.className = 'stat-value';
   valueEl.textContent = `${card.prefix || ''}${value}${card.suffix || ''}`;

   const labelEl = document.createElement('div');
   labelEl.className = 'stat-label';
   labelEl.textContent = card.label;

   const metaEl = document.createElement('div');
   metaEl.className = 'stat-meta';
   metaEl.textContent = card.description || '';

   const iconEl = document.createElement('div');
   iconEl.className = 'stat-icon';
   iconEl.innerHTML = card.icon;

   const footerEl = document.createElement('a');
   footerEl.className = 'stat-footer';
   footerEl.href = card.link;
   footerEl.textContent = 'More info';

   if (card.link) {
    item.tabIndex = 0;
    item.setAttribute('role', 'link');
    item.setAttribute('aria-label', `${card.label} - open workspace`);
    item.addEventListener('click', (event) => {
     if (event.target.closest('a')) return;
     window.location.href = card.link;
    });
    item.addEventListener('keydown', (event) => {
     if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      window.location.href = card.link;
     }
    });
   }

   item.appendChild(valueEl);
   item.appendChild(labelEl);
   if (card.description) {
    item.appendChild(metaEl);
   }
   item.appendChild(iconEl);
   item.appendChild(footerEl);
   summaryPanel.appendChild(item);
  });

  const occupancyEl = document.getElementById('metricOccupancy');
  const revenueEl = document.getElementById('metricRevenue');
  if (occupancyEl) {
   const rate = summary?.occupancy_rate ?? 0;
   occupancyEl.textContent = `${rate}%`;
  }
  if (revenueEl) {
   const total = summary?.total_revenue ?? 0;
   revenueEl.textContent = `KES ${total}`;
  }
 };

 const loadSummary = async () => {
  try {
   renderCards();
   const summary = await api('/api/users/summary');
   renderCards(summary);
  } catch (err) {
   const messageTarget =
    document.getElementById('summaryMessage') || document.getElementById('slotMessage');
   if (messageTarget) {
    setMessage(messageTarget.id, err.message, true);
   }
  }
 };

 refreshSummary?.();
 const intervalId = setInterval(loadSummary, 60000);
 window.addEventListener('beforeunload', () => clearInterval(intervalId));
 return loadSummary;
}

function initAdminTopbarClock() {
 const clockTargets = document.querySelectorAll('[data-admin-clock]');
 if (!clockTargets.length) return;

 const renderClock = () => {
  const value = formatNumericDateTime(new Date());
  clockTargets.forEach((target) => {
   target.textContent = value;
  });
 };

 renderClock();
 const intervalId = setInterval(renderClock, 60000);
 window.addEventListener('beforeunload', () => clearInterval(intervalId));
}

function classifyTopbarNoticeType(message, isError = false) {
 if (isError) return 'error';
 const lowered = String(message || '').toLowerCase();
 if (
  /success|successful|successfully|updated|created|recorded|processed|verified|initiated|cancelled|complete|completed|marked|saved|redirecting|reset/.test(
   lowered
  )
 ) {
  return 'success';
 }
 if (/seed credentials|password now before continuing|attention/.test(lowered)) {
  return 'warn';
 }
 return 'info';
}

function classifyTopbarNoticeCategory(elementId = '', message = '') {
 const key = String(elementId || '').toLowerCase();
 const lowered = String(message || '').toLowerCase();
 if (/payment/.test(key) || /payment|revenue|cash|mobile money|refund/.test(lowered)) {
  return 'Payments';
 }
 if (/slot/.test(key) || /slot|maintenance|occupied|available/.test(lowered)) {
  return 'Slots';
 }
 if (/booking|reservation|entry|exit|occupancy/.test(key) || /booking|reservation|entry|exit/.test(lowered)) {
  return 'Bookings';
 }
 if (/report|audit/.test(key)) {
  return 'Reports';
 }
 if (/profile|login|register|reset|forgot|password/.test(key) || /password|account|credential/.test(lowered)) {
  return 'System';
 }
 if (/user/.test(key)) {
  return 'Users';
 }
 return 'System';
}

function setMessage(elementId, message, isError = false) {
 const cleanMessage = sanitizeMessage(message);
 const el = document.getElementById(elementId);
 if (supportsTopbarNotices()) {
  if (el) {
   el.dataset.topbarRouted = 'true';
   el.hidden = true;
   el.textContent = '';
  }
  showTopbarNotice(cleanMessage, {
   type: classifyTopbarNoticeType(cleanMessage, isError),
   category: classifyTopbarNoticeCategory(elementId, cleanMessage),
  });
  return;
 }
 if (!el) return;
 delete el.dataset.topbarRouted;
 el.hidden = false;
 el.className = isError ? 'notice' : 'success';
 el.textContent = cleanMessage;
}

function fetchNotificationFeedSnapshot() {
 const auth = getAuth();
 if (!auth?.token || !supportsTopbarNotices()) {
  return Promise.resolve(null);
 }

 const role = auth.user?.role || requiredRole || 'driver';
 if (role === 'admin') {
  return Promise.all([
   api('/api/users/summary'),
   api('/api/admin/reports/schedule'),
   api('/api/admin/audit-logs?limit=1'),
  ]).then(([summary, schedule, audits]) => ({
   role,
   activeBookings: Number(summary?.active_bookings || 0),
   totalRevenue: Number(summary?.total_revenue || 0),
   reportLastRun: schedule?.last_run_at || '',
   reportNextRun: schedule?.next_run_at || '',
   latestAuditId: audits?.[0]?.audit_id || null,
   latestAuditEntity: audits?.[0]?.entity_type || '',
  }));
 }

 if (role === 'attendant') {
  return Promise.all([
   api('/api/users/summary'),
   api('/api/attendant/slots'),
  ]).then(([summary, slots]) => ({
   role,
   pendingReservations: Number(summary?.pending_reservations || 0),
   occupiedSlots: Number(summary?.occupied_slots || 0),
   maintenanceSlots: Array.isArray(slots)
    ? slots.filter((slot) => normalizeStatus(slot.status) === 'maintenance').length
    : 0,
  }));
 }

 return Promise.all([
  api('/api/users/summary'),
  api('/api/driver/bookings'),
 ]).then(([summary, bookings]) => {
  const list = Array.isArray(bookings) ? bookings : [];
  const latestPending = list.find((booking) => String(booking.booking_status || '').toLowerCase() === 'pending');
  const latestConfirmed = list.find((booking) => String(booking.booking_status || '').toLowerCase() === 'confirmed');
  return {
   role,
   availableSlots: Number(summary?.available_slots || 0),
   activeBookings: Number(summary?.my_active_bookings || 0),
   latestPendingId: latestPending?.booking_id || null,
   latestPendingSlot: latestPending?.slot_number || '',
   latestConfirmedId: latestConfirmed?.booking_id || null,
   latestConfirmedSlot: latestConfirmed?.slot_number || '',
  };
 });
}

function emitNotificationFeedChanges(current, previous) {
 if (!current || !previous || current.role !== previous.role) return;

 if (current.role === 'admin') {
  if (current.activeBookings !== previous.activeBookings) {
   showTopbarNotice('Active bookings now stand at ' + current.activeBookings + '.', {
    type: 'info',
    category: 'Bookings',
    source: 'feed',
   });
  }
  if (current.totalRevenue > previous.totalRevenue) {
   showTopbarNotice('Revenue moved to ' + formatCurrency(current.totalRevenue) + '.', {
    type: 'success',
    category: 'Payments',
    source: 'feed',
   });
  }
  if (current.reportLastRun && current.reportLastRun !== previous.reportLastRun) {
   showTopbarNotice('Scheduled reports completed another export run.', {
    type: 'success',
    category: 'Reports',
    source: 'feed',
   });
  }
  if (current.latestAuditId && current.latestAuditId !== previous.latestAuditId) {
   showTopbarNotice('New ' + formatLabel(current.latestAuditEntity || 'system') + ' audit activity was recorded.', {
    type: 'info',
    category: 'System',
    source: 'feed',
   });
  }
  return;
 }

 if (current.role === 'attendant') {
  if (current.pendingReservations !== previous.pendingReservations) {
   showTopbarNotice(
    current.pendingReservations + ' reservation' + (current.pendingReservations === 1 ? '' : 's') + ' are waiting for gate action.',
    { type: 'info', category: 'Bookings', source: 'feed' }
   );
  }
  if (current.occupiedSlots !== previous.occupiedSlots) {
   showTopbarNotice(
    current.occupiedSlots + ' slot' + (current.occupiedSlots === 1 ? '' : 's') + ' are currently occupied.',
    { type: 'info', category: 'Slots', source: 'feed' }
   );
  }
  if (current.maintenanceSlots !== previous.maintenanceSlots) {
   showTopbarNotice(
    current.maintenanceSlots + ' slot' + (current.maintenanceSlots === 1 ? '' : 's') + ' are marked for maintenance.',
    { type: current.maintenanceSlots ? 'warn' : 'success', category: 'Slots', source: 'feed' }
   );
  }
  return;
 }

 if (current.activeBookings !== previous.activeBookings) {
  showTopbarNotice(
   'You now have ' + current.activeBookings + ' active booking' + (current.activeBookings === 1 ? '' : 's') + '.',
   { type: 'info', category: 'Bookings', source: 'feed' }
  );
 }
 if (current.availableSlots !== previous.availableSlots) {
  showTopbarNotice(
   current.availableSlots + ' slot' + (current.availableSlots === 1 ? '' : 's') + ' are currently available to book.',
   { type: 'info', category: 'Slots', source: 'feed' }
  );
 }
 if (current.latestPendingId && current.latestPendingId !== previous.latestPendingId) {
  showTopbarNotice('Complete payment for slot ' + (current.latestPendingSlot || '-') + ' before the hold expires.', {
   type: 'warn',
   category: 'Payments',
   source: 'feed',
  });
 }
 if (current.latestConfirmedId && current.latestConfirmedId !== previous.latestConfirmedId) {
  showTopbarNotice('Booking for slot ' + (current.latestConfirmedSlot || '-') + ' is confirmed.', {
   type: 'success',
   category: 'Bookings',
   source: 'feed',
  });
 }
}

function startNotificationFeedSync() {
 if (!supportsTopbarNotices() || notificationFeedState.intervalId) return;

 const sync = async () => {
  try {
   const snapshot = await fetchNotificationFeedSnapshot();
   if (!snapshot) return;
   if (notificationFeedState.initialized) {
    emitNotificationFeedChanges(snapshot, notificationFeedState.snapshot);
   }
   notificationFeedState.snapshot = snapshot;
   notificationFeedState.initialized = true;
  } catch (err) {
   // Keep the bell resilient even if the backend feed temporarily fails.
  }
 };

 sync();
 notificationFeedState.intervalId = setInterval(sync, 60000);
 window.addEventListener('beforeunload', () => {
  if (notificationFeedState.intervalId) {
   clearInterval(notificationFeedState.intervalId);
   notificationFeedState.intervalId = null;
  }
  topbarToastState.timers.forEach((timer) => clearTimeout(timer));
  topbarToastState.timers.clear();
 });
}

function saveUiFlash(key, payload) {
 if (!key || !payload) return;
 try {
  localStorage.setItem(`park_ui_flash_${key}`, JSON.stringify(payload));
 } catch (err) {
  // ignore storage failures for non-critical UI state
 }
}

function consumeUiFlash(key) {
 if (!key) return null;
 const storageKey = `park_ui_flash_${key}`;
 const raw = localStorage.getItem(storageKey);
 if (!raw) return null;
 localStorage.removeItem(storageKey);
 try {
  return JSON.parse(raw);
 } catch (err) {
  return null;
 }
}

function setSummaryCardCopy(target, title, subtitle) {
 if (!target) return;
 const titleEl = target.querySelector('.title');
 const subtitleEl = target.querySelector('.subtitle');
 if (titleEl) titleEl.textContent = title;
 if (subtitleEl) subtitleEl.textContent = subtitle;
}

function toggleHidden(target, hidden = true) {
 if (!target) return;
 target.hidden = hidden;
 target.setAttribute('aria-hidden', hidden ? 'true' : 'false');
}

function validatePasswordStrength(password) {
 const issues = [];
 if (!password || password.length < 8) {
  issues.push('at least 8 characters');
 }
 if (!/[A-Z]/.test(password)) {
  issues.push('one uppercase letter');
 }
 if (!/[a-z]/.test(password)) {
  issues.push('one lowercase letter');
 }
 if (!/[0-9]/.test(password)) {
  issues.push('one number');
 }
 if (!/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?`~]/.test(password)) {
  issues.push('one special character');
 }

 if (issues.length) {
  return `Password must contain ${issues.join(', ')}.`;
 }
 return '';
}

function getUserCode(record) {
 return record?.user_code || record?.public_user_id || (record?.user_id ? `#${record.user_id}` : '-');
}

function getSlotCode(record) {
 return record?.slot_code || record?.public_slot_id || (record?.slot_id ? `#${record.slot_id}` : '-');
}

function clearList(elementId) {
 const el = document.getElementById(elementId);
 if (el) el.innerHTML = '';
 return el;
}

function addListItem(container, content) {
 const item = document.createElement('div');
 item.className = 'list-item';
 item.appendChild(content);
 container.appendChild(item);
}

function downloadCsv(filename, headers, rows) {
 const escapeValue = (value) => {
  const stringValue = value === null || value === undefined ? '' : String(value);
  if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
   return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
 };
 const csvLines = [];
 csvLines.push(headers.map(escapeValue).join(','));
 rows.forEach((row) => {
  csvLines.push(row.map(escapeValue).join(','));
 });
 const blob = new Blob([csvLines.join('\n')], { type: 'text/csv;charset=utf-8;' });
 const link = document.createElement('a');
 link.href = URL.createObjectURL(blob);
 link.download = filename;
 document.body.appendChild(link);
 link.click();
 document.body.removeChild(link);
}

function exportPdf(title, headers, rows) {
 const win = window.open('', '_blank');
 if (!win) return;
 const tableRows = rows
  .map(
   (row) =>
    `<tr>${row.map((cell) => `<td>${cell ?? ''}</td>`).join('')}</tr>`
  )
  .join('');
 const html = `
  <html>
   <head>
    <title>${title}</title>
    <style>
     body { font-family: Arial, sans-serif; padding: 24px; color: #111; }
     h1 { font-size: 20px; margin-bottom: 12px; }
     table { width: 100%; border-collapse: collapse; }
     th, td { border: 1px solid #ccc; padding: 8px; font-size: 12px; text-align: left; }
     th { background: #f3f3f3; }
    </style>
   </head>
   <body>
    <h1>${title}</h1>
    <table>
     <thead>
      <tr>${headers.map((h) => `<th>${h}</th>`).join('')}</tr>
     </thead>
     <tbody>
      ${tableRows}
     </tbody>
    </table>
   </body>
  </html>
 `;
 win.document.write(html);
 win.document.close();
 win.focus();
 setTimeout(() => win.print(), 500);
}

function formatCurrency(value) {
 const number = Number(value || 0);
 return `KES ${number.toLocaleString()}`;
}

function formatDateTime(value) {
 if (!value) return 'N/A';
 const date = new Date(value);
 if (Number.isNaN(date.getTime())) return String(value);
 return formatNumericDateTime(date);
}

function formatDateOnly(value) {
 if (!value) return 'N/A';
 const date = new Date(value);
 if (Number.isNaN(date.getTime())) return String(value);
 return formatNumericDate(date);
}

function formatShortDate(value) {
 if (!value) return 'N/A';
 const date = new Date(value);
 if (Number.isNaN(date.getTime())) return String(value);
 return formatNumericShortDate(date);
}

function formatTimeOnly(value) {
 if (!value) return 'N/A';
 const date = new Date(value);
 if (Number.isNaN(date.getTime())) return String(value);
 return formatNumericTime(date);
}

function getPaymentHoldSeconds() {
 const seconds = Number(window.APP_CONFIG?.PAYMENT_HOLD_SECONDS || 120);
 if (!Number.isFinite(seconds) || seconds < 1) {
  return 120;
 }
 return Math.floor(seconds);
}

function getPendingPaymentDeadline(booking) {
 if (booking?.payment_expires_at) {
  const explicitDeadline = new Date(booking.payment_expires_at);
  if (!Number.isNaN(explicitDeadline.getTime())) {
   return explicitDeadline;
  }
 }
 if (!booking?.created_at) return null;
 const created = new Date(booking.created_at);
 if (Number.isNaN(created.getTime())) return null;
 return new Date(created.getTime() + getPaymentHoldSeconds() * 1000);
}

function getRemainingSeconds(deadline) {
 if (!deadline) return null;
 return Math.max(0, Math.floor((deadline.getTime() - Date.now()) / 1000));
}

function formatCountdown(totalSeconds) {
 if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return '00:00';
 const hours = Math.floor(totalSeconds / 3600);
 const minutes = Math.floor((totalSeconds % 3600) / 60);
 const seconds = totalSeconds % 60;
 if (hours > 0) {
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
 }
 return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}
function normalizeStatus(status) {
 const value = (status || 'available').toLowerCase();
 if (value === 'reserved') return 'booked';
 return value;
}

function escapeHtml(value) {
 return String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/\"/g, '&quot;')
  .replace(/'/g, '&#39;');
}

function formatLabel(value) {
 if (!value) return '-';
 return String(value)
  .replace(/_/g, ' ')
  .replace(/\b\w/g, (char) => char.toUpperCase());
}

function getBadgeTone(value, kind = 'status') {
 const normalized = normalizeStatus(String(value || '').toLowerCase());
 if (kind === 'role') {
  if (normalized === 'admin') return 'accent';
  if (normalized === 'attendant') return 'warning';
  return 'info';
 }
 if (kind === 'method') {
  if (normalized === 'mobile money' || normalized === 'mobile_money') return 'info';
  if (normalized === 'cash') return 'neutral';
  return 'neutral';
 }
 if (['active', 'available', 'confirmed', 'completed', 'paid', 'occupied'].includes(normalized)) {
  return 'success';
 }
 if (['pending', 'booked', 'maintenance'].includes(normalized)) {
  return 'warning';
 }
 if (['refunded'].includes(normalized)) {
  return 'accent';
 }
 if (['cancelled', 'inactive', 'failed'].includes(normalized)) {
  return 'danger';
 }
 return 'neutral';
}

function renderBadge(value, kind = 'status', label) {
 const display = label || formatLabel(value);
 const tone = getBadgeTone(value, kind);
 return '<span class="table-badge tone-' + tone + '">' + escapeHtml(display) + '</span>';
}

function renderTableStack(primary, secondary = '', tertiary = '') {
 const secondaryLine = secondary ? '<span class="table-cell-meta">' + escapeHtml(secondary) + '</span>' : '';
 const tertiaryLine = tertiary ? '<span class="table-cell-meta subtle">' + escapeHtml(tertiary) + '</span>' : '';
 return '<div class="table-cell-stack"><strong>' + escapeHtml(primary) + '</strong>' + secondaryLine + tertiaryLine + '</div>';
}

function renderActionButton(label, tone = 'neutral', action = '', title = '', disabled = false) {
 const titleAttr = title ? ' title="' + escapeHtml(title) + '"' : '';
 const disabledAttr = disabled ? ' disabled' : '';
 return '<button class="table-action-btn is-' + tone + '" type="button" data-action="' + escapeHtml(action) + '"' + titleAttr + disabledAttr + '>' + escapeHtml(label) + '</button>';
}

function setSelectedTableRow(container, row) {
 if (!container) return;
 [...container.querySelectorAll('tr')].forEach((item) => {
  item.classList.toggle('is-selected', item === row);
 });
}

function renderInsightMetrics(container, items) {
 if (!container) return;
 container.innerHTML = '';
 items.forEach((item) => {
  const card = document.createElement('div');
  card.className = 'chart-mini-metric';

  const label = document.createElement('span');
  label.className = 'chart-mini-label';
  label.textContent = item.label;

  const value = document.createElement('strong');
  value.className = 'chart-mini-value';
  value.textContent = item.value;

  card.appendChild(label);
  card.appendChild(value);
  container.appendChild(card);
 });
}

function renderSlotGrid(container, slots, options = {}) {
 if (!container) return;
 const { onSelect, selectedId } = options;
 container.innerHTML = "";

 if (!Array.isArray(slots) || !slots.length) {
  container.innerHTML = "<div class=\"slot-grid-empty\">No slots available in this view right now.</div>";
  return;
 }

 const orderedSlots = sortSlotsForDisplay(slots);
 const statusLabels = {
  available: "Available",
  booked: "Booked",
  occupied: "Occupied",
  maintenance: "Maintenance",
 };
 const statusMessages = {
  available: page === 'attendant' ? 'Ready to assign' : page === 'admin-slots' ? 'Ready to manage' : 'Ready to view',
  booked: "Reserved for another driver",
  occupied: "Currently occupied",
  maintenance: "Unavailable for service",
 };

 orderedSlots.forEach((slot) => {
  const status = normalizeStatus(slot.status);
  const isSelected = selectedId && Number(slot.slot_id) === Number(selectedId);
  const interactive = typeof onSelect === "function";
  const actionText = interactive ? (status === "available" ? "Click to load" : "Click to inspect") : (status === "available" ? "Available" : "Unavailable");
  const tile = document.createElement(interactive ? "button" : "div");
  const slotLabel = slot.slot_number || slot.slot_id || "-";
  tile.className = `slot-tile status-${status}`;
  if (interactive) {
   tile.type = "button";
  }
  if (isSelected) {
   tile.classList.add("selected");
  }
  tile.title = `${slotLabel} | ${formatLabel(status)}`;
  tile.setAttribute("aria-label", `${slotLabel} | ${formatLabel(status)}`);

  const top = document.createElement("div");
  top.className = "driver-slot-card-top";

  const badge = document.createElement("span");
  badge.className = `driver-slot-status status-${status}`;
  badge.textContent = statusLabels[status] || "Available";

  const action = document.createElement("span");
  action.className = "driver-slot-action";
  action.textContent = actionText;

  top.appendChild(badge);
  top.appendChild(action);

  const number = document.createElement("div");
  number.className = "driver-slot-number";
  number.textContent = slotLabel;

  const location = document.createElement("div");
  location.className = "driver-slot-location";
  location.textContent = slot.location || "General";

  const bottom = document.createElement("div");
  bottom.className = "driver-slot-card-bottom";

  const rate = document.createElement("div");
  rate.className = "driver-slot-rate";
  rate.innerHTML = `${formatCurrency(slot.hourly_rate || 0)}<small>/hr</small>`;

  const caption = document.createElement("div");
  caption.className = "driver-slot-caption";
  caption.textContent = statusMessages[status] || "Check availability";

  bottom.appendChild(rate);
  bottom.appendChild(caption);

  tile.appendChild(top);
  tile.appendChild(number);
  tile.appendChild(location);
  tile.appendChild(bottom);

  if (interactive) {
   const handleSelect = () => onSelect(slot, tile);
   tile.addEventListener("click", handleSelect);
   tile.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
     event.preventDefault();
     handleSelect();
    }
   });
  }

  container.appendChild(tile);
 });
}
function renderBarChart(container, items, options = {}) {
 if (!container) return;
 container.innerHTML = '';
 if (!items || !items.length) {
  container.innerHTML = '<div class="chart-empty">No data available.</div>';
  return;
 }
 const values = items.map((item) => Number(item.value || 0));
 const max = Math.max(...values, 1);
 const bars = document.createElement('div');
 bars.className = 'chart-bars';

 items.forEach((item) => {
  const value = Number(item.value || 0);
  const bar = document.createElement('div');
  bar.className = 'chart-bar';

  const valueEl = document.createElement('div');
  valueEl.className = 'chart-bar-value';
  valueEl.textContent = options.valueFormatter ? options.valueFormatter(value) : String(value);

  const track = document.createElement('div');
  track.className = 'chart-bar-track';

  const fill = document.createElement('div');
  fill.className = 'chart-bar-fill';
  if (item.color) {
   fill.style.background = item.color;
  }
  const percent = Math.round((value / max) * 100);
  fill.style.height = value > 0 ? `${percent}%` : '0%';
  track.appendChild(fill);

  const labelEl = document.createElement('div');
  labelEl.className = 'chart-bar-label';
  labelEl.textContent = item.label;

  bar.appendChild(valueEl);
  bar.appendChild(track);
  bar.appendChild(labelEl);
  bars.appendChild(bar);
 });

 container.appendChild(bars);
}

if (page === 'admin') {
 const occupancyChart = document.getElementById('occupancyChart');
 const revenueChart = document.getElementById('revenueChart');
 const occupancyInsights = document.getElementById('occupancyInsights');
 const revenueInsights = document.getElementById('revenueInsights');
 const occupancyChip = document.getElementById('occupancyChartChip');
 const revenueChip = document.getElementById('revenueChartChip');
 const occupancyCaption = document.getElementById('occupancyChartCaption');
 const revenueCaption = document.getElementById('revenueChartCaption');
 const metricOccupancy = document.getElementById('metricOccupancy');
 const metricOccupancyNote = document.getElementById('metricOccupancyNote');
 const metricRevenueNote = document.getElementById('metricRevenueNote');
 const metricReservedCount = document.getElementById('metricReservedCount');
 const metricReservedNote = document.getElementById('metricReservedNote');
 const metricAttentionCount = document.getElementById('metricAttentionCount');
 const metricAttentionNote = document.getElementById('metricAttentionNote');
 const scheduleInfo = document.getElementById('reportScheduleInfo');
 const scheduleMessage = document.getElementById('reportScheduleMessage');
 const runExportBtn = document.getElementById('runReportExportBtn');
 const bookingAuditList = document.getElementById('bookingAuditList');

 const setText = (element, value) => {
  if (element) element.textContent = value;
 };

 const showChartMessage = (target, message) => {
  if (!target) return;
  target.innerHTML = '<div class="chart-empty">' + sanitizeMessage(message) + '</div>';
 };

 const loadCharts = async () => {
  try {
   const [occupancy, revenue] = await Promise.all([
    api('/api/admin/reports/occupancy'),
    api('/api/admin/reports/revenue'),
   ]);

   const statusOrder = ['available', 'booked', 'occupied', 'maintenance'];
   const statusLabels = {
    available: 'Available',
    booked: 'Booked',
    occupied: 'Occupied',
    maintenance: 'Maintenance',
   };
   const statusColors = {
    available: 'linear-gradient(180deg, #43d58d 0%, #1ebf63 100%)',
    booked: 'linear-gradient(180deg, #f9c74f 0%, #f0b429 100%)',
    occupied: 'linear-gradient(180deg, #f27f72 0%, #e74c3c 100%)',
    maintenance: 'linear-gradient(180deg, #98a5b2 0%, #74808c 100%)',
   };
   const occupancyCounts = {};
   occupancy.forEach((row) => {
    occupancyCounts[row.status] = Number(row.total || 0);
   });
   const occupancyItems = statusOrder.map((status) => ({
    label: statusLabels[status],
    value: occupancyCounts[status] || 0,
    color: statusColors[status],
   }));
   renderBarChart(occupancyChart, occupancyItems, {
    valueFormatter: (value) => String(value),
   });

   const totalSlots = statusOrder.reduce((sum, status) => sum + (occupancyCounts[status] || 0), 0);
   const reservedSlots = occupancyCounts.booked || 0;
   const occupiedSlots = occupancyCounts.occupied || 0;
   const maintenanceSlots = occupancyCounts.maintenance || 0;
   const liveActive = reservedSlots + occupiedSlots;
   const occupancyRate = totalSlots ? Math.round((liveActive / totalSlots) * 100) : 0;

   if (occupancyChip) {
    occupancyChip.textContent = totalSlots ? liveActive + '/' + totalSlots + ' active' : 'Live lot mix';
   }
   setText(metricOccupancy, `${occupancyRate}%`);
   setText(
    metricOccupancyNote,
    totalSlots
     ? `${liveActive} active out of ${totalSlots} total slots right now.`
     : 'Add parking inventory to start measuring live occupancy.'
   );
   setText(metricReservedCount, String(reservedSlots));
   setText(
    metricReservedNote,
    reservedSlots
     ? `${reservedSlots} reservation${reservedSlots === 1 ? '' : 's'} waiting for arrival.`
     : 'No reserved slots are waiting right now.'
   );
   setText(metricAttentionCount, String(maintenanceSlots));
   setText(
    metricAttentionNote,
    maintenanceSlots
     ? `${maintenanceSlots} slot${maintenanceSlots === 1 ? '' : 's'} currently marked for maintenance.`
     : 'All operational slots are available for assignment or use.'
   );
   setText(
    occupancyCaption,
    totalSlots
     ? `${occupancyRate}% of the lot is currently active, with ${totalSlots - liveActive} slot${
       totalSlots - liveActive === 1 ? '' : 's'
      } still open.`
     : 'No occupancy data yet.'
   );
   renderInsightMetrics(occupancyInsights, [
    { label: 'Available', value: String(occupancyCounts.available || 0) },
    { label: 'Reserved', value: String(reservedSlots) },
    { label: 'Occupied', value: String(occupiedSlots) },
   ]);

   const revenueSorted = revenue
    .map((row) => ({ day: row.day, total: Number(row.total || 0) }))
    .sort((a, b) => new Date(a.day) - new Date(b.day));
   const recent = revenueSorted.slice(-7);
   const revenueItems = recent.map((row) => {
    const date = new Date(row.day);
    const label = Number.isNaN(date.getTime())
     ? String(row.day)
     : formatShortDate(date);
    return {
     label,
     value: row.total,
     color: 'linear-gradient(180deg, #67b8df 0%, #3a86b3 100%)',
    };
   });
   renderBarChart(revenueChart, revenueItems, {
    valueFormatter: (value) => formatCurrency(value),
   });

   const totalRevenue = recent.reduce((sum, row) => sum + row.total, 0);
   const averageRevenue = recent.length ? totalRevenue / recent.length : 0;
   const peakDay = recent.reduce((best, row) => {
    if (!best || row.total > best.total) return row;
    return best;
   }, null);
   if (revenueChip) {
    revenueChip.textContent = recent.length ? formatCurrency(totalRevenue) + ' in 7 days' : '7-day outlook';
   }
   setText(
    metricRevenueNote,
    recent.length
     ? `Average ${formatCurrency(Math.round(averageRevenue))} per day over the latest ${recent.length} revenue day${recent.length === 1 ? '' : 's'}.`
     : 'Revenue insights will appear after payments are recorded.'
   );
   setText(
    revenueCaption,
    peakDay
     ? `${formatShortDate(peakDay.day)} is the strongest recent day at ${formatCurrency(peakDay.total)}.`
     : 'No recent revenue days to compare yet.'
   );
   renderInsightMetrics(revenueInsights, [
    { label: 'Collected', value: formatCurrency(totalRevenue) },
    { label: 'Average / Day', value: formatCurrency(Math.round(averageRevenue)) },
    {
     label: 'Peak Day',
     value: peakDay
      ? formatShortDate(peakDay.day)
      : 'N/A',
    },
   ]);
  } catch (err) {
   showChartMessage(occupancyChart, err.message);
   showChartMessage(revenueChart, err.message);
   renderInsightMetrics(occupancyInsights, []);
   renderInsightMetrics(revenueInsights, []);
   setText(metricOccupancyNote, sanitizeMessage(err.message));
   setText(metricRevenueNote, sanitizeMessage(err.message));
   setText(occupancyCaption, 'Unable to load occupancy insight.');
   setText(revenueCaption, 'Unable to load revenue insight.');
  }
 };

 const renderScheduleInfo = (data) => {
  if (!scheduleInfo) return;
  const enabledText = data?.enabled ? 'Enabled' : 'Disabled';
  const nextRun = data?.next_run_at ? formatDateTime(data.next_run_at) : 'Not scheduled';
  const lastRun = data?.last_run_at ? formatDateTime(data.last_run_at) : 'Not yet run';
  const types = (data?.types || []).join(', ') || 'N/A';
  const exportDir = data?.export_dir || 'exports';
  scheduleInfo.innerHTML = `
   <div><strong>Status:</strong> ${enabledText}</div>
   <div><strong>Next export:</strong> ${nextRun}</div>
   <div><strong>Last export:</strong> ${lastRun}</div>
   <div><strong>Types:</strong> ${types}</div>
   <div><strong>Folder:</strong> ${exportDir}</div>
  `;
 };

 const loadSchedule = async () => {
  if (!scheduleInfo) return;
  try {
   const data = await api('/api/admin/reports/schedule');
   renderScheduleInfo(data);
  } catch (err) {
   if (scheduleMessage) {
    setMessage('reportScheduleMessage', err.message, true);
   }
  }
 };

 const loadBookingAudit = async () => {
  if (!bookingAuditList) return;
  try {
   const logs = await api('/api/admin/audit-logs?entity_type=booking&limit=6');
   bookingAuditList.innerHTML = '';
   if (!logs.length) {
    bookingAuditList.innerHTML = '<div class="helper">No booking updates yet.</div>';
    return;
   }
   logs.slice(0, 6).forEach((log) => {
    const content = document.createElement('div');
    content.className = 'admin-audit-snippet';
    const title = document.createElement('strong');
    title.textContent = `${formatLabel(log.action || 'updated')} - booking #${log.entity_id || '-'}`;
    const details = document.createElement('span');
    details.className = 'table-cell-meta';
    details.textContent = `Admin ${log.admin_id || '-'} | ${formatDateTime(log.created_at)}`;
    content.appendChild(title);
    content.appendChild(details);
    addListItem(bookingAuditList, content);
   });
  } catch (err) {
   setMessage('bookingAuditMessage', err.message, true);
  }
 };

 runExportBtn?.addEventListener('click', async () => {
  try {
   const result = await api('/api/admin/reports/export', { method: 'POST' });
   const count = result?.files?.length || 0;
   setMessage('reportScheduleMessage', `Export complete. ${count} file(s) saved.`);
   loadSchedule();
  } catch (err) {
   setMessage('reportScheduleMessage', err.message, true);
  }
 });

 const refreshDashboard = () => {
  loadCharts();
  loadSchedule();
  loadBookingAudit();
 };

 refreshDashboard();
 setInterval(refreshDashboard, 60000);
}
if (page === 'login') {
 const form = document.getElementById('loginForm');
 form?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const payload = {
   email: form.email.value.trim(),
   password: form.password.value.trim(),
  };
  try {
   const data = await api('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify(payload),
   });
   if (data?.token && data?.user) {
    saveAuth(data.token, data.user);
   }
   const role = data.user?.role;
   const destination = data.user?.must_change_password
    ? forcedPasswordDestination()
    : role === 'admin'
    ? 'admin.html'
    : role === 'attendant'
    ? 'attendant.html'
    : 'driver.html';
   setMessage(
    'loginMessage',
    data.user?.must_change_password
     ? 'Login successful. Update your seeded password to continue.'
     : 'Login successful. Redirecting...'
   );
   setTimeout(() => {
    window.location.href = destination;
   }, 600);
  } catch (err) {
   setMessage('loginMessage', err.message, true);
  }
 });
}

if (page === 'register') {
 const form = document.getElementById('registerForm');
 form?.addEventListener('submit', async (event) => {
  event.preventDefault();

  const password = form.password.value.trim();
  const confirmPassword = form.confirm_password.value.trim();
  const passwordError = validatePasswordStrength(password);

  if (passwordError) {
   setMessage('registerMessage', passwordError, true);
   return;
  }

  if (password !== confirmPassword) {
   setMessage('registerMessage', 'Passwords do not match.', true);
   return;
  }

  const payload = {
   name: form.name.value.trim(),
   email: form.email.value.trim(),
   phone: form.phone.value.trim(),
   vehicle_number: form.vehicle_number.value.trim(),
   password,
  };
  try {
   await api('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify(payload),
   });
   setMessage('registerMessage', 'Account created. Redirecting to login...');
   setTimeout(() => {
    window.location.href = 'index.html';
   }, 800);
  } catch (err) {
   setMessage('registerMessage', err.message, true);
  }
 });
}

if (page === 'forgot-password') {
 const form = document.getElementById('forgotPasswordForm');
 const tokenHint = document.getElementById('resetTokenHint');

 form?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const payload = {
   email: form.email.value.trim(),
  };
  try {
   const data = await api('/api/auth/forgot-password', {
    method: 'POST',
    body: JSON.stringify(payload),
   });
   setMessage(
    'forgotPasswordMessage',
    data.message || 'If the email exists, a reset code has been sent.'
   );
   if (tokenHint) {
    if (data.reset_token) {
     tokenHint.className = 'notice';
     tokenHint.textContent = `Reset code (dev only): ${data.reset_token}`;
    } else {
     tokenHint.textContent = '';
    }
   }
  } catch (err) {
   setMessage('forgotPasswordMessage', err.message, true);
  }
 });
}

if (page === 'reset-password') {
 const form = document.getElementById('resetPasswordForm');
 const tokenInput = document.getElementById('resetToken');
 const params = new URLSearchParams(window.location.search);
 const presetToken = params.get('token');
 if (tokenInput && presetToken) {
  tokenInput.value = presetToken;
 }

 form?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const password = form.password.value.trim();
  const confirm = form.confirm_password.value.trim();

  if (password !== confirm) {
   setMessage('resetPasswordMessage', 'Passwords do not match.', true);
   return;
  }

  const payload = {
   token: form.token.value.trim(),
   password,
  };
  try {
   const data = await api('/api/auth/reset-password', {
    method: 'POST',
    body: JSON.stringify(payload),
   });
   setMessage('resetPasswordMessage', data.message || 'Password reset.');
   setTimeout(() => {
    window.location.href = 'index.html';
   }, 900);
  } catch (err) {
   setMessage('resetPasswordMessage', err.message, true);
  }
 });
}

if (page === 'profile') {
 const form = document.getElementById('profileForm');
 const passwordForm = document.getElementById('profilePasswordForm');
 const securityAlert = document.getElementById('profileSecurityAlert');
 const dashboardLink = document.getElementById('profileDashboardLink');
 const heroDashboardLink = document.getElementById('profileHeroDashboardLink');
 const vehicleInput = document.getElementById('profileVehicle');
 const roleChip = document.getElementById('profileRoleChip');
 const roleLabel = document.getElementById('profileRoleLabel');
 const heroTitle = document.getElementById('profileHeroTitle');
 const heroText = document.getElementById('profileHeroText');

 const auth = getAuth();
 const roleContent = {
  admin: {
   chip: 'Admin account',
   label: 'Administrator',
   title: 'Manage your administrator profile from one place.',
   text: 'Keep your contact details current so approvals, exports, and account recovery stay smooth.',
  },
  attendant: {
   chip: 'Attendant account',
   label: 'Parking Attendant',
   title: 'Stay ready for the next vehicle entry with one clear account page.',
   text: 'Update your contact details so handoff communication and shift coordination stay in sync.',
  },
  driver: {
   chip: 'Driver account',
   label: 'Driver',
   title: 'Keep your profile ready for the next parking session.',
   text: 'Update your contact details, vehicle information, and account recovery settings from one place.',
  },
 };

 const updateDashboardAccess = (roleValue, required) => {
  const role = roleValue || auth?.user?.role || 'driver';
  const targetHref = required ? '#profilePasswordForm' : roleHome(role);
  [dashboardLink, heroDashboardLink].forEach((link) => {
   if (!link) return;
   link.href = targetHref;
   link.toggleAttribute('aria-disabled', required);
   link.classList.toggle('is-locked', required);
  });
 };

 const applyRolePresentation = (roleValue, passwordRequired = mustChangePassword(getAuth())) => {
  const role = roleValue || auth?.user?.role || 'driver';
  const content = roleContent[role] || roleContent.driver;
  document.body.dataset.profileRole = role;
  updateDashboardAccess(role, passwordRequired);
  if (roleChip) {
   roleChip.textContent = content.chip;
  }
  if (roleLabel) {
   roleLabel.textContent = content.label;
  }
  if (heroTitle) {
   heroTitle.textContent = content.title;
  }
  if (heroText) {
   heroText.textContent = content.text;
  }
 };

 const syncPasswordRequirement = (required) => {
  if (securityAlert) {
   securityAlert.hidden = true;
  }
  updateDashboardAccess(getAuth()?.user?.role || auth?.user?.role, required);
  refreshTopbarProfile();
  if (required) {
   setPersistentTopbarNotice(
    'You are signed in with deployment seed credentials. Update your password now before continuing.',
    { type: 'warn', category: 'System' }
   );
  } else {
   clearPersistentTopbarNotice();
  }
 };

 applyRolePresentation(auth?.user?.role, mustChangePassword(auth));
 syncPasswordRequirement(mustChangePassword(auth));

 async function loadProfile() {
  try {
   const data = await api('/api/users/me');
   form.name.value = data.name || '';
   form.email.value = data.email || '';
   form.phone.value = data.phone || '';
   form.vehicle_number.value = data.vehicle_number || '';
   applyRolePresentation(data.user_type || auth?.user?.role, Boolean(data.must_change_password));
   updateAuthUser({
    name: data.name,
    email: data.email,
    must_change_password: Boolean(data.must_change_password),
   });
   syncPasswordRequirement(Boolean(data.must_change_password));
   if (vehicleInput) {
    const isDriver = data.user_type === 'driver';
    vehicleInput.disabled = !isDriver;
    vehicleInput.placeholder = isDriver ? '' : 'Drivers only';
   }
  } catch (err) {
   setMessage('profileMessage', err.message, true);
  }
 }

 loadProfile();

 [dashboardLink, heroDashboardLink].forEach((link) => {
  link?.addEventListener('click', (event) => {
   if (link.getAttribute('href') !== '#profilePasswordForm') return;
   event.preventDefault();
   focusRequiredPasswordUpdate();
  });
 });

 form?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const payload = {
   name: form.name.value.trim(),
   email: form.email.value.trim(),
   phone: form.phone.value.trim() || null,
  };
  if (vehicleInput && !vehicleInput.disabled) {
   payload.vehicle_number = form.vehicle_number.value.trim() || null;
  }
  try {
   const updated = await api('/api/users/me', {
    method: 'PATCH',
    body: JSON.stringify(payload),
   });
   setMessage('profileMessage', 'Profile updated successfully.');
   updateAuthUser({
    name: updated.name,
    email: updated.email,
    must_change_password: Boolean(updated.must_change_password),
   });
   refreshTopbarProfile();
  } catch (err) {
   setMessage('profileMessage', err.message, true);
  }
 });

 passwordForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const currentPassword = passwordForm.current_password.value.trim();
  const newPassword = passwordForm.new_password.value.trim();
  const confirmPassword = passwordForm.confirm_password.value.trim();
  const passwordError = validatePasswordStrength(newPassword);

  if (passwordError) {
   setMessage('profilePasswordMessage', passwordError, true);
   return;
  }
  if (newPassword !== confirmPassword) {
   setMessage('profilePasswordMessage', 'New passwords do not match.', true);
   return;
  }

  try {
   const result = await api('/api/users/change-password', {
    method: 'POST',
    body: JSON.stringify({
     current_password: currentPassword,
     new_password: newPassword,
    }),
   });
   passwordForm.reset();
   setMessage('profilePasswordMessage', result.message || 'Password updated successfully.');
   updateAuthUser({ must_change_password: false });
   syncPasswordRequirement(false);
   refreshTopbarProfile();

   if (new URLSearchParams(window.location.search).get('forcePasswordChange') === '1') {
    setTimeout(() => {
     window.location.href = roleHome(getAuth()?.user?.role || 'driver');
    }, 900);
   }
  } catch (err) {
   setMessage('profilePasswordMessage', err.message, true);
  }
 });
}
if (page === 'driver') {
 const slotGrid = document.getElementById('driverSlotGrid');
 const quickBookInput = document.getElementById('quickBookInput');
 const quickBookBtn = document.getElementById('quickBookBtn');
 const bookingForm = document.getElementById('bookingForm');
 const selectedSlotLabel = document.getElementById('selectedSlotLabel');
 const selectedLocationLabel = document.getElementById('selectedLocationLabel');
 const selectedRateLabel = document.getElementById('selectedRateLabel');
 const selectedStatusLabel = document.getElementById('selectedSlotStatus');
 const selectedDurationLabel = document.getElementById('selectedDurationLabel');
 const selectedWindowLabel = document.getElementById('selectedWindowLabel');
 const estimatedTotalEl = document.getElementById('estimatedTotal');
 const calculateTotalBtn = document.getElementById('calculateTotalBtn');
 const refreshSlotsBtn = document.getElementById('refreshSlotsBtn');
 const slotSearchInput = document.getElementById('driverSlotSearch');
 const activeBookingContainer = document.getElementById('activeBookingCard');
 const historyContainer = document.getElementById('bookingHistoryCards');
 const greetingEl = document.getElementById('driverGreeting');
 const availableHintEl = document.getElementById('driverAvailableHint');
 const heroAvailableEl = document.getElementById('driverHeroAvailable');
 const heroPendingEl = document.getElementById('driverHeroPending');
 const pendingSummaryEl = document.getElementById('driverPendingSummary');
 const pendingDetailEl = document.getElementById('driverPendingDetail');
 const heroBookingsEl = document.getElementById('driverHeroBookings');
 const bookingHintEl = document.getElementById('driverBookingHint');
 const bookingFlashCard = document.getElementById('driverBookingFlash');
 const bookingFlashTitle = document.getElementById('driverBookingFlashTitle');
 const bookingFlashBody = document.getElementById('driverBookingFlashBody');
 const bookingFlashPrimary = document.getElementById('driverBookingFlashPrimary');
 const bookingFlashSecondary = document.getElementById('driverBookingFlashSecondary');
 const slotFilterButtons = Array.from(document.querySelectorAll('[data-slot-filter]'));
 const workspacePanel = document.getElementById('driverWorkspace');
 const bookingPanel = document.getElementById('driver-booking-panel');
 const recordsPanel = document.getElementById('driver-records-panel');
 const driverOpenTriggers = Array.from(document.querySelectorAll('[data-driver-open], #driverBookingFlashPrimary, #driverBookingFlashSecondary'));

 let slotsCache = [];
 let selectedSlot = null;
 let slotStatusFilter = 'all';
 let driverCountdownTimer = null;
 let driverCountdownRefreshQueued = false;

 const slotStatusLabels = {
  all: 'All',
  available: 'Available',
  booked: 'Booked',
  occupied: 'Occupied',
  maintenance: 'Maintenance',
 };

 const slotStatusMessages = {
  available: 'Ready to book',
  booked: 'Reserved for another driver',
  occupied: 'Currently occupied',
  maintenance: 'Temporarily unavailable',
 };

 const formatLocalInput = (date) => {
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
   date.getHours()
  )}:${pad(date.getMinutes())}`;
 };

 const setGreeting = () => {
  const firstName = getAuth()?.user?.name?.trim()?.split(/\s+/)[0] || 'Driver';
  if (greetingEl) {
   greetingEl.textContent = `${firstName}, ready to park?`;
  }
 };

 const configureDriverFlashAction = (element, label, href) => {
  if (!element) return;
  element.textContent = label;
  element.href = href;
  delete element.dataset.driverOpen;
  delete element.dataset.driverTarget;

  if (href === '#driver-records-panel' || href === '#driver-history-section') {
   element.dataset.driverOpen = 'records';
   element.dataset.driverTarget = href === '#driver-history-section' ? 'driver-history-section' : 'driver-records-panel';
   return;
  }

  if (href === '#driver-slot-catalog' || href === '#driver-booking-panel') {
   element.dataset.driverOpen = 'workspace';
   element.dataset.driverTarget = href.slice(1);
  }
 };

 const showDriverFlash = (payload) => {
  if (!bookingFlashCard || !payload) return;
  if (bookingFlashTitle) bookingFlashTitle.textContent = payload.title || 'Booking updated.';
  if (bookingFlashBody) bookingFlashBody.textContent = payload.body || 'Your latest booking update is ready.';
  configureDriverFlashAction(
   bookingFlashPrimary,
   payload.primaryLabel || 'Continue',
   payload.primaryHref || 'payment.html'
  );
  configureDriverFlashAction(
   bookingFlashSecondary,
   payload.secondaryLabel || 'Review history',
   payload.secondaryHref || '#driver-records-panel'
  );
  toggleHidden(bookingFlashCard, false);
 };

 const consumeDriverFlash = () => {
  const flash = consumeUiFlash('driver');
  if (flash) {
   showDriverFlash(flash);
  }
 };

 const syncDriverWorkspaceLayout = () => {
  if (!workspacePanel) return;
  const bookingOpen = Boolean(bookingPanel && !bookingPanel.hidden);
  workspacePanel.classList.toggle('is-booking-open', bookingOpen);
 };

 const openDriverView = (view, targetId = '') => {
  if (view === 'workspace') {
   toggleHidden(workspacePanel, false);
   if (targetId === 'driver-booking-panel') {
    toggleHidden(bookingPanel, false);
   }
   syncDriverWorkspaceLayout();
   const target = document.getElementById(targetId) || workspacePanel;
   target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
   return;
  }

  if (view === 'records') {
   toggleHidden(recordsPanel, false);
   const target = document.getElementById(targetId) || recordsPanel;
   target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
 };

 const bindDriverOpenTrigger = (trigger) => {
  trigger.addEventListener('click', (event) => {
   const view = trigger.dataset.driverOpen;
   if (!view) return;

   const href = trigger.getAttribute('href') || '';
   const targetId = trigger.dataset.driverTarget || (href.startsWith('#') ? href.slice(1) : '');

   if (!href || href.startsWith('#')) {
    event.preventDefault();
   }

   openDriverView(view, targetId);
  });
 };

 const seedBookingWindow = () => {
  if (!bookingForm?.start_time || !bookingForm?.end_time) return;
  if (bookingForm.start_time.value && bookingForm.end_time.value) return;

  const start = new Date();
  start.setMinutes(0, 0, 0);
  start.setHours(start.getHours() + 1);

  const end = new Date(start);
  end.setHours(end.getHours() + 2);

  bookingForm.start_time.value = formatLocalInput(start);
  bookingForm.end_time.value = formatLocalInput(end);
 };

 const parseBookingWindow = () => {
  const startValue = bookingForm?.start_time?.value || '';
  const endValue = bookingForm?.end_time?.value || '';
  const start = new Date(startValue);
  const end = new Date(endValue);

  if (!startValue || !endValue || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
   return { valid: false, message: 'Select valid start and end time.' };
  }

  if (end <= start) {
   return { valid: false, message: 'End time must be after start time.' };
  }

  const billedHours = Math.max(1, Math.ceil((end - start) / (1000 * 60 * 60)));
  const total = Number(selectedSlot?.hourly_rate || 0) * billedHours;
  return { valid: true, start, end, billedHours, total };
 };

 const updateFilterButtons = () => {
  const counts = {
   all: slotsCache.length,
   available: slotsCache.filter((slot) => normalizeStatus(slot.status) === 'available').length,
   booked: slotsCache.filter((slot) => normalizeStatus(slot.status) === 'booked').length,
   occupied: slotsCache.filter((slot) => normalizeStatus(slot.status) === 'occupied').length,
  };

  slotFilterButtons.forEach((button) => {
   const filter = button.dataset.slotFilter || 'all';
   const label = button.dataset.filterLabel || slotStatusLabels[filter] || 'All';
   button.textContent = `${label} ${counts[filter] ?? 0}`;
   button.classList.toggle('is-active', filter === slotStatusFilter);
  });
 };

 const updateInventoryInsights = () => {
  const availableCount = slotsCache.filter((slot) => normalizeStatus(slot.status) === 'available').length;
  const zoneCount = new Set(
   slotsCache
    .map((slot) => (slot.location || 'General').trim())
    .filter(Boolean)
  ).size;

  if (heroAvailableEl) heroAvailableEl.textContent = String(availableCount);

  if (availableHintEl) {
   availableHintEl.textContent = availableCount
    ? `${availableCount} spaces are currently open across ${zoneCount || 1} parking zone${
      zoneCount === 1 ? '' : 's'
     }.`
    : 'All spaces are currently occupied or reserved. Refresh shortly for new availability.';
  }
 };

 const updatePendingPaymentInsights = (bookings = []) => {
  const pendingMobileBookings = bookings.filter((booking) => {
   const bookingStatus = String(booking.booking_status || '').toLowerCase();
   const paymentStatus = String(booking.payment_status || '').toLowerCase();
   const paymentMethod = String(booking.payment_method || '').toLowerCase();
   return bookingStatus === 'pending' && paymentStatus !== 'paid' && paymentMethod === 'mobile money';
  });

  if (heroPendingEl) {
   heroPendingEl.textContent = String(pendingMobileBookings.length);
  }

  if (!pendingSummaryEl || !pendingDetailEl) return;

  if (!pendingMobileBookings.length) {
   pendingSummaryEl.textContent = 'No pending mobile-money payments.';
   pendingDetailEl.textContent = 'New selections stay visible to others until you complete payment.';
   return;
  }

  const nextPending = pendingMobileBookings
   .map((booking) => ({ booking, deadline: getPendingPaymentDeadline(booking) }))
   .sort((a, b) => {
    const aTime = a.deadline ? a.deadline.getTime() : Number.POSITIVE_INFINITY;
    const bTime = b.deadline ? b.deadline.getTime() : Number.POSITIVE_INFINITY;
    return aTime - bTime;
   })[0];

  const deadline = nextPending?.deadline || null;
  const countdown = formatCountdown(getRemainingSeconds(deadline) || 0);
  pendingSummaryEl.innerHTML = `${pendingMobileBookings.length} payment${pendingMobileBookings.length === 1 ? '' : 's'} awaiting confirmation. <span data-hold-countdown data-hold-deadline="${deadline ? deadline.toISOString() : ''}">${countdown}</span>`;
  pendingDetailEl.textContent = `Complete payment for slot ${nextPending?.booking?.slot_number || '-'} before the hold expires.`;
 };

 const updateEstimatePreview = () => {
  if (!selectedSlot) {
   if (estimatedTotalEl) estimatedTotalEl.textContent = formatCurrency(0);
   if (selectedDurationLabel) selectedDurationLabel.textContent = '-';
   if (selectedWindowLabel) {
    selectedWindowLabel.textContent = 'Choose your start and end time to preview the session.';
   }
   return null;
  }

  const parsed = parseBookingWindow();
  if (!parsed.valid) {
   if (estimatedTotalEl) estimatedTotalEl.textContent = formatCurrency(0);
   if (selectedDurationLabel) selectedDurationLabel.textContent = 'Awaiting valid times';
   if (selectedWindowLabel) selectedWindowLabel.textContent = parsed.message;
   return null;
  }

  if (estimatedTotalEl) estimatedTotalEl.textContent = formatCurrency(parsed.total);
  if (selectedDurationLabel) {
   selectedDurationLabel.textContent = `${parsed.billedHours} ${
    parsed.billedHours === 1 ? 'hour' : 'hours'
   }`;
  }
  if (selectedWindowLabel) {
   selectedWindowLabel.textContent = `${formatDateTime(parsed.start)} to ${formatDateTime(parsed.end)}`;
  }
  return parsed;
 };

 const renderSlots = () => {
  if (!slotGrid) return;

  updateFilterButtons();
  updateInventoryInsights();

  const query = slotSearchInput?.value.trim().toLowerCase() || '';
  const filteredSlots = slotsCache.filter((slot) => {
   const status = normalizeStatus(slot.status);
   const matchesFilter = slotStatusFilter === 'all' || status === slotStatusFilter;
   const slotNumber = (slot.slot_number || '').toLowerCase();
   const location = (slot.location || '').toLowerCase();
   const matchesQuery = !query || slotNumber.includes(query) || location.includes(query);
   return matchesFilter && matchesQuery;
  });

  slotGrid.innerHTML = '';

  if (!filteredSlots.length) {
   const emptyState = document.createElement('div');
   emptyState.className = 'driver-empty-state';
   emptyState.innerHTML = '<strong>No matching parking spaces.</strong><div>Adjust your search or choose another status filter.</div>';
   slotGrid.appendChild(emptyState);
   return;
  }

  filteredSlots.forEach((slot) => {
   const status = normalizeStatus(slot.status);
   const isAvailable = status === 'available';
   const card = document.createElement('button');
   card.type = 'button';
   card.className = `driver-slot-card status-${status}`;

   card.setAttribute('aria-label', `${slot.slot_number || 'Parking space'} in ${slot.location || 'General'} - ${slotStatusLabels[status] || status}`);
   if (selectedSlot && String(slot.slot_id) === String(selectedSlot.slot_id)) {
    card.classList.add('is-selected');
   }
   if (!isAvailable) {
    card.classList.add('is-disabled');
   }

   const top = document.createElement('div');
   top.className = 'driver-slot-card-top';

   const badge = document.createElement('span');
   badge.className = `driver-slot-status status-${status}`;
   badge.textContent = slotStatusLabels[status] || 'Available';

   const action = document.createElement('span');
   action.className = 'driver-slot-action';
   action.textContent = isAvailable ? 'Click to reserve' : 'Unavailable';

   top.appendChild(badge);
   top.appendChild(action);

   const number = document.createElement('div');
   number.className = 'driver-slot-number';
   number.textContent = slot.slot_number || slot.slot_id || '-';

   const location = document.createElement('div');
   location.className = 'driver-slot-location';
   location.textContent = slot.location || 'General';

   const bottom = document.createElement('div');
   bottom.className = 'driver-slot-card-bottom';

   const rate = document.createElement('div');
   rate.className = 'driver-slot-rate';
   rate.innerHTML = `${formatCurrency(slot.hourly_rate || 0)}<small>/hr</small>`;

   const caption = document.createElement('div');
   caption.className = 'driver-slot-caption';
   caption.textContent = slotStatusMessages[status] || 'Check availability';

   bottom.appendChild(rate);
   bottom.appendChild(caption);

   card.appendChild(top);
   card.appendChild(number);
   card.appendChild(location);
   card.appendChild(bottom);

   card.addEventListener('click', () => {
    if (!isAvailable) {
     setMessage('bookingMessage', 'This slot is not currently available.', true);
     return;
    }
    updateSelectedSlot(slot);
    openDriverView('workspace', 'driver-booking-panel');
    setMessage('bookingMessage', `Selected slot ${slot.slot_number}.`);
   });

   slotGrid.appendChild(card);
  });
 };

 const updateSelectedSlot = (slot) => {
  selectedSlot = slot || null;

  if (selectedSlotLabel) selectedSlotLabel.textContent = slot?.slot_number || '-';
  if (selectedLocationLabel) selectedLocationLabel.textContent = slot?.location || 'General';
  if (selectedRateLabel) selectedRateLabel.textContent = formatCurrency(slot?.hourly_rate || 0);
  if (quickBookInput) quickBookInput.value = slot?.slot_number || '';

  if (selectedStatusLabel) {
   const status = slot ? normalizeStatus(slot.status) : '';
   selectedStatusLabel.textContent = slot ? slotStatusLabels[status] || 'Available' : 'Awaiting selection';
   selectedStatusLabel.className = slot
    ? `driver-selection-status status-${status}`
    : 'driver-selection-status';
  }

  if (bookingHintEl) {
   bookingHintEl.textContent = slot
    ? `Slot ${slot.slot_number || '-'} in ${slot.location || 'General'} is ready. Set your times, review the estimate, and confirm when ready.`
    : 'Select an available slot card to begin your booking flow.';
  }

  if (slot) {
   toggleHidden(workspacePanel, false);
   toggleHidden(bookingPanel, false);
   syncDriverWorkspaceLayout();
  } else {
   toggleHidden(bookingPanel, true);
   syncDriverWorkspaceLayout();
  }

  const hiddenInput = document.getElementById('bookingSlotId');
  if (hiddenInput) hiddenInput.value = slot?.slot_id || '';

  updateEstimatePreview();
  renderSlots();
 };

 const openBookingDetails = (booking) => {
  if (!booking?.booking_id) return;
  localStorage.setItem('pending_payment_booking', booking.booking_id);
  window.location.href = `payment.html?booking_id=${booking.booking_id}`;
 };

 const createBookingCard = (booking, options = {}) => {
  const isActive = Boolean(options.active);
  const bookingStatus = String(booking.booking_status || 'pending').toLowerCase();
  const paymentStatus = String(booking.payment_status || 'pending').toLowerCase();
  const paymentMethod = String(booking.payment_method || 'cash').replace(/_/g, ' ');
  const canPay = paymentStatus !== 'paid' && paymentMethod === 'mobile money';
  const canOpen = Boolean(booking?.booking_id);

  const card = document.createElement('article');
  card.className = 'history-card driver-history-item';
  if (isActive) card.classList.add('is-active');
  if (canOpen) {
   card.classList.add('is-clickable');
   card.tabIndex = 0;
   card.setAttribute('role', 'link');
   card.setAttribute('aria-label', `Open booking ${booking.booking_id}`);
   const handleOpen = () => openBookingDetails(booking);
   card.addEventListener('click', handleOpen);
   card.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
     event.preventDefault();
     handleOpen();
    }
   });
  }

  const head = document.createElement('div');
  head.className = 'driver-history-head';

  const left = document.createElement('div');
  const kicker = document.createElement('div');
  kicker.className = 'driver-history-kicker';
  kicker.textContent = isActive ? 'Active booking' : 'Booking record';

  const slot = document.createElement('div');
  slot.className = 'driver-history-slot';
  slot.textContent = booking.slot_number || '-';

  const location = document.createElement('div');
  location.className = 'driver-history-line';
  location.textContent = `Location: ${booking.location || 'General'}`;

  left.appendChild(kicker);
  left.appendChild(slot);
  left.appendChild(location);

  const right = document.createElement('div');
  right.className = 'driver-history-total';

  const totalLabel = document.createElement('small');
  totalLabel.textContent = 'Total amount';

  const totalValue = document.createElement('strong');
  totalValue.textContent = formatCurrency(booking.total_cost || 0);

  right.appendChild(totalLabel);
  right.appendChild(totalValue);

  head.appendChild(left);
  head.appendChild(right);

  const badgeRow = document.createElement('div');
  badgeRow.className = 'driver-history-badges';

  const bookingBadge = document.createElement('span');
  bookingBadge.className = 'driver-history-badge';
  bookingBadge.dataset.state = bookingStatus;
  bookingBadge.textContent = bookingStatus;

  const paymentBadge = document.createElement('span');
  paymentBadge.className = 'driver-history-badge';
  paymentBadge.dataset.state = paymentStatus;
  paymentBadge.textContent = paymentStatus;

  badgeRow.appendChild(bookingBadge);
  badgeRow.appendChild(paymentBadge);

  const windowLine = document.createElement('div');
  windowLine.className = 'driver-history-line';
  windowLine.textContent = `Window: ${formatDateTime(booking.start_time)} to ${formatDateTime(booking.end_time)}`;

  const paymentLine = document.createElement('div');
  paymentLine.className = 'driver-history-line';
  paymentLine.textContent = `Payment: ${paymentStatus} via ${paymentMethod}`;

  const refLine = document.createElement('div');
  refLine.className = 'driver-history-line';
  refLine.textContent = `Booking reference: #${booking.booking_id || '-'}`;

  let holdLine = null;
  if (bookingStatus === 'pending' && paymentMethod === 'mobile money') {
   const deadline = getPendingPaymentDeadline(booking);
   holdLine = document.createElement('div');
   holdLine.className = 'driver-history-line driver-history-hold';
   holdLine.innerHTML = `Payment hold: <strong data-hold-countdown data-hold-deadline="${deadline ? deadline.toISOString() : ''}">${formatCountdown(getRemainingSeconds(deadline) || 0)}</strong> remaining before auto-release.`;
  }

  const actions = document.createElement('div');
  actions.className = 'driver-history-actions';

  const actionButton = document.createElement('button');
  actionButton.type = 'button';
  actionButton.className = canPay ? 'btn-primary' : 'btn-muted';
  actionButton.textContent = canPay ? 'Pay now' : 'Open booking';

  if (canOpen) {
   actionButton.addEventListener('click', (event) => {
    event.stopPropagation();
    openBookingDetails(booking);
   });
  } else {
   actionButton.disabled = true;
  }

  actions.appendChild(actionButton);

  card.appendChild(head);
  card.appendChild(badgeRow);
  card.appendChild(windowLine);
  card.appendChild(paymentLine);
  card.appendChild(refLine);
  if (holdLine) {
   card.appendChild(holdLine);
  }
  card.appendChild(actions);

  return card;
 };

 const renderActiveBooking = (booking) => {
  if (!activeBookingContainer) return;
  activeBookingContainer.innerHTML = '';

  if (!booking) {
   const emptyState = document.createElement('div');
   emptyState.className = 'driver-empty-state';
   emptyState.innerHTML = '<strong>No active booking.</strong><div>Your next confirmed booking will appear here.</div>';
   activeBookingContainer.appendChild(emptyState);
   return;
  }

  activeBookingContainer.appendChild(createBookingCard(booking, { active: true }));
 };

 const bindDriverCountdowns = () => {
  if (driverCountdownTimer) {
   clearInterval(driverCountdownTimer);
   driverCountdownTimer = null;
  }

  const updateCountdowns = () => {
   const countdownEls = document.querySelectorAll('[data-hold-countdown]');
   let shouldRefreshData = false;

   countdownEls.forEach((el) => {
    const deadlineValue = el.getAttribute('data-hold-deadline');
    const deadline = deadlineValue ? new Date(deadlineValue) : null;
    const remainingSeconds = getRemainingSeconds(deadline);
    el.textContent = formatCountdown(remainingSeconds || 0);

    const holdCard = el.closest('.driver-history-hold');
    if (holdCard) {
     holdCard.classList.toggle('is-warning', remainingSeconds !== null && remainingSeconds <= 30);
    }

    if (remainingSeconds !== null && remainingSeconds <= 0) {
     shouldRefreshData = true;
    }
   });

   if (shouldRefreshData && !driverCountdownRefreshQueued) {
    driverCountdownRefreshQueued = true;
    setTimeout(() => {
     driverCountdownRefreshQueued = false;
     loadBookings();
     loadSlots();
    }, 1200);
   }
  };

  updateCountdowns();
  if (document.querySelector('[data-hold-countdown]')) {
   driverCountdownTimer = setInterval(updateCountdowns, 1000);
  }
 };

 const loadSlots = async () => {
  try {
   slotsCache = sortSlotsForDisplay(await api('/api/driver/slots'));

   if (selectedSlot) {
    const refreshedSelection = slotsCache.find(
     (slot) => String(slot.slot_id) === String(selectedSlot.slot_id)
    );
    if (!refreshedSelection || normalizeStatus(refreshedSelection.status) !== 'available') {
     updateSelectedSlot(null);
     return;
    }
    updateSelectedSlot(refreshedSelection);
    return;
   }

   renderSlots();
  } catch (err) {
   setMessage('bookingMessage', err.message, true);
  }
 };

 const loadBookings = async () => {
  if (!historyContainer && !activeBookingContainer) return;

  try {
   const bookings = await api('/api/driver/bookings');
   if (heroBookingsEl) heroBookingsEl.textContent = String(bookings.length);
   updatePendingPaymentInsights(bookings);

   const now = new Date();
   const activeBooking =
    bookings.find((booking) => {
     const status = String(booking.booking_status || '').toLowerCase();
     const endTime = new Date(booking.end_time);
     return status === 'confirmed' && !Number.isNaN(endTime.getTime()) && endTime > now;
    }) ||
    bookings.find((booking) => {
     const status = String(booking.booking_status || '').toLowerCase();
     const endTime = new Date(booking.end_time);
     return status === 'pending' && !Number.isNaN(endTime.getTime()) && endTime > now;
    });

   renderActiveBooking(activeBooking);

   const historyBookings = activeBooking
    ? bookings.filter((booking) => booking.booking_id !== activeBooking.booking_id)
    : bookings;

   if (historyContainer) {
    historyContainer.innerHTML = '';
    if (!historyBookings.length) {
     const emptyState = document.createElement('div');
     emptyState.className = 'driver-empty-state';
     emptyState.innerHTML = '<strong>No booking history yet.</strong><div>Your completed and upcoming sessions will be listed here.</div>';
     historyContainer.appendChild(emptyState);
     bindDriverCountdowns();
     return;
    }

    historyBookings.forEach((booking) => {
     historyContainer.appendChild(createBookingCard(booking));
    });
   }

   bindDriverCountdowns();
  } catch (err) {
   setMessage('bookingMessage', err.message, true);
  }
 };

 refreshSlotsBtn?.addEventListener('click', loadSlots);
 slotSearchInput?.addEventListener('input', renderSlots);

 slotFilterButtons.forEach((button) => {
  button.addEventListener('click', () => {
   slotStatusFilter = button.dataset.slotFilter || 'available';
   updateFilterButtons();
   renderSlots();
  });
 });

 bookingForm?.start_time?.addEventListener('change', updateEstimatePreview);
 bookingForm?.end_time?.addEventListener('change', updateEstimatePreview);

 quickBookBtn?.addEventListener('click', () => {
  const input = quickBookInput?.value.trim();
  if (!input) {
   setMessage('bookingMessage', 'Enter a slot number to book.', true);
   return;
  }

  const match = slotsCache.find(
   (slot) => slot.slot_number?.toLowerCase() === input.toLowerCase()
  );

  if (!match) {
   setMessage('bookingMessage', 'Slot not found.', true);
   return;
  }

  if (normalizeStatus(match.status) !== 'available') {
   setMessage('bookingMessage', 'Selected slot is not available.', true);
   return;
  }

  slotStatusFilter = 'available';
  updateSelectedSlot(match);
  openDriverView('workspace', 'driver-booking-panel');
  setMessage('bookingMessage', `Selected slot ${match.slot_number}.`);
 });

 calculateTotalBtn?.addEventListener('click', () => {
  if (!selectedSlot) {
   setMessage('bookingMessage', 'Select a slot first.', true);
   return;
  }

  const estimate = updateEstimatePreview();
  if (!estimate) {
   setMessage('bookingMessage', parseBookingWindow().message, true);
   return;
  }

  setMessage('bookingMessage', `Estimated total updated to ${formatCurrency(estimate.total)}.`);
 });

 bookingForm?.addEventListener('submit', async (event) => {
  event.preventDefault();

  if (!selectedSlot) {
   setMessage('bookingMessage', 'Select a slot to continue.', true);
   return;
  }

  const estimate = parseBookingWindow();
  if (!estimate.valid) {
   setMessage('bookingMessage', estimate.message, true);
   return;
  }

  const payload = {
   slot_id: Number(selectedSlot.slot_id),
   start_time: bookingForm.start_time.value,
   end_time: bookingForm.end_time.value,
   payment_method: bookingForm.payment_method.value,
  };
  const bookingSnapshot = {
   slotNumber: selectedSlot.slot_number || '-',
   location: selectedSlot.location || 'General',
   total: formatCurrency(estimate.total),
   window: `${formatDateTime(estimate.start)} to ${formatDateTime(estimate.end)}`,
  };

  try {
   const result = await api('/api/driver/bookings', {
    method: 'POST',
    body: JSON.stringify(payload),
   });
   const bookingSuccessMessage =
    payload.payment_method === 'mobile_money'
     ? `Booking created. Complete payment within ${Math.max(1, Math.round(getPaymentHoldSeconds() / 60))} minute(s) or the slot will be released automatically.`
     : 'Booking confirmed.';
   setMessage('bookingMessage', bookingSuccessMessage);
   if (bookingForm?.reset) {
    bookingForm.reset();
   }
   seedBookingWindow();
   toggleHidden(bookingPanel, true);
   syncDriverWorkspaceLayout();
   updateSelectedSlot(null);
   loadSlots();
   loadBookings();

   if (payload.payment_method === 'mobile_money' && result?.booking_id) {
    saveUiFlash('payment', {
     title: 'Booking created. Finish payment now.',
     body: `Slot ${bookingSnapshot.slotNumber} in ${bookingSnapshot.location} is on hold. Total ${bookingSnapshot.total}. Complete payment before the timer expires.`,
     bookingId: result.booking_id,
    });
    localStorage.setItem('pending_payment_booking', result.booking_id);
    setTimeout(() => {
     window.location.href = `payment.html?booking_id=${result.booking_id}`;
    }, 700);
    return;
   }

   showDriverFlash({
    title: 'Booking confirmed.',
    body: `Slot ${bookingSnapshot.slotNumber} is confirmed for ${bookingSnapshot.window}. Total ${bookingSnapshot.total}.`,
    primaryHref: '#driver-history-section',
    primaryLabel: 'Review booking',
    secondaryHref: '#driver-slot-catalog',
    secondaryLabel: 'Book another space',
   });
  } catch (err) {
   setMessage('bookingMessage', err.message, true);
  }
 });

 driverOpenTriggers.forEach(bindDriverOpenTrigger);
 syncDriverWorkspaceLayout();
 setGreeting();
 consumeDriverFlash();
 seedBookingWindow();
 updateFilterButtons();
 updateEstimatePreview();
 loadSlots();
 loadBookings();
 setInterval(loadSlots, 60000);
 setInterval(loadBookings, 120000);
}

if (page === 'payment') {
 const paymentForm = document.getElementById('paymentForm');
 const bookingSelect = document.getElementById('paymentBookingSelect');
 const paymentSlotEl = document.getElementById('paymentSlot');
 const paymentDurationEl = document.getElementById('paymentDuration');
 const paymentTotalEl = document.getElementById('paymentTotal');
 const methodRadios = document.querySelectorAll('input[name="payment_method"]');
 const mobileFields = document.getElementById('mobileMoneyFields');
 const paymentMessage = document.getElementById('paymentMessage');
 const paymentHoldNotice = document.getElementById('paymentHoldNotice');
 const paymentHoldText = document.getElementById('paymentHoldText');
 const paymentCountdownEl = document.getElementById('paymentCountdown');
 const paymentSelectionSummary = document.getElementById('paymentSelectionSummary');
 const paymentNextStepSummary = document.getElementById('paymentNextStepSummary');
 const paymentEmptyState = document.getElementById('paymentEmptyState');
 const paymentSuccessState = document.getElementById('paymentSuccessState');
 const paymentSuccessTitle = document.getElementById('paymentSuccessTitle');
 const paymentSuccessBody = document.getElementById('paymentSuccessBody');
 const payNowBtn = paymentForm?.querySelector('button[type="submit"]');

 const params = new URLSearchParams(window.location.search);
 const presetBookingId = params.get('booking_id');
 const storedBookingId = localStorage.getItem('pending_payment_booking');
 const paymentFlash = consumeUiFlash('payment');
 const flashBookingId = paymentFlash?.bookingId ? String(paymentFlash.bookingId) : '';

 let bookingCache = [];
 let selectedBooking = null;
 let paymentCountdownTimer = null;
 let paymentExpiryRefreshQueued = false;

 const renderSuccessState = (title, body) => {
  if (!paymentSuccessState) return;
  if (paymentSuccessTitle) paymentSuccessTitle.textContent = title;
  if (paymentSuccessBody) paymentSuccessBody.textContent = body;
  toggleHidden(paymentSuccessState, false);
 };

 const clearSuccessState = () => {
  toggleHidden(paymentSuccessState, true);
 };

 const updateSubmitButton = (booking = selectedBooking) => {
  if (!payNowBtn) return;
  if (!booking) {
   payNowBtn.textContent = 'Pay Now';
   payNowBtn.disabled = true;
   return;
  }

  const bookingMethod = String(booking.payment_method || '').toLowerCase();
  if (bookingMethod === 'cash' || paymentForm?.payment_method?.value === 'cash') {
   payNowBtn.textContent = 'Record cash for exit';
   payNowBtn.disabled = false;
   return;
  }

  payNowBtn.textContent = 'Send payment prompt';
  payNowBtn.disabled = false;
 };

 const updateSelectionCards = (booking) => {
  if (!booking) {
   setSummaryCardCopy(
    paymentSelectionSummary,
    'Choose a booking to continue.',
    'Once selected, the amount, timing, and hold countdown update automatically here.'
   );
   setSummaryCardCopy(
    paymentNextStepSummary,
    'Select a pending booking.',
    'Choose the reservation you want to pay for and we will prepare the next step for you.'
   );
   return;
  }

  const deadline = getPendingPaymentDeadline(booking);
  const remaining = getRemainingSeconds(deadline);
  const bookingMethod = formatLabel(booking.payment_method || 'mobile money');
  setSummaryCardCopy(
   paymentSelectionSummary,
   `Slot ${booking.slot_number || '-'}`,
   `${formatDateTime(booking.start_time)} to ${formatDateTime(booking.end_time)} | ${formatCurrency(booking.total_cost || 0)} | ${bookingMethod}`
  );

  if (String(booking.payment_method || '').toLowerCase() === 'cash') {
   setSummaryCardCopy(
    paymentNextStepSummary,
    'Pay the attendant on exit.',
    'This booking is cash-based, so the gate team will complete settlement when you leave the lot.'
   );
   return;
  }

  setSummaryCardCopy(
   paymentNextStepSummary,
   `${formatCountdown(remaining || getPaymentHoldSeconds())} remaining`,
   `Confirm the mobile-money prompt for slot ${booking.slot_number || '-'} before the temporary hold expires.`
  );
 };

 const updateSummary = (booking) => {
  if (!booking) {
   if (paymentSlotEl) paymentSlotEl.textContent = '-';
   if (paymentDurationEl) paymentDurationEl.textContent = '-';
   if (paymentTotalEl) paymentTotalEl.textContent = formatCurrency(0);
   updateSelectionCards(null);
   updateSubmitButton(null);
   return;
  }
  const durationText = `${formatDateTime(booking.start_time)} - ${formatDateTime(booking.end_time)}`;
  if (paymentSlotEl) paymentSlotEl.textContent = booking.slot_number || '-';
  if (paymentDurationEl) paymentDurationEl.textContent = durationText;
  if (paymentTotalEl) paymentTotalEl.textContent = formatCurrency(booking.total_cost || 0);
  updateSelectionCards(booking);
  updateSubmitButton(booking);
 };

 const updateMethodControls = (booking) => {
  const cashRadio = paymentForm?.querySelector('input[value="cash"]');
  const mobileRadio = paymentForm?.querySelector('input[value="mobile_money"]');
  if (!cashRadio || !mobileRadio) return;

  cashRadio.disabled = false;
  mobileRadio.disabled = false;

  if (!booking) {
   if (mobileFields) mobileFields.style.display = mobileRadio.checked ? 'block' : 'none';
   updateSubmitButton(null);
   return;
  }

  const bookingMethod = booking.payment_method || 'mobile_money';
  if (bookingMethod === 'cash') {
   cashRadio.checked = true;
   mobileRadio.checked = false;
   mobileRadio.disabled = true;
   if (mobileFields) mobileFields.style.display = 'none';
  } else {
   mobileRadio.checked = true;
   cashRadio.checked = false;
   if (mobileFields) mobileFields.style.display = 'block';
  }

  updateSubmitButton(booking);
 };

 const updateHoldState = () => {
  if (!paymentHoldNotice || !paymentHoldText || !paymentCountdownEl) return;

  if (!selectedBooking) {
   toggleHidden(paymentHoldNotice, true);
   paymentHoldNotice.classList.remove('is-warning');
   return;
  }

  const bookingMethod = String(selectedBooking.payment_method || '').toLowerCase();
  if (bookingMethod === 'cash') {
   toggleHidden(paymentHoldNotice, true);
   paymentHoldNotice.classList.remove('is-warning');
   return;
  }

  toggleHidden(paymentHoldNotice, false);
  const deadline = getPendingPaymentDeadline(selectedBooking);
  const remainingSeconds = getRemainingSeconds(deadline);

  paymentCountdownEl.textContent = `${formatCountdown(remainingSeconds || 0)} remaining`;
  paymentHoldText.textContent =
   remainingSeconds !== null && remainingSeconds <= 0
    ? 'The temporary hold expired. Refreshing your pending payment queue now.'
    : `Finish payment for slot ${selectedBooking.slot_number || '-'} before the temporary hold expires automatically.`;
  paymentHoldNotice.classList.toggle('is-warning', remainingSeconds !== null && remainingSeconds <= 30);

  if (remainingSeconds !== null && remainingSeconds <= 0 && !paymentExpiryRefreshQueued) {
   paymentExpiryRefreshQueued = true;
   setMessage('paymentMessage', 'This hold expired. Refreshing your payment queue.', true);
   setTimeout(() => {
    paymentExpiryRefreshQueued = false;
    loadBookings();
   }, 1200);
  }
 };

 const bindPaymentCountdown = () => {
  if (paymentCountdownTimer) {
   clearInterval(paymentCountdownTimer);
   paymentCountdownTimer = null;
  }
  updateHoldState();
  if (selectedBooking && String(selectedBooking.payment_method || '').toLowerCase() !== 'cash') {
   paymentCountdownTimer = setInterval(updateHoldState, 1000);
  }
 };

 const updateEmptyState = (isEmpty) => {
  toggleHidden(paymentEmptyState, !isEmpty);
  if (paymentForm) {
   paymentForm.hidden = isEmpty;
  }
  if (isEmpty) {
   clearSuccessState();
   toggleHidden(paymentHoldNotice, true);
  }
 };

 const applySelection = (booking) => {
  selectedBooking = booking || null;
  updateSummary(selectedBooking);
  updateMethodControls(selectedBooking);
  bindPaymentCountdown();
  if (!selectedBooking && paymentMessage) {
   paymentMessage.textContent = '';
  }
 };

 const compareBookings = (a, b) => {
  const aCash = String(a.payment_method || '').toLowerCase() === 'cash';
  const bCash = String(b.payment_method || '').toLowerCase() === 'cash';
  if (aCash !== bCash) {
   return aCash ? 1 : -1;
  }

  const aDeadline = getPendingPaymentDeadline(a)?.getTime() ?? Number.POSITIVE_INFINITY;
  const bDeadline = getPendingPaymentDeadline(b)?.getTime() ?? Number.POSITIVE_INFINITY;
  return aDeadline - bDeadline;
 };

 const loadBookings = async () => {
  try {
   const bookings = await api('/api/driver/bookings');
   bookingCache = bookings
    .filter((booking) => {
     const bookingStatus = (booking.booking_status || '').toLowerCase();
     const paymentStatus = (booking.payment_status || '').toLowerCase();
     if (bookingStatus === 'cancelled' || bookingStatus === 'completed') return false;
     if (paymentStatus === 'paid') return false;
     return true;
    })
    .sort(compareBookings);

   if (!bookingSelect) return;
   bookingSelect.innerHTML = '<option value="">Select booking</option>';

   if (!bookingCache.length) {
    bookingSelect.innerHTML = '<option value="">No pending payments</option>';
    applySelection(null);
    updateEmptyState(true);
    return;
   }

   updateEmptyState(false);

   bookingCache.forEach((booking) => {
    const statusLabel = booking.payment_status ? booking.payment_status : 'pending';
    const option = document.createElement('option');
    option.value = booking.booking_id;
    option.textContent = `#${booking.booking_id} - Slot ${booking.slot_number} (${statusLabel})`;
    bookingSelect.appendChild(option);
   });

   const desired = flashBookingId || presetBookingId || storedBookingId;
   let selected = desired
    ? bookingCache.find((booking) => String(booking.booking_id) === String(desired))
    : null;

   if (!selected && bookingCache.length) {
    selected = bookingCache[0];
   }

   if (selected) {
    bookingSelect.value = String(selected.booking_id);
    applySelection(selected);
   } else {
    applySelection(null);
   }
  } catch (err) {
   setMessage('paymentMessage', err.message, true);
  }
 };

 bookingSelect?.addEventListener('change', () => {
  const selected = bookingCache.find(
   (booking) => String(booking.booking_id) === String(bookingSelect.value)
  );
  applySelection(selected);
 });

 methodRadios.forEach((radio) => {
  radio.addEventListener('change', () => {
   if (selectedBooking?.payment_method === 'cash') {
    updateMethodControls(selectedBooking);
    return;
   }
   const isMobile = radio.value === 'mobile_money' && radio.checked;
   if (mobileFields) {
    mobileFields.style.display = isMobile ? 'block' : 'none';
   }
   updateSubmitButton(selectedBooking);
   updateHoldState();
  });
 });

 paymentForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const bookingId = Number(paymentForm.booking_id.value);
  const paymentMethod = paymentForm.payment_method.value;

  if (!bookingId) {
   setMessage('paymentMessage', 'Select a booking to pay for.', true);
   return;
  }

  if (selectedBooking?.payment_status === 'paid') {
   setMessage('paymentMessage', 'This booking is already paid.', true);
   return;
  }

  clearSuccessState();

  if (selectedBooking?.payment_method === 'cash' || paymentMethod === 'cash') {
   renderSuccessState(
    'Cash payment noted.',
    'Pay the attendant on exit to complete this booking and release the space when you leave.'
   );
   setSummaryCardCopy(
    paymentNextStepSummary,
    'Present this booking at exit.',
    'The gate team will capture the cash settlement when you leave the lot.'
   );
   setMessage('paymentMessage', 'Cash payment noted. Please pay the attendant on exit.');
   return;
  }

  const phone = paymentForm.phone.value.trim();
  if (!phone) {
   setMessage('paymentMessage', 'Enter the phone number used for payment.', true);
   return;
  }

  const payload = {
   booking_id: bookingId,
   provider: paymentForm.provider.value,
   phone,
  };
  try {
   const data = await api('/api/driver/payments/initiate', {
    method: 'POST',
    body: JSON.stringify(payload),
   });
   const txn = data.checkout_request_id || data.transaction_id || 'N/A';
   renderSuccessState(
    'Payment request sent.',
    `An approval prompt was sent to ${phone}. Reference: ${txn}. Keep your phone close and confirm it before the hold expires.`
   );
   setSummaryCardCopy(
    paymentNextStepSummary,
    'Approve the phone prompt.',
    'Keep this page open while you confirm the request on your mobile device.'
   );
   setMessage('paymentMessage', `Payment initiated. Reference: ${txn}`);
   localStorage.removeItem('pending_payment_booking');
   loadBookings();
  } catch (err) {
   setMessage('paymentMessage', err.message, true);
  }
 });

 if (paymentFlash) {
  renderSuccessState(
   paymentFlash.title || 'Booking created. Finish payment now.',
   paymentFlash.body || 'Complete the payment prompt before the temporary hold expires.'
  );
 }

 loadBookings();
}

if (page === 'attendant') {
 const entryForm = document.getElementById('entryForm');
 const exitForm = document.getElementById('exitForm');
 const slotGrid = document.getElementById('attendantSlotGrid');
 const refreshBtn = document.getElementById('loadAttendantSlotsBtn');
 const slotSelect = document.getElementById('entrySlotSelect');
 const autoAssignBtn = document.getElementById('autoAssignSlotBtn');
 const lookupReservationBtn = document.getElementById('lookupReservationBtn');
 const lookupExitBtn = document.getElementById('lookupExitBtn');
 const entryReservationInfo = document.getElementById('entryReservationInfo');
 const exitInfo = document.getElementById('exitInfo');
 const timeLabel = document.getElementById('attendantTime');
 const reservationSummary = document.getElementById('attendantReservationSummary');
 const exitSummary = document.getElementById('attendantExitSummary');
 const entryCard = document.getElementById('entryCard');
 const exitCard = document.getElementById('exitCard');
 const actionStack = document.getElementById('attendantActionStack');
 const attendantOpenTriggers = Array.from(document.querySelectorAll('[data-attendant-open]'));

 let slotsCache = [];

 const syncAttendantActionStack = () => {
  const hasVisibleCard = Boolean(
   (entryCard && !entryCard.hidden) || (exitCard && !exitCard.hidden)
  );
  toggleHidden(actionStack, !hasVisibleCard);
 };

 const openAttendantPanel = (panel, targetId = '') => {
  const showEntry = panel === 'entry';
  const showExit = panel === 'exit';
  toggleHidden(entryCard, !showEntry);
  toggleHidden(exitCard, !showExit);
  syncAttendantActionStack();

  const target =
   (targetId ? document.getElementById(targetId) : null) ||
   (showEntry ? entryCard : exitCard);
  target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
 };

 const bindAttendantOpenTrigger = (trigger) => {
  if (!trigger) return;
  trigger.addEventListener('click', (event) => {
   event.preventDefault();
   const panel = trigger.dataset.attendantOpen;
   const targetId = trigger.dataset.attendantTarget || '';
   if (!panel) return;
   openAttendantPanel(panel, targetId);
  });
 };

 const getSlotCounts = () =>
  slotsCache.reduce(
   (acc, slot) => {
    const status = normalizeStatus(slot.status);
    acc[status] = (acc[status] || 0) + 1;
    return acc;
   },
   { available: 0, booked: 0, occupied: 0, maintenance: 0 }
  );

 const resetReservationSummary = () => {
  const counts = getSlotCounts();
  if (!reservationSummary) return;
  if (counts.booked) {
   setSummaryCardCopy(
    reservationSummary,
    `${counts.booked} reserved arrival(s) waiting in the lot.`,
    `Use Check Reservation to match the driver first. ${counts.available || 0} walk-in slot(s) remain available.`
   );
   return;
  }
  setSummaryCardCopy(
   reservationSummary,
   'No reservation loaded yet.',
   'Use the entry lookup to surface the driver, slot, and schedule before you confirm arrival.'
  );
 };

 const resetExitSummary = () => {
  const counts = getSlotCounts();
  if (!exitSummary) return;
  if (counts.occupied) {
   setSummaryCardCopy(
    exitSummary,
    `${counts.occupied} occupied bay(s) currently active.`,
    'Look up the vehicle at exit to confirm duration, payment status, and release the correct slot.'
   );
   return;
  }
  setSummaryCardCopy(
   exitSummary,
   'No active exit lookup yet.',
   'When you look up a vehicle at exit, the duration, charge, and payment state will appear here.'
  );
 };

 const updateTimeLabel = () => {
  if (!timeLabel) return;
  const now = new Date();
  timeLabel.textContent = `Date: ${formatDateOnly(now)} | Time: ${formatTimeOnly(now)}`;
 };

 const ensureSlotOption = (slotId, label) => {
  if (!slotSelect) return;
  const existing = Array.from(slotSelect.options).find((option) => Number(option.value) === Number(slotId));
  if (existing) {
   existing.textContent = label;
   slotSelect.value = String(slotId);
   return;
  }
  const option = document.createElement('option');
  option.value = slotId;
  option.textContent = label;
  slotSelect.appendChild(option);
  slotSelect.value = String(slotId);
 };

 const populateEntrySlots = () => {
  if (!slotSelect) return;
  const available = slotsCache.filter((slot) => normalizeStatus(slot.status) === 'available');
  slotSelect.innerHTML = '';
  if (!available.length) {
   const option = document.createElement('option');
   option.value = '';
   option.textContent = 'No available slots right now';
   slotSelect.appendChild(option);
   return;
  }
  available.forEach((slot) => {
   const option = document.createElement('option');
   option.value = slot.slot_id;
   option.textContent = `${slot.slot_number} - ${slot.location || 'General'}`;
   slotSelect.appendChild(option);
  });
 };

 const selectEntrySlot = (slot, options = {}) => {
  const { quiet = false } = options;
  if (!slot || !slotSelect) return;
  if (normalizeStatus(slot.status) !== 'available') {
   setMessage('entryMessage', 'Only available slots can be prefilled for a new entry.', true);
   return;
  }
  openAttendantPanel('entry', 'entryCard');
  ensureSlotOption(slot.slot_id, `${slot.slot_number} - ${slot.location || 'General'}`);
  renderSlotGrid(slotGrid, slotsCache, {
   selectedId: Number(slot.slot_id),
   onSelect: (nextSlot) => selectEntrySlot(nextSlot),
  });
  if (!quiet) {
   setMessage('entryMessage', `Slot ${slot.slot_number || slot.slot_id} loaded into the entry form.`);
  }
 };

 const loadSlots = async () => {
  try {
   slotsCache = sortSlotsForDisplay(await api('/api/attendant/slots'));
   renderSlotGrid(slotGrid, slotsCache, {
    selectedId: Number(slotSelect?.value || 0),
    onSelect: (slot) => selectEntrySlot(slot),
   });
   populateEntrySlots();
   resetReservationSummary();
   resetExitSummary();
   updateTimeLabel();
  } catch (err) {
   setMessage('entryMessage', err.message, true);
  }
 };

 const renderReservationLookup = (reservation) => {
  if (entryReservationInfo) {
   entryReservationInfo.innerHTML = `Reservation #${reservation.booking_id} for ${escapeHtml(reservation.driver_name || '-')} | Slot ${escapeHtml(reservation.slot_number || '-')} | ${formatDateTime(reservation.start_time)} - ${formatDateTime(reservation.end_time)}`;
  }
  setSummaryCardCopy(
   reservationSummary,
   `Reservation #${reservation.booking_id} is ready for arrival.`,
   `${reservation.driver_name || reservation.vehicle_number || 'Driver'} | Slot ${reservation.slot_number || '-'} | ${formatDateTime(reservation.start_time)}`
  );
 };

 const renderExitLookup = (entry) => {
  if (exitInfo) {
   exitInfo.innerHTML = `Entry #${entry.entry_id} | Slot ${escapeHtml(entry.slot_number || '-')} | ${entry.duration_hours} hour(s) | Estimated total ${formatCurrency(entry.estimated_total)} | Payment ${formatLabel(entry.payment_status || 'pending')}`;
  }
  setSummaryCardCopy(
   exitSummary,
   `${entry.vehicle_number || 'Vehicle'} is ready for exit.`,
   `Slot ${entry.slot_number || '-'} | ${entry.duration_hours} hour(s) | ${formatCurrency(entry.estimated_total)} | ${formatLabel(entry.payment_status || 'pending')}`
  );
 };

 refreshBtn?.addEventListener('click', loadSlots);

 lookupReservationBtn?.addEventListener('click', async () => {
  const vehicleNumber = entryForm?.vehicle_number?.value?.trim();
  if (!vehicleNumber) {
   setMessage('entryMessage', 'Enter a vehicle registration number first.', true);
   return;
  }
  try {
   openAttendantPanel('entry', 'entryCard');
   const reservation = await api(`/api/attendant/reservations/lookup?vehicle_number=${encodeURIComponent(vehicleNumber)}`);
   if (entryForm?.booking_id) {
    entryForm.booking_id.value = reservation.booking_id || '';
   }
   ensureSlotOption(reservation.slot_id, `${reservation.slot_number} - ${reservation.location || 'Reserved'}`);
   renderReservationLookup(reservation);
   setMessage('entryMessage', 'Reservation loaded. You can now confirm entry.');
  } catch (err) {
   if (entryReservationInfo) entryReservationInfo.textContent = '';
   setSummaryCardCopy(
    reservationSummary,
    'No matching reservation found.',
    'If this driver is a walk-in, use auto-assign after confirming the vehicle number at the gate.'
   );
   setMessage('entryMessage', err.message, true);
  }
 });

 lookupExitBtn?.addEventListener('click', async () => {
  const vehicleNumber = exitForm?.vehicle_number?.value?.trim();
  if (!vehicleNumber) {
   setMessage('exitMessage', 'Enter a vehicle registration number first.', true);
   return;
  }
  try {
   openAttendantPanel('exit', 'exitCard');
   const entry = await api(`/api/attendant/entries/active?vehicle_number=${encodeURIComponent(vehicleNumber)}`);
   renderExitLookup(entry);
   setMessage('exitMessage', 'Active entry found. Review details before processing exit.');
  } catch (err) {
   if (exitInfo) exitInfo.textContent = '';
   setSummaryCardCopy(
    exitSummary,
    'No active entry found for that vehicle.',
    'Double-check the plate number or return to the lot map before you try again.'
   );
   setMessage('exitMessage', err.message, true);
  }
 });

 autoAssignBtn?.addEventListener('click', () => {
  const available = slotsCache.find((slot) => normalizeStatus(slot.status) === 'available');
  if (available) {
   selectEntrySlot(available);
   return;
  }
  setMessage('entryMessage', 'No available slots for auto-assign.', true);
 });

 slotSelect?.addEventListener('change', () => {
  const nextSlot = slotsCache.find((slot) => Number(slot.slot_id) === Number(slotSelect.value));
  if (nextSlot) {
   selectEntrySlot(nextSlot, { quiet: true });
  }
 });

 entryForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const payload = {
   vehicle_number: entryForm.vehicle_number.value.trim(),
   slot_id: Number(entryForm.slot_id.value),
   booking_id: entryForm.booking_id.value ? Number(entryForm.booking_id.value) : undefined,
  };
  try {
   const data = await api('/api/attendant/entry', {
    method: 'POST',
    body: JSON.stringify(payload),
   });
   setMessage('entryMessage', `Entry recorded. Entry ID: ${data.entry_id}`);
   if (entryReservationInfo) entryReservationInfo.textContent = '';
   entryForm.reset();
   await loadSlots();
   setSummaryCardCopy(
    reservationSummary,
    `${payload.vehicle_number} checked in successfully.`,
    `Entry ${data.entry_id} is active. You can move to the next arrival or verify another reservation.`
   );
  } catch (err) {
   setMessage('entryMessage', err.message, true);
  }
 });

 exitForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const payload = {
   vehicle_number: exitForm.vehicle_number.value.trim(),
  };
  try {
   const data = await api('/api/attendant/exit', {
    method: 'POST',
    body: JSON.stringify(payload),
   });
   setMessage('exitMessage', `Exit processed. Total: ${formatCurrency(data.total_cost)}`);
   if (exitInfo) {
    exitInfo.innerHTML = `Exit complete | Slot ${escapeHtml(data.slot_number || '-')} released | Total ${formatCurrency(data.total_cost)}`;
   }
   exitForm.reset();
   await loadSlots();
   setSummaryCardCopy(
    exitSummary,
    `${payload.vehicle_number} exited successfully.`,
    `Collected ${formatCurrency(data.total_cost)} and released Slot ${data.slot_number || '-'}.`
   );
  } catch (err) {
   setMessage('exitMessage', err.message, true);
  }
 });

 attendantOpenTriggers.forEach(bindAttendantOpenTrigger);
 syncAttendantActionStack();
 updateTimeLabel();
 loadSlots();
 setInterval(updateTimeLabel, 60000);
}
if (page === 'reservations') {
 const filterInput = document.getElementById('reservationFilterInput');
 const filterBtn = document.getElementById('filterReservationsBtn');
 const tableBody = document.getElementById('reservationsTableBody');
 const queueSummary = document.getElementById('reservationQueueSummary');

 let reservationCache = [];

 const updateQueueSummary = (items = reservationCache) => {
  if (!queueSummary) return;
  if (!items.length) {
   setSummaryCardCopy(
    queueSummary,
    'No reservations match the current filter.',
    'Clear the filter or wait for new bookings to appear in the arrival queue.'
   );
   return;
  }
  const ordered = [...items].sort((a, b) => new Date(a.start_time) - new Date(b.start_time));
  const next = ordered[0];
  const pendingCount = ordered.filter((reservation) => !['cancelled', 'completed'].includes(normalizeStatus(reservation.status))).length;
  setSummaryCardCopy(
   queueSummary,
   `${ordered.length} reservation(s) in the visible queue.`,
   `Next up: ${next.driver_name || next.vehicle_number || 'Driver'} for Slot ${next.slot_number || '-'} at ${formatDateTime(next.start_time)}. ${pendingCount} still need gate review.`
  );
 };

 const verifyReservation = async (reservationId) => {
  try {
   await api(`/api/attendant/reservations/${reservationId}/verify`, { method: 'POST' });
   setMessage('reservationsMessage', 'Reservation verified.');
   await loadReservations();
  } catch (err) {
   setMessage('reservationsMessage', err.message, true);
  }
 };

 const renderReservations = () => {
  if (!tableBody) return;
  const query = filterInput?.value.trim().toLowerCase() || '';
  tableBody.innerHTML = '';
  const filtered = reservationCache.filter((reservation) => {
   if (!query) return true;
   return [reservation.vehicle_number, reservation.driver_name, reservation.slot_number]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(query));
  });

  updateQueueSummary(filtered);

  if (!filtered.length) {
   tableBody.innerHTML = '<tr><td colspan="5">No reservations match the current search.</td></tr>';
   return;
  }

  filtered.forEach((reservation) => {
   const row = document.createElement('tr');
   row.innerHTML = `
    <td><span class="table-id-pill">#${reservation.booking_id}</span></td>
    <td>${renderTableStack(reservation.driver_name || '-', reservation.vehicle_number || '-', 'Slot ' + (reservation.slot_number || '-'))}</td>
    <td>${renderTableStack(formatDateTime(reservation.start_time), 'Ends ' + formatDateTime(reservation.end_time))}</td>
    <td>${renderBadge(reservation.status)}</td>
    <td>
     <div class="table-action-group">
      ${renderActionButton('Verify', 'success', 'verify', 'Confirm this reservation at the gate')}
     </div>
    </td>
   `;
   row.querySelector('[data-action="verify"]')?.addEventListener('click', async () => {
    await verifyReservation(reservation.booking_id);
   });
   tableBody.appendChild(row);
  });
 };

 const loadReservations = async () => {
  try {
   reservationCache = await api('/api/attendant/reservations');
   renderReservations();
  } catch (err) {
   setSummaryCardCopy(
    queueSummary,
    'Reservation queue unavailable right now.',
    'Refresh the page or check your network connection before verifying the next arrival.'
   );
   setMessage('reservationsMessage', err.message, true);
  }
 };

 filterBtn?.addEventListener('click', renderReservations);
 filterInput?.addEventListener('input', renderReservations);

 loadReservations();
 setInterval(loadReservations, 60000);
}
if (page === 'occupancy') {
 const grid = document.getElementById('occupancyGrid');
 const refreshBtn = document.getElementById('refreshOccupancyBtn');
 const insights = document.getElementById('occupancyInsights');
 const actionSummary = document.getElementById('occupancyActionSummary');

 const updateActionSummary = (counts) => {
  if (!actionSummary) return;
  if (counts.available > 0) {
   setSummaryCardCopy(
    actionSummary,
    `${counts.available} slot(s) are ready for the next arrival.`,
    `Prioritize open bays first, protect ${counts.booked || 0} reserved slot(s), and keep ${counts.maintenance || 0} bay(s) out of rotation.`
   );
   return;
  }
  if (counts.booked > 0) {
   setSummaryCardCopy(
    actionSummary,
    `${counts.booked} reserved slot(s) need careful gate verification.`,
    'The lot is tight right now, so confirm each arrival before reassigning anything manually.'
   );
   return;
  }
  setSummaryCardCopy(
   actionSummary,
   'No open slots are visible right now.',
   'Watch the occupied bays for exits and coordinate with reservations before promising a new space.'
  );
 };

 const loadOccupancy = async () => {
  try {
   const slots = sortSlotsForDisplay(await api('/api/attendant/slots'));
   renderSlotGrid(grid, slots);
   const counts = slots.reduce(
    (acc, slot) => {
     const status = normalizeStatus(slot.status);
     acc[status] = (acc[status] || 0) + 1;
     return acc;
    },
    { available: 0, booked: 0, occupied: 0, maintenance: 0 }
   );
   renderInsightMetrics(insights, [
    { label: 'Available', value: String(counts.available || 0) },
    { label: 'Reserved', value: String(counts.booked || 0) },
    { label: 'Occupied', value: String(counts.occupied || 0) },
    { label: 'Maintenance', value: String(counts.maintenance || 0) },
   ]);
   updateActionSummary(counts);
  } catch (err) {
   setSummaryCardCopy(
    actionSummary,
    'Live occupancy is unavailable right now.',
    'Refresh again in a moment or return to the dashboard once the connection recovers.'
   );
   setMessage('occupancyMessage', err.message, true);
  }
 };

 refreshBtn?.addEventListener('click', loadOccupancy);
 loadOccupancy();
 setInterval(loadOccupancy, 60000);
}
if (page === 'admin-users') {
 const createForm = document.getElementById('createUserForm');
 const updateForm = document.getElementById('updateUserForm');
 const loadUsersBtn = document.getElementById('loadUsersBtn');
 const usersTable = document.getElementById('usersList');
 let selectedUserCode = '';

 const selectUser = (user) => {
  if (!updateForm) return;
  selectedUserCode = getUserCode(user);
  updateForm.user_id.value = selectedUserCode;
  updateForm.user_type.value = user.user_type || '';
  updateForm.status.value = user.status || '';
  updateForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
 };

 const toggleUserStatus = async (user) => {
  const nextStatus = user.status === 'active' ? 'inactive' : 'active';
  try {
   await api(`/api/admin/users/${encodeURIComponent(getUserCode(user))}`, {
    method: 'PATCH',
    body: JSON.stringify({ status: nextStatus }),
   });
   setMessage('usersUpdateMessage', `User set to ${nextStatus}.`);
   refreshSummary?.();
   loadUsers();
  } catch (err) {
   setMessage('usersUpdateMessage', err.message, true);
  }
 };

 const loadUsers = async () => {
  try {
   const users = await api('/api/admin/users');
   if (!usersTable) return;
   usersTable.innerHTML = '';
   if (!users.length) {
   selectedUserCode = '';
    usersTable.innerHTML = '<tr><td colspan="5">No users found.</td></tr>';
    return;
   }
   users.forEach((user) => {
   const userCode = getUserCode(user);
    const row = document.createElement('tr');
   row.className = `table-row-selectable${userCode === selectedUserCode ? ' is-selected' : ''}`;
    row.innerHTML = `
    <td><span class="table-id-pill">${escapeHtml(userCode)}</span></td>
    <td>${renderTableStack(user.name || '-', user.email || '-', `${userCode}${user.phone ? ` | ${user.phone}` : ``}`)}</td>
     <td>${renderBadge(user.user_type, 'role')}</td>
     <td>${renderBadge(user.status)}</td>
     <td>
      <div class="table-action-group">
       ${renderActionButton('Edit', 'primary', 'edit', 'Load user into the update form')}
       ${renderActionButton(user.status === 'active' ? 'Deactivate' : 'Activate', user.status === 'active' ? 'danger' : 'success', 'toggle', 'Quick status change')}
      </div>
     </td>
    `;
   row.addEventListener('click', () => {
    setSelectedTableRow(usersTable, row);
    selectUser(user);
   });
    row.querySelector('[data-action="edit"]')?.addEventListener('click', (event) => {
     event.stopPropagation();
    setSelectedTableRow(usersTable, row);
    selectUser(user);
    });
    row.querySelector('[data-action="toggle"]')?.addEventListener('click', async (event) => {
     event.stopPropagation();
    setSelectedTableRow(usersTable, row);
    selectedUserCode = userCode;
    await toggleUserStatus(user);
    });
    usersTable.appendChild(row);
   });
  } catch (err) {
   setMessage('usersMessage', err.message, true);
  }
 };

 createForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const password = createForm.password.value.trim();
  const passwordError = validatePasswordStrength(password);
  if (passwordError) {
   setMessage('usersCreateMessage', passwordError, true);
   return;
  }
  const payload = {
   name: createForm.name.value.trim(),
   email: createForm.email.value.trim(),
   user_type: createForm.user_type.value,
   password,
  };
  try {
   await api('/api/admin/users', {
    method: 'POST',
    body: JSON.stringify(payload),
   });
   createForm.reset();
   setMessage('usersCreateMessage', 'User created successfully.');
   refreshSummary?.();
   loadUsers();
  } catch (err) {
   setMessage('usersCreateMessage', err.message, true);
  }
 });

 updateForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const payload = {};
  if (updateForm.user_type.value) payload.user_type = updateForm.user_type.value;
  if (updateForm.status.value) payload.status = updateForm.status.value;
  try {
   await api(`/api/admin/users/${encodeURIComponent(updateForm.user_id.value.trim())}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
   });
   setMessage('usersUpdateMessage', 'User updated.');
   refreshSummary?.();
   loadUsers();
  } catch (err) {
   setMessage('usersUpdateMessage', err.message, true);
  }
 });

 loadUsersBtn?.addEventListener('click', loadUsers);
 loadUsers();
}
if (page === 'admin-bookings') {
 const statusFilter = document.getElementById('bookingStatusFilter');
 const slotFilter = document.getElementById('bookingSlotFilter');
 const userFilter = document.getElementById('bookingUserFilter');
 const startFilter = document.getElementById('bookingStartFilter');
 const endFilter = document.getElementById('bookingEndFilter');
 const loadBtn = document.getElementById('loadBookingsBtn');
 const tableBody = document.getElementById('bookingsTableBody');
 const updateForm = document.getElementById('bookingUpdateForm');
 const cancelBtn = document.getElementById('cancelBookingBtn');
 const auditIdInput = document.getElementById('bookingAuditId');
 const auditList = document.getElementById('bookingAuditList');
 const auditBtn = document.getElementById('loadBookingAuditBtn');

 let bookingsCache = [];
 let selectedBookingId = null;

 const toLocalInputValue = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (num) => String(num).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
 };

 const buildQuery = () => {
  const params = new URLSearchParams();
  if (statusFilter?.value) params.set('status', statusFilter.value);
  if (slotFilter?.value) params.set('slot_id', slotFilter.value);
  if (userFilter?.value) params.set('user_id', userFilter.value);
  if (startFilter?.value) params.set('date_from', startFilter.value);
  if (endFilter?.value) params.set('date_to', endFilter.value);
  const query = params.toString();
  return query ? `?${query}` : '';
 };

 const selectBooking = (booking) => {
  if (!updateForm) return;
  selectedBookingId = Number(booking.booking_id) || booking.booking_id;
  updateForm.booking_id.value = booking.booking_id;
  updateForm.status.value = booking.status || '';
  updateForm.slot_id.value = getSlotCode(booking);
  updateForm.user_id.value = getUserCode(booking);
  updateForm.start_time.value = toLocalInputValue(booking.start_time);
  updateForm.end_time.value = toLocalInputValue(booking.end_time);
  updateForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
  if (auditIdInput) {
   auditIdInput.value = booking.booking_id;
  }
 };

 const loadBookingAudit = async (bookingId) => {
  if (!auditList) return;
  const idValue = Number(bookingId || auditIdInput?.value);
  if (!idValue) {
   setMessage('bookingAuditMessage', 'Enter a booking ID first.', true);
   return;
  }
  try {
   const logs = await api(`/api/admin/audit-logs?entity_type=booking&entity_id=${idValue}`);
   auditList.innerHTML = '';
   if (!logs.length) {
    auditList.innerHTML = '<div class="helper">No audit history for this booking.</div>';
    return;
   }
   logs.forEach((log) => {
    const content = document.createElement('div');
    const title = document.createElement('strong');
    title.textContent = `${log.action} - booking #${log.entity_id || '-'}`;
    const details = document.createElement('span');
    details.textContent = ` - Admin ${log.admin_id} - ${formatDateTime(log.created_at)}`;
    content.appendChild(title);
    content.appendChild(details);
    addListItem(auditList, content);
   });
  } catch (err) {
   setMessage('bookingAuditMessage', err.message, true);
  }
 };

 const cancelBooking = async (bookingId, showConfirm = true) => {
  if (!bookingId) {
   setMessage('bookingUpdateMessage', 'Enter a booking ID first.', true);
   return;
  }
  if (showConfirm) {
   const confirmed = confirm('Cancel this booking?');
   if (!confirmed) return;
  }
  try {
   await api(`/api/admin/bookings/${bookingId}`, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'cancelled' }),
   });
   setMessage('bookingUpdateMessage', 'Booking cancelled.');
   loadBookings();
   loadBookingAudit(bookingId);
  } catch (err) {
   setMessage('bookingUpdateMessage', err.message, true);
  }
 };

 const renderTable = () => {
  if (!tableBody) return;
  tableBody.innerHTML = '';
  if (!bookingsCache.length) {
   selectedBookingId = null;
   tableBody.innerHTML = '<tr><td colspan="6">No bookings found.</td></tr>';
   return;
  }

  bookingsCache.forEach((booking) => {
   const paymentStatus = booking.payment_status || 'pending';
   const paymentMethod = booking.payment_method || 'cash';
   const amountLabel = booking.total_cost ? formatCurrency(booking.total_cost) : 'Amount pending';
   const row = document.createElement('tr');
   row.className = `table-row-selectable${Number(booking.booking_id) === Number(selectedBookingId) ? ' is-selected' : ''}`;
   row.innerHTML = `
    <td><span class="table-id-pill">#${booking.booking_id}</span></td>
    <td>${renderTableStack(booking.driver_name || '-', booking.vehicle_number || 'Vehicle not captured', `${getUserCode(booking)} | ${getSlotCode(booking)} | Slot ${booking.slot_number || '-'}`)}</td>
    <td>${renderTableStack(formatDateTime(booking.start_time), 'Ends ' + formatDateTime(booking.end_time))}</td>
    <td>${renderBadge(booking.status)}</td>
    <td>
     <div class="table-badge-row">
      ${renderBadge(paymentStatus, 'payment')}
      ${renderBadge(paymentMethod, 'method')}
     </div>
     <div class="table-cell-meta">${escapeHtml(amountLabel)}</div>
    </td>
    <td>
     <div class="table-action-group">
      ${renderActionButton('Edit', 'primary', 'edit', 'Open this booking in the update form')}
      ${renderActionButton('Audit', 'neutral', 'audit', 'Load the booking audit history')}
      ${renderActionButton('Cancel', 'danger', 'cancel', 'Cancel this booking', ['cancelled', 'completed'].includes((booking.status || '').toLowerCase()))}
     </div>
    </td>
   `;
   row.addEventListener('click', () => {
    setSelectedTableRow(tableBody, row);
    selectBooking(booking);
    loadBookingAudit(booking.booking_id);
   });
   row.querySelector('[data-action="edit"]')?.addEventListener('click', (event) => {
    event.stopPropagation();
    setSelectedTableRow(tableBody, row);
    selectBooking(booking);
   });
   row.querySelector('[data-action="audit"]')?.addEventListener('click', async (event) => {
    event.stopPropagation();
    setSelectedTableRow(tableBody, row);
    selectBooking(booking);
    await loadBookingAudit(booking.booking_id);
   });
   row.querySelector('[data-action="cancel"]')?.addEventListener('click', async (event) => {
    event.stopPropagation();
    setSelectedTableRow(tableBody, row);
    selectedBookingId = Number(booking.booking_id) || booking.booking_id;
    await cancelBooking(booking.booking_id);
   });
   tableBody.appendChild(row);
  });
 };

 const loadBookings = async () => {
  try {
   const query = buildQuery();
   bookingsCache = await api(`/api/admin/bookings${query}`);
   renderTable();
  } catch (err) {
   setMessage('bookingsMessage', err.message, true);
  }
 };

 loadBtn?.addEventListener('click', loadBookings);
 auditBtn?.addEventListener('click', () => loadBookingAudit());

 updateForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const bookingId = updateForm.booking_id.value;
  if (!bookingId) {
   setMessage('bookingUpdateMessage', 'Enter a booking ID first.', true);
   return;
  }

  const payload = {};
  if (updateForm.status.value) payload.status = updateForm.status.value;
  if (updateForm.slot_id.value.trim()) payload.slot_id = updateForm.slot_id.value.trim();
  if (updateForm.user_id.value.trim()) payload.user_id = updateForm.user_id.value.trim();
  if (updateForm.start_time.value) payload.start_time = updateForm.start_time.value;
  if (updateForm.end_time.value) payload.end_time = updateForm.end_time.value;

  if (!Object.keys(payload).length) {
   setMessage('bookingUpdateMessage', 'Select at least one field to update.', true);
   return;
  }

  try {
   await api(`/api/admin/bookings/${bookingId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
   });
   setMessage('bookingUpdateMessage', 'Booking updated.');
   loadBookings();
   loadBookingAudit(bookingId);
  } catch (err) {
   setMessage('bookingUpdateMessage', err.message, true);
  }
 });

 cancelBtn?.addEventListener('click', async () => {
  const bookingId = updateForm?.booking_id?.value;
  await cancelBooking(bookingId);
 });

 loadBookings();
 setInterval(loadBookings, 60000);
}
if (page === 'admin-slots') {
 const slotForm = document.getElementById('slotForm');
 const slotUpdateForm = document.getElementById('slotUpdateForm');
 const slotsGrid = document.getElementById('slotsOverviewGrid');
 const slotsList = document.getElementById('slotsAdminList');
 const filterInput = document.getElementById('slotFilterInput');
 const statusFilter = document.getElementById('slotStatusFilter');
 const slotSelectionSummary = document.getElementById('slotSelectionSummary');

 const actionAdd = document.getElementById('slotActionAdd');
 const actionReserve = document.getElementById('slotActionReserve');
 const actionRelease = document.getElementById('slotActionRelease');
 const actionMaintain = document.getElementById('slotActionMaintain');

 let slotsCache = [];
 let selectedSlot = null;

 const fillSlotUpdateForm = (slot) => {
  if (!slot || !slotUpdateForm) return;
  slotUpdateForm.slot_id.value = getSlotCode(slot);
  slotUpdateForm.slot_number.value = slot.slot_number || '';
  slotUpdateForm.location.value = slot.location || '';
  slotUpdateForm.hourly_rate.value = slot.hourly_rate || '';
  slotUpdateForm.status.value = normalizeStatus(slot.status) || '';
 };

 const describeSlot = (slot) =>
  `${getSlotCode(slot)} | ${slot.location || 'General'} | ${formatCurrency(slot.hourly_rate || 0)}/hr | ${formatLabel(normalizeStatus(slot.status))}`;

 const updateSelectionSummary = (filtered) => {
  if (!slotSelectionSummary) return;
  if (selectedSlot) {
   setSummaryCardCopy(
    slotSelectionSummary,
    `${selectedSlot.slot_number || 'Selected slot'} is ready for editing.`,
    describeSlot(selectedSlot)
   );
   return;
  }
  if (!filtered.length) {
   setSummaryCardCopy(
    slotSelectionSummary,
    'No slots match the current view.',
    'Adjust the search or status filter to bring a slot back into the working list.'
   );
   return;
  }
  setSummaryCardCopy(
   slotSelectionSummary,
   `${filtered.length} slot(s) match the current filters.`,
   'Choose any slot tile or quick-list card to load its details into the update form.'
  );
 };

 const selectSlot = (slot, scrollIntoView = false) => {
  selectedSlot = slot;
  fillSlotUpdateForm(slot);
  renderSlots();
  if (scrollIntoView) {
   slotUpdateForm?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
 };

 const renderSlots = () => {
  const query = filterInput?.value.trim().toLowerCase() || '';
  const status = statusFilter?.value || '';
  const filtered = sortSlotsForDisplay(slotsCache.filter((slot) => {
   const matchesQuery = !query || (slot.slot_number || '').toLowerCase().includes(query) || getSlotCode(slot).toLowerCase().includes(query);
   const matchesStatus = !status || normalizeStatus(slot.status) === status;
   return matchesQuery && matchesStatus;
  }));

  if (selectedSlot?.slot_id) {
   selectedSlot = filtered.find((slot) => Number(slot.slot_id) === Number(selectedSlot.slot_id)) || null;
   if (selectedSlot) {
    fillSlotUpdateForm(selectedSlot);
   }
  }

  renderSlotGrid(slotsGrid, filtered, {
   selectedId: selectedSlot?.slot_id,
   onSelect: (slot) => selectSlot(slot),
  });

  updateSelectionSummary(filtered);

  if (slotsList) {
   slotsList.innerHTML = '';
   if (!filtered.length) {
    const empty = document.createElement('div');
    empty.className = 'slot-admin-item is-empty';
    empty.textContent = 'No slots match the current filters.';
    slotsList.appendChild(empty);
    return;
   }

   filtered.forEach((slot) => {
    const isSelected = Number(selectedSlot?.slot_id) === Number(slot.slot_id);
    const item = document.createElement('button');
    item.type = 'button';
    item.className = `slot-admin-item status-${normalizeStatus(slot.status)}${isSelected ? ' is-selected' : ''}`;
    item.innerHTML = `
     <div class="slot-admin-main">
      <strong>${escapeHtml(slot.slot_number || slot.slot_id || '-')}</strong>
      <span class="slot-admin-meta">${escapeHtml(describeSlot(slot))}</span>
     </div>
     <div class="slot-admin-side">
      ${renderBadge(normalizeStatus(slot.status))}
      ${renderActionButton('Load', 'primary', 'load', 'Load this slot into the update form')}
     </div>
    `;
    item.addEventListener('click', () => selectSlot(slot, true));
    item.querySelector('[data-action="load"]')?.addEventListener('click', (event) => {
     event.stopPropagation();
     selectSlot(slot, true);
    });
    slotsList.appendChild(item);
   });
  }
 };

 const loadSlots = async () => {
  try {
   slotsCache = sortSlotsForDisplay(await api('/api/admin/slots'));
   if (selectedSlot?.slot_id) {
    selectedSlot = slotsCache.find((slot) => Number(slot.slot_id) === Number(selectedSlot.slot_id)) || null;
   }
   renderSlots();
  } catch (err) {
   setSummaryCardCopy(
    slotSelectionSummary,
    'Slot inventory unavailable right now.',
    'Refresh the page or reload the lot map before you apply another slot change.'
   );
   setMessage('slotMessage', err.message, true);
  }
 };

 filterInput?.addEventListener('input', renderSlots);
 statusFilter?.addEventListener('change', renderSlots);
 document.getElementById('loadSlotsAdminBtn')?.addEventListener('click', loadSlots);

 actionAdd?.addEventListener('click', () => {
  selectedSlot = null;
  slotUpdateForm?.reset();
  renderSlots();
  document.getElementById('slotNumber')?.focus();
 });

 const updateStatus = async (status) => {
  if (!selectedSlot?.slot_id) {
   setMessage('slotMessage', 'Select a slot first.', true);
   return;
  }
  try {
   await api(`/api/admin/slots/${encodeURIComponent(getSlotCode(selectedSlot))}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
   });
   setMessage('slotMessage', `Slot marked as ${status}.`);
   refreshSummary?.();
   await loadSlots();
  } catch (err) {
   setMessage('slotMessage', err.message, true);
  }
 };

 actionReserve?.addEventListener('click', () => updateStatus('booked'));
 actionRelease?.addEventListener('click', () => updateStatus('available'));
 actionMaintain?.addEventListener('click', () => updateStatus('maintenance'));

 slotForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const payload = {
   slot_number: slotForm.slot_number.value.trim(),
   location: slotForm.location.value.trim(),
   hourly_rate: Number(slotForm.hourly_rate.value),
  };
  try {
   await api('/api/admin/slots', {
    method: 'POST',
    body: JSON.stringify(payload),
   });
   slotForm.reset();
   setMessage('slotMessage', 'Slot added successfully.');
   refreshSummary?.();
   await loadSlots();
  } catch (err) {
   setMessage('slotMessage', err.message, true);
  }
 });

 slotUpdateForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const payload = {};
  if (slotUpdateForm.slot_number.value.trim()) {
   payload.slot_number = slotUpdateForm.slot_number.value.trim();
  }
  if (slotUpdateForm.location.value.trim()) {
   payload.location = slotUpdateForm.location.value.trim();
  }
  if (slotUpdateForm.hourly_rate.value) {
   payload.hourly_rate = Number(slotUpdateForm.hourly_rate.value);
  }
  if (slotUpdateForm.status.value) {
   payload.status = slotUpdateForm.status.value;
  }
  try {
   await api(`/api/admin/slots/${encodeURIComponent(slotUpdateForm.slot_id.value.trim())}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
   });
   setMessage('slotUpdateMessage', 'Slot updated.');
   refreshSummary?.();
   await loadSlots();
  } catch (err) {
   setMessage('slotUpdateMessage', err.message, true);
  }
 });

 loadSlots();
}

if (page === 'admin-payments') {
 const tableBody = document.getElementById('paymentsTableBody');
 const filterEl = document.getElementById('paymentStatusFilter');

 let paymentsCache = [];
 let selectedPaymentId = null;

 const selectPayment = (payment, row) => {
  selectedPaymentId = Number(payment.payment_id) || payment.payment_id;
  if (tableBody && row) {
   setSelectedTableRow(tableBody, row);
  }
 };

 const updateSummary = () => {
  const today = formatDateOnly(new Date());
  let totalToday = 0;
  let totalCash = 0;
  let totalMobile = 0;
  let totalPending = 0;

  paymentsCache.forEach((payment) => {
   const created = formatDateOnly(payment.created_at);
   if (created === today && payment.status === 'paid') {
    totalToday += Number(payment.amount || 0);
   }
   if (payment.status === 'paid') {
    if (payment.payment_method === 'cash') totalCash += Number(payment.amount || 0);
    if (payment.payment_method === 'mobile_money') totalMobile += Number(payment.amount || 0);
   }
   if (payment.status === 'pending') {
    totalPending += Number(payment.amount || 0);
   }
  });

  const totalTodayEl = document.getElementById('paymentTotalToday');
  const cashEl = document.getElementById('paymentCashTotal');
  const mobileEl = document.getElementById('paymentMobileTotal');
  const pendingEl = document.getElementById('paymentPendingTotal');

  if (totalTodayEl) totalTodayEl.textContent = formatCurrency(totalToday);
  if (cashEl) cashEl.textContent = formatCurrency(totalCash);
  if (mobileEl) mobileEl.textContent = formatCurrency(totalMobile);
  if (pendingEl) pendingEl.textContent = formatCurrency(totalPending);
 };

 const updatePaymentStatus = async (paymentId, status) => {
  try {
   await api(`/api/admin/payments/${paymentId}/status`, {
    method: 'POST',
    body: JSON.stringify({ status }),
   });
   setMessage('paymentsMessage', 'Payment updated.');
   loadPayments();
  } catch (err) {
   setMessage('paymentsMessage', err.message, true);
  }
 };

 const renderTable = () => {
  if (!tableBody) return;
  tableBody.innerHTML = '';
  if (!paymentsCache.length) {
   selectedPaymentId = null;
   tableBody.innerHTML = '<tr><td colspan="8">No payments found.</td></tr>';
   return;
  }

  paymentsCache.forEach((payment) => {
   const row = document.createElement('tr');
   row.className = `table-row-selectable${Number(payment.payment_id) === Number(selectedPaymentId) ? ' is-selected' : ''}`;
   row.innerHTML = `
    <td><span class="table-id-pill">#${payment.payment_id}</span></td>
    <td>${renderTableStack(formatDateTime(payment.created_at), payment.reference || 'System record')}</td>
    <td>${renderTableStack(payment.driver_name || '-', payment.driver_email || '')}</td>
    <td>${renderTableStack('Booking #' + (payment.booking_id || '-'), payment.transaction_id || 'No external transaction')}</td>
    <td><strong>${escapeHtml(formatCurrency(payment.amount || 0))}</strong></td>
    <td>${renderBadge(payment.payment_method, 'method')}</td>
    <td>${renderBadge(payment.status, 'payment')}</td>
    <td>
     <div class="table-action-group">
      ${renderActionButton('Status', 'neutral', 'update', 'Change the payment status')}
      ${renderActionButton('Mark Paid', 'success', 'mark-paid', 'Confirm this payment', String(payment.status).toLowerCase() === 'paid')}
      ${renderActionButton('Refund', 'danger', 'refund', 'Mark this payment as refunded', ['refunded', 'failed'].includes(String(payment.status).toLowerCase()))}
     </div>
    </td>
   `;

   row.addEventListener('click', () => {
    selectPayment(payment, row);
   });

   row.querySelector('[data-action="update"]')?.addEventListener('click', async (event) => {
    event.stopPropagation();
    selectPayment(payment, row);
    const newStatus = prompt('Enter new status (pending, paid, failed, refunded):', payment.status);
    if (!newStatus) return;
    await updatePaymentStatus(payment.payment_id, newStatus);
   });

   row.querySelector('[data-action="mark-paid"]')?.addEventListener('click', async (event) => {
    event.stopPropagation();
    selectPayment(payment, row);
    try {
     await api(`/api/admin/payments/${payment.payment_id}/mark-paid`, {
      method: 'POST',
     });
     setMessage('paymentsMessage', 'Payment marked as paid.');
     loadPayments();
    } catch (err) {
     setMessage('paymentsMessage', err.message, true);
    }
   });

   row.querySelector('[data-action="refund"]')?.addEventListener('click', async (event) => {
    event.stopPropagation();
    selectPayment(payment, row);
    const confirmRefund = confirm('Mark this payment as refunded?');
    if (!confirmRefund) return;
    await updatePaymentStatus(payment.payment_id, 'refunded');
   });

   tableBody.appendChild(row);
  });
 };

 const loadPayments = async () => {
  try {
   const status = filterEl?.value || '';
   const query = status ? `?status=${encodeURIComponent(status)}` : '';
   paymentsCache = await api(`/api/admin/payments${query}`);
   renderTable();
   updateSummary();
  } catch (err) {
   setMessage('paymentsMessage', err.message, true);
  }
 };

 filterEl?.addEventListener('change', loadPayments);
 document.getElementById('loadPaymentsBtn')?.addEventListener('click', loadPayments);

 document.getElementById('exportPaymentsCsvBtn')?.addEventListener('click', () => {
  const rows = paymentsCache.map((payment) => [
   payment.payment_id,
   formatDateTime(payment.created_at),
   payment.driver_name,
   payment.booking_id,
   payment.amount,
   payment.payment_method,
   payment.status,
  ]);
  downloadCsv('payment_log.csv', ['ID', 'Time', 'Driver', 'Booking', 'Amount', 'Type', 'Status'], rows);
 });

 document.getElementById('exportPaymentsPdfBtn')?.addEventListener('click', () => {
  const rows = paymentsCache.map((payment) => [
   payment.payment_id,
   formatDateTime(payment.created_at),
   payment.driver_name,
   payment.booking_id,
   payment.amount,
   payment.payment_method,
   payment.status,
  ]);
  exportPdf('Payment Log', ['ID', 'Time', 'Driver', 'Booking', 'Amount', 'Type', 'Status'], rows);
 });

 document.getElementById('viewRefundsBtn')?.addEventListener('click', () => {
  if (filterEl) {
   filterEl.value = 'refunded';
  }
  loadPayments();
 });

 loadPayments();
}
if (page === 'admin-reports') {
 const reportTypeInputs = document.querySelectorAll('input[name="report_type"]');
 const generateBtn = document.getElementById('generateReportBtn');
 const previewHead = document.getElementById('reportPreviewHead');
 const previewBody = document.getElementById('reportPreviewBody');
 const exportPdfBtn = document.getElementById('exportReportPdfBtn');
 const exportCsvBtn = document.getElementById('exportReportCsvBtn');
 const autoExportCsv = document.getElementById('autoExportCsv');
 const autoExportPdf = document.getElementById('autoExportPdf');
 const reportStart = document.getElementById('reportStart');
 const reportEnd = document.getElementById('reportEnd');
 const scheduleInfo = document.getElementById('reportScheduleInfo');
 const scheduleMessage = document.getElementById('reportScheduleMessage');
 const runExportBtn = document.getElementById('runReportExportBtn');
 const typeSummary = document.getElementById('reportTypeSummary');
 const scheduleSummary = document.getElementById('reportScheduleSummary');
 const lastGenerated = document.getElementById('reportLastGenerated');

 let reportHeaders = [];
 let reportRows = [];
 let reportFileBase = 'report';

 const setSummaryCard = (target, title, subtitle) => {
  if (!target) return;
  const titleEl = target.querySelector('.title');
  const subtitleEl = target.querySelector('.subtitle');
  if (titleEl) titleEl.innerHTML = title;
  if (subtitleEl) subtitleEl.textContent = subtitle;
 };

 const getSelectedReportType = () => {
  const selected = Array.from(reportTypeInputs).find((input) => input.checked);
  return selected?.value || 'occupancy';
 };

 const updateTypeSummary = () => {
  const type = getSelectedReportType();
  const labels = {
   occupancy: ['Occupancy Report', 'Live lot status grouped by slot state.'],
   revenue: ['Revenue Report', 'Daily revenue totals formatted for operations review.'],
   users: ['User Activity Report', 'User records grouped for admin follow-up and export.'],
  };
  const [title, subtitle] = labels[type] || labels.occupancy;
  setSummaryCard(typeSummary, title, subtitle);
 };

 const renderPreview = () => {
  if (!previewHead || !previewBody) return;
  previewHead.innerHTML = reportHeaders.map((header) => `<th>${header}</th>`).join('');
  if (!reportRows.length) {
   previewBody.innerHTML = '<tr><td colspan="6">No rows available for this report.</td></tr>';
   return;
  }
  previewBody.innerHTML = reportRows
   .map((row) => `<tr>${row.map((cell) => `<td>${cell ?? ''}</td>`).join('')}</tr>`)
   .join('');
 };

 const filterRowsByDate = (rows, dateIndex = 0) => {
  if (!reportStart?.value && !reportEnd?.value) return rows;
  const from = reportStart?.value ? new Date(reportStart.value) : null;
  const to = reportEnd?.value ? new Date(reportEnd.value + 'T23:59:59') : null;
  return rows.filter((row) => {
   const value = row[dateIndex];
   const date = new Date(value);
   if (Number.isNaN(date.getTime())) return true;
   if (from && date < from) return false;
   if (to && date > to) return false;
   return true;
  });
 };

 const loadSchedule = async () => {
  if (!scheduleInfo) return;
  try {
   const data = await api('/api/admin/reports/schedule');
   const enabledText = data?.enabled ? 'Enabled' : 'Disabled';
   const nextRun = data?.next_run_at ? formatDateTime(data.next_run_at) : 'Not scheduled';
   const lastRunValue = data?.last_run_at ? formatDateTime(data.last_run_at) : 'Not yet run';
   const types = (data?.types || []).join(', ') || 'N/A';
   scheduleInfo.innerHTML = `
    <div><strong>Status:</strong> ${enabledText}</div>
    <div><strong>Next export:</strong> ${nextRun}</div>
    <div><strong>Last export:</strong> ${lastRunValue}</div>
    <div><strong>Types:</strong> ${types}</div>
   `;
   setSummaryCard(scheduleSummary, enabledText, `Next export: ${nextRun}`);
  } catch (err) {
   setMessage('reportScheduleMessage', err.message, true);
   setSummaryCard(scheduleSummary, 'Schedule unavailable', 'The schedule endpoint could not be loaded.');
  }
 };

 const markGenerated = (type) => {
  const label = formatLabel(type);
  setSummaryCard(lastGenerated, label + ' Ready', 'Generated on ' + formatDateTime(new Date().toISOString()));
 };

 const generateReport = async () => {
  try {
   const reportType = getSelectedReportType();
   if (reportType === 'occupancy') {
    const data = await api('/api/admin/reports/occupancy');
    reportHeaders = ['Status', 'Total Slots'];
    reportRows = data.map((row) => [renderBadge(row.status), row.total]);
   } else if (reportType === 'revenue') {
    const data = await api('/api/admin/reports/revenue');
    reportHeaders = ['Date', 'Total Revenue'];
    reportRows = filterRowsByDate(data.map((row) => [row.day, row.total])).map((row) => [
     formatDateOnly(row[0]),
     formatCurrency(row[1]),
    ]);
   } else {
    const users = await api('/api/admin/users');
    reportHeaders = ['User Code', 'Name', 'Email', 'Role', 'Status'];
    reportRows = users.map((user) => [
     getUserCode(user),
     escapeHtml(user.name),
     escapeHtml(user.email),
     renderBadge(user.user_type, 'role'),
     renderBadge(user.status),
    ]);
   }
   reportFileBase = reportType + '_report';
   renderPreview();
   markGenerated(reportType);
   updateTypeSummary();
   setMessage('reportsMessage', 'Report generated successfully.');
   if (autoExportCsv?.checked) {
    downloadCsv(reportFileBase + '.csv', reportHeaders, reportRows.map((row) => row.map((cell) => String(cell).replace(/<[^>]+>/g, ''))));
   }
   if (autoExportPdf?.checked) {
    exportPdf(formatLabel(reportType) + ' Report', reportHeaders, reportRows.map((row) => row.map((cell) => String(cell).replace(/<[^>]+>/g, ''))));
   }
  } catch (err) {
   setMessage('reportsMessage', err.message, true);
  }
 };

 reportTypeInputs.forEach((input) => input.addEventListener('change', updateTypeSummary));
 generateBtn?.addEventListener('click', generateReport);

 exportCsvBtn?.addEventListener('click', () => {
  if (!reportHeaders.length) return;
  downloadCsv(reportFileBase + '.csv', reportHeaders, reportRows.map((row) => row.map((cell) => String(cell).replace(/<[^>]+>/g, ''))));
 });

 exportPdfBtn?.addEventListener('click', () => {
  if (!reportHeaders.length) return;
  exportPdf('Report', reportHeaders, reportRows.map((row) => row.map((cell) => String(cell).replace(/<[^>]+>/g, ''))));
 });

 runExportBtn?.addEventListener('click', async () => {
  try {
   const result = await api('/api/admin/reports/export', { method: 'POST' });
   const count = result?.files?.length || 0;
   setMessage('reportScheduleMessage', `Export complete. ${count} file(s) saved.`);
   loadSchedule();
  } catch (err) {
   setMessage('reportScheduleMessage', err.message, true);
  }
 });

 updateTypeSummary();
 loadSchedule();
 generateReport();
}
if (page === 'admin-audit') {
 const tableBody = document.getElementById('auditTableBody');
 const filterEl = document.getElementById('auditEntityFilter');
 const loadBtn = document.getElementById('loadAuditBtn');
 const totalCard = document.getElementById('auditStatTotal');
 const bookingCard = document.getElementById('auditStatBookings');
 const paymentCard = document.getElementById('auditStatPayments');

 const setAuditStat = (target, value, subtitle) => {
  if (!target) return;
  const title = target.querySelector('.title');
  const description = target.querySelector('.subtitle');
  if (title) title.textContent = String(value);
  if (description) description.textContent = subtitle;
 };

 const renderAuditTable = (logs) => {
  if (!tableBody) return;
  tableBody.innerHTML = '';
  if (!logs.length) {
   tableBody.innerHTML = '<tr><td colspan="4">No audit logs found.</td></tr>';
   return;
  }
  logs.forEach((log) => {
   const row = document.createElement('tr');
   row.innerHTML = `
    <td>${renderTableStack(log.action || '-', log.details ? JSON.stringify(log.details) : 'No extra details')}</td>
    <td>
     <div class="table-badge-row">
      ${renderBadge(log.entity_type || 'unknown')}
     </div>
     <div class="table-cell-meta">ID ${escapeHtml(log.entity_id || '-')}</div>
    </td>
    <td>${renderTableStack('Admin ' + (log.admin_id || '-'), log.admin_email || '')}</td>
    <td>${renderTableStack(formatDateTime(log.created_at), 'Logged event')}</td>
   `;
   tableBody.appendChild(row);
  });
 };

 const loadAudit = async () => {
  try {
   const entity = filterEl?.value || '';
   const query = entity ? `?entity_type=${encodeURIComponent(entity)}` : '';
   const logs = await api(`/api/admin/audit-logs${query}`);
   renderAuditTable(logs);
   const bookingCount = logs.filter((log) => log.entity_type === 'booking').length;
   const paymentCount = logs.filter((log) => log.entity_type === 'payment').length;
   setAuditStat(totalCard, logs.length, entity ? 'Filtered to ' + formatLabel(entity) : 'Across all entity types.');
   setAuditStat(bookingCard, bookingCount, 'Recent booking-side changes.');
   setAuditStat(paymentCard, paymentCount, 'Refunds, overrides, and payment updates.');
   setMessage('auditMessage', 'Audit logs loaded.');
  } catch (err) {
   setMessage('auditMessage', err.message, true);
  }
 };

 loadBtn?.addEventListener('click', loadAudit);
 filterEl?.addEventListener('change', loadAudit);
 loadAudit();
}
function sanitizeMessage(message) {
 if (!message) return '';
 const text = String(message);
 const lowered = text.toLowerCase();
 if (lowered.includes('request failed')) {
  return 'Unable to complete request.';
 }
 if (lowered.includes('failed to fetch')) {
  return 'Unable to reach the server. Check that the backend is running.';
 }
 return text;
}






















































































