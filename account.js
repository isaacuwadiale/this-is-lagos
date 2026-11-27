import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './supabase-config.js';

const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
window.tilSupabase = supabase; // Shared client for later game features; publishable key only.

const style = document.createElement('style');
style.textContent = `
#tilAccountShade{position:fixed;inset:0;z-index:20000;background:rgba(3,8,18,.72);backdrop-filter:blur(8px);display:none;align-items:center;justify-content:center;padding:16px;font:14px/1.45 "DM Sans",system-ui,sans-serif;color:#f8fafc}
#tilAccountShade.open{display:flex}
#tilAccountBox{width:min(440px,100%);max-height:90vh;overflow:auto;background:#101827;border:1px solid rgba(255,255,255,.15);border-radius:18px;padding:22px;box-shadow:0 24px 80px rgba(0,0,0,.5)}
#tilAccountBox h2{margin:0 40px 8px 0;font-size:23px}
#tilAccountBox p{color:#b8c2d3;margin:8px 0 16px}
#tilAccountBox label{display:block;color:#dbe4f0;font-size:12px;font-weight:700;margin:12px 0 5px}
#tilAccountBox input{box-sizing:border-box;width:100%;border:1px solid #344256;border-radius:10px;background:#0a111d;color:#fff;padding:12px;font:inherit;outline:none}
#tilAccountBox input:focus{border-color:#8799ff}
#tilAccountBox .tilAccButtons{display:flex;gap:8px;flex-wrap:wrap;margin-top:16px}
#tilAccountBox button{border:0;border-radius:10px;padding:11px 14px;font:700 13px "DM Sans",system-ui;cursor:pointer;background:#0916d5;color:white}
#tilAccountBox button.secondary{background:#263449;color:#e5edf8}
#tilAccountBox button.close{float:right;padding:5px 10px;background:transparent;color:#cbd5e1;font-size:24px}
#tilAccountMsg{margin-top:12px;min-height:20px;color:#f5d86a;overflow-wrap:anywhere}
#tilAccountId{padding:10px;border-radius:9px;background:#07101b;border:1px solid #263449;word-break:break-all;font-weight:800;letter-spacing:.06em}
`;
document.head.appendChild(style);

const shade = document.createElement('div');
shade.id = 'tilAccountShade';
shade.innerHTML = `
  <section id="tilAccountBox" role="dialog" aria-modal="true" aria-labelledby="tilAccountTitle">
    <button class="close" id="tilAccountClose" aria-label="Close">×</button>
    <h2 id="tilAccountTitle">This Is Lagos Account</h2>
    <p id="tilAccountIntro">Create an account to save your player profile online.</p>
    <div id="tilAccountContent"></div>
    <div id="tilAccountMsg" role="status" aria-live="polite"></div>
  </section>`;
document.body.appendChild(shade);

const content = shade.querySelector('#tilAccountContent');
const message = shade.querySelector('#tilAccountMsg');
const intro = shade.querySelector('#tilAccountIntro');
const title = shade.querySelector('#tilAccountTitle');
let currentUser = null;
let currentProfile = null;
let mode = 'login';

function setMessage(text, error = false) {
  message.textContent = text || '';
  message.style.color = error ? '#ff9b9b' : '#f5d86a';
}
function show() {
  shade.classList.add('open');
  setMessage('');
  render();
}
function hide() { shade.classList.remove('open'); }
shade.querySelector('#tilAccountClose').addEventListener('click', hide);
shade.addEventListener('click', e => { if (e.target === shade) hide(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') hide(); });

function renderAuth() {
  title.textContent = mode === 'signup' ? 'Create your account' : 'Sign in';
  intro.textContent = mode === 'signup'
    ? 'Register with an email and password. Your Player ID will be created automatically.'
    : 'Sign in to load your saved player profile.';
  content.innerHTML = `
    ${mode === 'signup' ? '<label for="tilAccName">Player name</label><input id="tilAccName" maxlength="24" autocomplete="nickname" placeholder="Your in-game name">' : ''}
    <label for="tilAccEmail">Email address</label><input id="tilAccEmail" type="email" autocomplete="email" placeholder="you@example.com" required>
    <label for="tilAccPassword">Password</label><input id="tilAccPassword" type="password" autocomplete="${mode === 'signup' ? 'new-password' : 'current-password'}" minlength="8" placeholder="At least 8 characters" required>
    <div class="tilAccButtons">
      <button id="tilAccSubmit">${mode === 'signup' ? 'Create account' : 'Sign in'}</button>
      <button class="secondary" id="tilAccSwitch">${mode === 'signup' ? 'I already have an account' : 'Create account'}</button>
    </div>`;
  content.querySelector('#tilAccSubmit').addEventListener('click', submitAuth);
  content.querySelector('#tilAccSwitch').addEventListener('click', () => {
    mode = mode === 'signup' ? 'login' : 'signup';
    setMessage('');
    renderAuth();
  });
}
function renderProfile() {
  title.textContent = 'Your Lagos account';
  intro.textContent = 'Your account and Player ID are saved online.';
  const displayName = currentProfile?.display_name || currentUser?.user_metadata?.display_name || 'New Lagosian';
  content.innerHTML = `
    <label>Player ID</label><div id="tilAccountId">${escapeHtml(currentProfile?.player_id || 'Creating Player ID…')}</div>
    <label for="tilAccDisplayName">Player name</label><input id="tilAccDisplayName" maxlength="24" value="${escapeHtml(displayName)}" autocomplete="nickname">
    <div class="tilAccButtons"><button id="tilAccSave">Save profile</button><button class="secondary" id="tilAccLogout">Sign out</button></div>`;
  content.querySelector('#tilAccSave').addEventListener('click', saveProfile);
  content.querySelector('#tilAccLogout').addEventListener('click', async () => {
    const { error } = await supabase.auth.signOut();
    if (error) return setMessage(error.message, true);
    currentUser = null; currentProfile = null; mode = 'login'; renderAuth();
    setMessage('Signed out.');
    updateGameName('New Lagosian');
  });
}
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function render() {
  if (currentUser) renderProfile();
  else renderAuth();
}
async function submitAuth() {
  setMessage('');
  const email = content.querySelector('#tilAccEmail')?.value.trim();
  const password = content.querySelector('#tilAccPassword')?.value || '';
  const name = content.querySelector('#tilAccName')?.value.trim() || 'New Lagosian';
  if (!email || !password) return setMessage('Enter your email and password.', true);
  if (password.length < 8) return setMessage('Use a password with at least 8 characters.', true);
  const submit = content.querySelector('#tilAccSubmit');
  submit.disabled = true;
  try {
    if (mode === 'signup') {
      const { data, error } = await supabase.auth.signUp({
        email, password, options: { data: { display_name: name } }
      });
      if (error) throw error;
      if (!data.session) {
        setMessage('Account created. Check your email to confirm it, then sign in.');
      } else {
        currentUser = data.user;
        await loadProfile();
        renderProfile();
        setMessage('Account created successfully.');
      }
    } else {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      currentUser = data.user;
      await loadProfile();
      renderProfile();
      setMessage('Welcome back.');
    }
  } catch (e) {
    setMessage(e?.message || 'Could not complete account request.', true);
  } finally {
    if (submit) submit.disabled = false;
  }
}
async function loadProfile() {
  if (!currentUser) return;
  const { data, error } = await supabase.from('profiles')
    .select('player_id, display_name, created_at')
    .eq('user_id', currentUser.id).maybeSingle();
  if (error) throw error;
  currentProfile = data;
  if (data?.display_name) updateGameName(data.display_name);
}
async function saveProfile() {
  setMessage('');
  const name = content.querySelector('#tilAccDisplayName')?.value.trim();
  if (!name) return setMessage('Enter a player name.', true);
  if (name.length > 24) return setMessage('Player name must be 24 characters or fewer.', true);
  const { data, error } = await supabase.from('profiles')
    .update({ display_name: name })
    .eq('user_id', currentUser.id)
    .select('player_id, display_name, created_at')
    .single();
  if (error) return setMessage(error.message, true);
  currentProfile = data;
  updateGameName(name);
  setMessage('Profile saved.');
}
function updateGameName(name) {
  const nameEl = document.querySelector('.player-name');
  if (nameEl) nameEl.textContent = name || 'New Lagosian';
  try {
    const saved = JSON.parse(localStorage.getItem('til-character') || '{}');
    saved.name = name || 'New Lagosian';
    localStorage.setItem('til-character', JSON.stringify(saved));
  } catch (_) {}
}
document.querySelector('#profileBtn')?.addEventListener('click', show);

// Restore signed-in session and profile on page load.
const { data: initialAuth } = await supabase.auth.getSession();
if (initialAuth?.session?.user) {
  currentUser = initialAuth.session.user;
  try { await loadProfile(); } catch (e) { console.warn('TIL profile load:', e.message); }
}
supabase.auth.onAuthStateChange((_event, session) => {
  currentUser = session?.user || null;
  if (!currentUser) currentProfile = null;
});
