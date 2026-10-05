(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  let mode = 'login';

  function setMode(m) {
    mode = m;
    document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.mode === m));
    $('confirmRow').classList.toggle('hidden', m !== 'register');
    $('authSubmit').textContent = m === 'login' ? 'Log in' : 'Create account';
    $('password').autocomplete = m === 'login' ? 'current-password' : 'new-password';
    $('authError').textContent = '';
  }

  document.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => setMode(t.dataset.mode)));

  $('authForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = $('username').value.trim().toLowerCase();
    const password = $('password').value;
    const err = $('authError');
    err.textContent = '';

    if (!/^[a-z0-9_]{3,24}$/.test(username)) { err.textContent = 'Username: 3-24 letters, numbers or underscores.'; return; }
    if (password.length < 6) { err.textContent = 'Password must be at least 6 characters.'; return; }
    if (mode === 'register' && password !== $('confirm').value) { err.textContent = 'Passwords do not match.'; return; }

    const btn = $('authSubmit');
    btn.disabled = true;
    try {
      const r = await fetch(mode === 'login' ? '/api/login' : '/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) { err.textContent = data.error || 'Something went wrong. Try again.'; return; }
      location.href = '/';
    } catch {
      err.textContent = 'Cannot reach the server.';
    } finally {
      btn.disabled = false;
    }
  });
})();
