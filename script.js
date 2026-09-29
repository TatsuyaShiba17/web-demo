// QLite prototype. All queue data lives in this browser's localStorage.
(() => {
  const STORAGE_KEY = 'qlite-queues-v1';
  const OFFICES = {
    registrar: { name: 'Registrar', services: ['Transcript request', 'Enrollment verification', 'Document request', 'Other'] },
    cashier: { name: 'Cashier', services: ['Tuition payment', 'Assessment inquiry', 'Refund request', 'Other'] },
    admissions: { name: 'Admissions', services: ['Application inquiry', 'Submit requirements', 'Entrance exam', 'Other'] },
    studentAffairs: { name: 'Student Affairs', services: ['Student ID', 'Scholarship inquiry', 'Student support', 'Other'] }
  };
  const $ = (selector) => document.querySelector(selector);

  function freshOffice() {
    return { next: 1, current: 0, entries: [], skipped: [], recalled: false };
  }

  function loadQueues() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (parsed && typeof parsed === 'object') {
        Object.keys(OFFICES).forEach((key) => {
          if (!parsed[key] || !Array.isArray(parsed[key].entries)) parsed[key] = freshOffice();
          parsed[key].skipped ||= [];
          parsed[key].recalled ||= false;
        });
        return parsed;
      }
    } catch (error) { /* Use a clean queue if storage is unavailable or invalid. */ }
    return Object.fromEntries(Object.keys(OFFICES).map((key) => [key, freshOffice()]));
  }

  let queues = loadQueues();
  let lastTicketNumber = null;
  let lastTicketOffice = null;

  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(queues)); }
    catch (error) { setMessage($('#staff-message'), 'Could not save queue data in this browser.'); }
    renderHomeQueues();
  }

  function setMessage(element, message) {
    if (element) element.textContent = message || '';
  }

  function formatNumber(number) {
    return `#${String(number).padStart(3, '0')}`;
  }

  function officeOptions(select) {
    select.innerHTML = Object.entries(OFFICES).map(([key, office]) => `<option value="${key}">${office.name}</option>`).join('');
  }

  function populateServices() {
    const office = OFFICES[$('#join-office').value];
    $('#join-service').innerHTML = office.services.map((service) => `<option value="${service}">${service}</option>`).join('');
  }

  function currentEntry(queue) {
    return queue.entries.find((entry) => entry.number === queue.current && entry.status === 'serving');
  }

  function waitingEntries(queue) {
    return queue.entries.filter((entry) => entry.status === 'waiting').sort((a, b) => a.number - b.number);
  }

  function peopleAhead(queue, entry) {
    return queue.entries.filter((other) => other.status === 'waiting' && other.number < entry.number).length;
  }

  function estimateMinutes(queue, entry) {
    const ahead = peopleAhead(queue, entry);
    return ahead === 0 ? 'Next' : `~${ahead * 5} min`;
  }

  function queueState(queue, entry) {
    if (entry.status === 'completed') return { label: 'Completed', className: 'completed' };
    if (entry.status === 'cancelled') return { label: 'Left queue', className: 'cancelled' };
    if (entry.status === 'skipped') return { label: 'Skipped', className: 'skipped' };
    if (entry.status === 'serving') return { label: 'Your turn', className: 'turn' };
    if (peopleAhead(queue, entry) <= 2) return { label: 'Almost your turn', className: 'almost' };
    return { label: 'Waiting', className: '' };
  }

  function renderTicket(entry) {
    const queue = queues[entry.office];
    const state = queueState(queue, entry);
    const ahead = peopleAhead(queue, entry);
    const active = entry.status === 'waiting' || entry.status === 'serving';
    $('#ticket-result').hidden = false;
    $('#ticket-result').innerHTML = `<div class="result-header"><h2>Your queue ticket</h2><span class="state-badge ${state.className}">${state.label}</span></div>
      <p class="muted">${OFFICES[entry.office].name} · ${escapeHtml(entry.service)} · ${escapeHtml(entry.name)}</p>
      <div class="result-details"><div class="result-tile"><span>YOUR QUEUE NUMBER</span><strong>${formatNumber(entry.number)}</strong></div><div class="result-tile"><span>NOW SERVING</span><strong>${queue.current ? formatNumber(queue.current) : '—'}</strong></div><div class="result-tile"><span>PEOPLE AHEAD</span><strong>${entry.status === 'serving' ? 0 : ahead}</strong></div><div class="result-tile"><span>ESTIMATED WAIT</span><strong>${entry.status === 'serving' ? 'Now' : (active ? estimateMinutes(queue, entry) : '—')}</strong></div></div>
      ${active ? '<div class="ticket-actions"><button class="text-button" id="leave-queue">Leave queue</button><span class="muted">Keep this number to check again later.</span></div>' : ''}`;
    const leave = $('#leave-queue');
    if (leave) leave.addEventListener('click', () => {
      entry.status = 'cancelled'; save(); renderTicket(entry); renderStaff();
    });
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
  }

  function updateRoute() {
    const route = location.hash.slice(1) || 'home';
    const valid = ['home', 'join', 'status', 'staff'].includes(route) ? route : 'home';
    document.querySelectorAll('.view').forEach((view) => { view.hidden = view.id !== `${valid}-view`; });
    document.querySelectorAll('[data-route]').forEach((link) => {
      if (link.dataset.route === valid) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current');
    });
    if (valid === 'staff') renderStaff();
    if (valid === 'home') renderHomeQueues();
  }

  function isAdminLoggedIn() {
    try { return sessionStorage.getItem('qlite-admin-auth') === 'true'; }
    catch (error) { return false; }
  }

  function renderHomeQueues() {
    // Re-read so this tab can also reflect changes made in another open tab.
    queues = loadQueues();
    const markup = Object.entries(OFFICES).map(([key, office]) => {
      const queue = queues[key];
      const waiting = waitingEntries(queue);
      const serving = currentEntry(queue);
      const preview = waiting.slice(0, 4).map((entry) => `<span class="public-queue-number">${formatNumber(entry.number)}</span>`).join('');
      return `<article class="home-queue-card"><div class="home-queue-card-heading"><h3>${office.name}</h3><span>${waiting.length} waiting</span></div><p class="home-now-serving">Now serving <strong>${serving ? formatNumber(serving.number) : '—'}</strong></p><div class="home-waiting"><span>Waiting numbers</span><div>${preview || '<span class="muted">No one waiting</span>'}${waiting.length > 4 ? `<span class="muted">+${waiting.length - 4} more</span>` : ''}</div></div></article>`;
    }).join('');
    if ($('#home-queue-list').innerHTML !== markup) $('#home-queue-list').innerHTML = markup;
  }

  function renderStaff() {
    const loggedIn = isAdminLoggedIn();
    $('#staff-login-panel').hidden = loggedIn;
    $('#staff-dashboard').hidden = !loggedIn;
    $('#staff-view').setAttribute('aria-labelledby', loggedIn ? 'staff-title' : 'staff-login-title');
    if (!loggedIn) return;
    const officeKey = $('#staff-office').value;
    const queue = queues[officeKey];
    const current = currentEntry(queue);
    const waiting = waitingEntries(queue);
    $('#staff-current').textContent = current ? formatNumber(current.number) : (queue.current ? formatNumber(queue.current) : '—');
    $('#staff-next').textContent = waiting[0] ? formatNumber(waiting[0].number) : 'No one waiting';
    $('#waiting-count').textContent = `${waiting.length} ${waiting.length === 1 ? 'person' : 'people'} in line`;
    $('#waiting-list').innerHTML = waiting.length ? waiting.map((entry) => `<div class="waiting-row"><span class="queue-no">${formatNumber(entry.number)}</span><span><strong>${escapeHtml(entry.name)}</strong><small>${escapeHtml(entry.service)}</small></span><span class="muted">${peopleAhead(queue, entry)} ahead</span></div>`).join('') : '<div class="empty-list">No students waiting right now.</div>';
    $('#call-next').disabled = waiting.length === 0;
    $('#skip-number').disabled = !current;
    $('#recall-number').disabled = !current && queue.skipped.length === 0;
  }

  function findTicket(number, officeKey) {
    return queues[officeKey].entries.find((item) => item.number === number) || null;
  }

  officeOptions($('#join-office'));
  officeOptions($('#staff-office'));
  officeOptions($('#status-office'));
  populateServices();
  $('#join-office').addEventListener('change', populateServices);
  $('#staff-office').addEventListener('change', renderStaff);
  window.addEventListener('hashchange', updateRoute);
  updateRoute();

  $('#staff-login-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const username = $('#admin-username').value.trim();
    const password = $('#admin-password').value;
    if (username === 'admin' && password === 'admin321') {
      try { sessionStorage.setItem('qlite-admin-auth', 'true'); }
      catch (error) { setMessage($('#login-message'), 'Session storage is unavailable. Enable browser storage and try again.'); return; }
      setMessage($('#login-message'), '');
      $('#staff-login-form').reset();
      renderStaff();
      $('#staff-title').focus?.();
      return;
    }
    setMessage($('#login-message'), 'Username or password is incorrect. Try again.');
    $('#admin-password').focus();
  });
  $('#staff-logout').addEventListener('click', () => {
    try { sessionStorage.removeItem('qlite-admin-auth'); } catch (error) { /* Keep the dashboard gated if storage is unavailable. */ }
    renderStaff();
    $('#admin-username').focus();
  });
  renderHomeQueues();
  window.setInterval(() => {
    if ((location.hash.slice(1) || 'home') === 'home') renderHomeQueues();
  }, 3000);

  $('#join-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const office = $('#join-office').value;
    const queue = queues[office];
    const entry = { number: queue.next++, office, name: $('#student-name').value.trim(), service: $('#join-service').value, status: 'waiting', createdAt: Date.now() };
    queue.entries.push(entry);
    lastTicketNumber = entry.number;
    lastTicketOffice = office;
    save();
    renderTicket(entry);
    renderStaff();
    $('#ticket-result').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });

  $('#status-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const number = Number($('#status-number').value);
    const officeKey = $('#status-office').value;
    const entry = findTicket(number, officeKey);
    const result = $('#status-result');
    setMessage($('#status-message'), '');
    if (!entry) {
      result.innerHTML = '';
      setMessage($('#status-message'), `Queue number ${formatNumber(number)} was not found in ${OFFICES[officeKey].name}. Check the office and number.`);
      return;
    }
    const queue = queues[entry.office];
    const state = queueState(queue, entry);
    result.innerHTML = `<div class="status-result-card"><div class="result-header"><h2>${OFFICES[entry.office].name} · ${escapeHtml(entry.service)}</h2><span class="state-badge ${state.className}">${state.label}</span></div><p>Queue number ${formatNumber(entry.number)}</p><div class="status-tiles"><div class="result-tile"><span>NOW SERVING</span><strong>${queue.current ? formatNumber(queue.current) : '—'}</strong></div><div class="result-tile"><span>YOUR NUMBER</span><strong>${formatNumber(entry.number)}</strong></div><div class="result-tile"><span>PEOPLE AHEAD</span><strong>${entry.status === 'serving' ? 0 : (entry.status === 'waiting' ? peopleAhead(queue, entry) : '—')}</strong></div><div class="result-tile"><span>ESTIMATED WAIT</span><strong>${entry.status === 'serving' ? 'Now' : (entry.status === 'waiting' ? estimateMinutes(queue, entry) : '—')}</strong></div></div></div>`;
  });

  $('#staff-office').addEventListener('change', () => setMessage($('#staff-message'), ''));
  $('#call-next').addEventListener('click', () => {
    const queue = queues[$('#staff-office').value];
    const next = waitingEntries(queue)[0];
    if (!next) return;
    const previous = currentEntry(queue);
    if (previous) previous.status = 'completed';
    next.status = 'serving';
    queue.current = next.number;
    queue.recalled = false;
    save(); renderStaff();
    setMessage($('#staff-message'), `${formatNumber(next.number)} is now being served.`);
  });
  $('#skip-number').addEventListener('click', () => {
    const queue = queues[$('#staff-office').value];
    const current = currentEntry(queue);
    if (!current) return;
    current.status = 'skipped';
    queue.skipped.push(current.number);
    queue.current = 0;
    queue.recalled = false;
    save(); renderStaff();
    setMessage($('#staff-message'), `${formatNumber(current.number)} was skipped. Call next to continue.`);
  });
  $('#recall-number').addEventListener('click', () => {
    const queue = queues[$('#staff-office').value];
    const current = currentEntry(queue);
    if (current) {
      queue.recalled = true;
      save();
      setMessage($('#staff-message'), `Recalling ${formatNumber(current.number)}.`);
    } else {
      const skippedNumber = queue.skipped.pop();
      if (!skippedNumber) return;
      const skipped = queue.entries.find((entry) => entry.number === skippedNumber);
      if (skipped) skipped.status = 'waiting';
      queue.recalled = true;
      save(); renderStaff();
      setMessage($('#staff-message'), `${formatNumber(skippedNumber)} returned to the waiting list.`);
    }
  });
  $('#reset-queue').addEventListener('click', () => {
    const officeKey = $('#staff-office').value;
    if (!window.confirm(`Reset the ${OFFICES[officeKey].name} queue? All its queue numbers will be cleared.`)) return;
    queues[officeKey] = freshOffice();
    save(); renderStaff();
    setMessage($('#staff-message'), `${OFFICES[officeKey].name} queue reset. Next number is #001.`);
    if (lastTicketNumber !== null && lastTicketOffice === officeKey) {
      $('#ticket-result').hidden = true;
      lastTicketNumber = null;
      lastTicketOffice = null;
    }
    $('#status-result').innerHTML = '';
  });

  // Refresh visible queue information when this tab regains focus.
  window.addEventListener('storage', (event) => {
    if (event.key === STORAGE_KEY) {
      queues = loadQueues();
      renderStaff();
      renderHomeQueues();
      const shownNumber = Number($('#status-number').value);
      const entry = shownNumber && findTicket(shownNumber, $('#status-office').value);
      if (entry) $('#status-form').requestSubmit();
    }
  });
})();
