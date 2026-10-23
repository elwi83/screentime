import './style.css';
import { supabase, loadSnapshot } from './api';
import { childEmails, deduction, duration, escape as e, stockholmDay, usedSlots } from './domain';
import { Demo } from './demo';
import type { Profile, Rule, ScreenKind, Snapshot } from './types';

const app = document.querySelector<HTMLDivElement>('#app')!;
const notice = document.querySelector<HTMLDivElement>('#notice')!;
const demo = new Demo();
let isDemo = false;
let user: Profile | null = null;
let data: Snapshot = { profiles: [], rules: [], requests: [], entries: [] };
let account = 'maximilian';
let tab = 'tasks';
let selectedChild = '';
let modal: { kind: 'submit' | 'edit' | 'deduct'; id: string } | null = null;
let busy = false;
let stale = false;
let loading = true;
let updated = '';

const paths: Record<string, string> = {
  clock: '<circle cx="12" cy="12" r="8"/><path d="M12 7v5l3 2"/>',
  book: '<path d="M12 6c-3-2-6-2-9-1v14c3-1 6-1 9 1 3-2 6-2 9-1V5c-3-1-6-1-9 1Zm0 0v14"/>',
  pen: '<path d="m15 4 5 5M4 20l5-1L21 7a2 2 0 0 0-5-5L4 14Z"/>',
  math: '<rect x="4" y="3" width="16" height="18" rx="3"/><path d="M8 7h8M8 12h1m6 0h1M8 16h1m6 0h1"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1 1m12 12 1 1M5 19l1-1M18 6l1-1"/>',
  home: '<path d="m3 10 9-7 9 7M5 9v12h14V9M10 21v-7h4v7"/>',
  arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  refresh: '<path d="M20 8a8 8 0 1 0 0 8M20 3v5h-5"/>',
  lock: '<rect x="5" y="10" width="14" height="11" rx="3"/><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 4v3"/>',
  hourglass: '<path d="M6 3h12M6 21h12M8 3v5l8 8v5M16 3v5l-8 8v5"/>',
};
function icon(name: string, cls = ''): string {
  return `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.clock}</svg>`;
}
function taskIcon(index: number): string { return ['book', 'pen', 'math', 'sun', 'home'][index] || 'book'; }
function name(id: string): string { return data.profiles.find(p => p.id === id)?.name || 'Barn'; }
function date(value: string): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}
function toast(message: string, error = false) {
  notice.textContent = message;
  notice.className = error ? 'notice error' : 'notice';
  notice.setAttribute('role', error ? 'alert' : 'status');
  const modalNotice = app.querySelector<HTMLDivElement>('#modal-notice');
  if (modalNotice && error) modalNotice.textContent = message;
}
function errorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message :
    typeof error === 'object' && error !== null && 'message' in error ? String(error.message) : 'Ett oväntat fel inträffade.';
  if (message.includes('Invalid login credentials')) return 'Fel inloggningsuppgifter. Kontrollera din PIN-kod eller e-post och lösenord.';
  if (/fetch|network/i.test(message)) return 'Kunde inte ansluta. Kontrollera internetanslutningen och försök igen.';
  return message;
}

function header() {
  return `<header class="site-header"><a class="brand" href="./" aria-label="Skärmtid, startsida">
    <span class="brand-mark">${icon('hourglass')}</span><span>skärmtid<span class="brand-caption">FAMILJENS LILLA BALANS</span></span></a>
    <div class="header-actions">${isDemo ? '<span class="pill demo-pill">Demoläge</span>' : ''}
    ${user ? `<span class="header-name">${e(user.name)}</span><button class="button ghost small" data-action="logout">${isDemo ? 'Byt konto' : 'Logga ut'}</button>` : '<span class="private-label">' + icon('lock') + ' Bara för familjen</span>'}</div></header>`;
}

function login() {
  const child = account !== 'parent';
  return `<main class="login-layout">
    <section class="intro"><span class="eyebrow"><span class="tiny-sun">✳</span> BALANS I VARDAGEN</span>
      <h1>Lite ansvar.<br>Mer tid för<br><em>det roliga.</em></h1>
      <p>En plats för familjens skärmtid. Gör en uppgift,<br class="desktop"> samla minuter och hitta en bra balans.</p>
      <div class="intro-steps"><span>${icon('book')} Gör något bra</span><span>${icon('check')} Få det godkänt</span><span>${icon('clock')} Samla skärmtid</span></div>
      <div class="little-note"><span class="note-spark">✧</span> Små insatser. Stor skillnad.</div>
    </section>
    <section class="login-card" aria-labelledby="login-heading"><span class="eyebrow">VÄLKOMMEN HEM</span><h2 id="login-heading">Vem är du?</h2><p>Välj ditt konto för att komma igång.</p>
      <div class="account-options">${[['maximilian', 'Maximilian', 'M'], ['walter', 'Walter', 'W'], ['parent', 'Förälder', 'F']].map(([id, label, initial]) =>
        `<button class="account-option ${account === id ? 'selected' : ''}" data-action="account" data-id="${id}" aria-pressed="${account === id}"><span class="avatar ${id}">${initial}</span><span>${label}</span></button>`).join('')}</div>
      ${supabase ? `<form id="login-form">
        ${child ? `<label for="pin">Din PIN-kod</label><input id="pin" name="password" type="password" inputmode="numeric" pattern="[0-9]{6,}" minlength="6" autocomplete="current-password" placeholder="Minst 6 siffror" required>` :
        '<label for="email">E-postadress</label><input id="email" name="email" type="email" autocomplete="username" required><label for="password">Lösenord</label><input id="password" name="password" type="password" autocomplete="current-password" required>'}
        <button class="button primary wide" type="submit">Logga in ${icon('arrow')}</button>
      </form>` : `<div class="setup-note">${icon('lock')}<div><strong>Snart redo för er familj</strong><p>Supabase är inte anslutet än. Utforska en demo under tiden – inga riktiga uppgifter sparas.</p></div></div>`}
      <button class="button ${supabase ? 'ghost' : 'primary'} wide" data-action="demo">Prova som ${child ? e(account === 'maximilian' ? 'Maximilian' : 'Walter') : 'förälder'} ${icon('arrow')}</button>
      <p class="login-footnote">${icon('lock')} ${supabase ? 'Dina uppgifter är bara synliga för familjen.' : 'Demot återställs när sidan laddas om.'}</p>
    </section>
  </main>`;
}

function balanceCard(profile: Profile, parent = false) {
  return `<section class="balance-card ${parent ? 'parent-balance' : ''} ${profile.name === 'Walter' ? 'walter-balance' : ''}">
    <div class="balance-top"><span>${parent ? `<span class="avatar small-avatar ${profile.name.toLowerCase()}">${e(profile.name[0])}</span> ${e(profile.name)}` : icon('clock') + ' DIN SPARADE SKÄRMTID'}</span><span class="pill">${parent ? 'Sparad tid' : 'Ditt saldo'}</span></div>
    <div class="balance-number">${e(profile.balance)} <span>min</span></div>
    <div class="balance-bottom"><span>${profile.balance ? `${e(duration(profile.balance))} att använda när det passar.` : 'Varje liten insats är en bra början.'}</span>${parent ? `<button class="button balance-button" data-action="deduct" data-id="${e(profile.id)}">${icon('clock')} Dra av tid</button>` : '<span class="balance-star" aria-hidden="true">✳</span>'}</div>
  </section>`;
}

function dashboard() {
  if (!user) return '';
  const parent = user.role === 'parent';
  const children = data.profiles.filter(p => p.role === 'child');
  if (!children.some(c => c.id === selectedChild)) selectedChild = children[0]?.id || '';
  const pending = data.requests.filter(r => r.status === 'pending');
  const tabs = parent ? [['overview', 'Översikt'], ['rules', 'Regler'], ['history', 'Historik']] :
    [['tasks', 'Mina uppgifter'], ['requests', `Förfrågningar${pending.length ? ` (${pending.length})` : ''}`], ['history', 'Historik']];
  return `<main class="dashboard">
    ${isDemo ? '<div class="demo-banner"><strong>Du provar en demo.</strong> Inget sparas på servern. Byt konto för att prova både barn- och föräldravyn.</div>' : ''}
    ${stale ? '<div class="error-banner" role="alert">Uppgifterna kunde inte uppdateras. Ändringar är låsta tills du trycker på Uppdatera.</div>' : ''}
    <div class="page-heading"><div><span class="eyebrow">${parent ? 'FAMILJENS ÖVERSIKT' : 'EN LITEN INSATS VARJE DAG'}</span><h1>${parent ? 'Koll på familjens tid.' : `Hej, ${e(user.name)}! <span class="hello-spark">✳</span>`}</h1><p>${parent ? 'Godkänn framsteg, håll koll på saldot och hitta balansen tillsammans.' : 'Vad vill du göra idag? Dina nästa minuter börjar här.'}</p></div>
      <button class="button ghost refresh" data-action="refresh">${icon('refresh')} Uppdatera<span class="updated">${updated ? `kl. ${updated}` : ''}</span></button>
    </div>
    ${parent ? `<div class="parent-balances">${children.map(p => balanceCard(p, true)).join('')}</div>` :
      `<div class="child-summary">${balanceCard(user)}<aside class="balance-note"><span class="eyebrow">BRA ATT VETA</span><h2>Din tid, din balans.</h2><p>Din sparade tid finns kvar till nästa dag. En förälder godkänner dina uppgifter innan minuterna läggs till.</p><div class="youtube-note"><span class="youtube-symbol">▶</span><span><strong>YouTube kostar dubbelt</strong><br>15 min YouTube = 30 min från saldot</span></div></aside></div>`}
    <nav class="tabs" aria-label="Sidor">${tabs.map(([id, title]) => `<button class="${tab === id ? 'active' : ''}" data-action="tab" data-id="${id}" aria-current="${tab === id ? 'page' : 'false'}">${title}${id === 'overview' && pending.length ? `<span class="count">${pending.length}</span>` : ''}</button>`).join('')}</nav>
    ${parent && tab === 'overview' ? requestsView(true) : ''}
    ${!parent && tab === 'requests' ? requestsView(false) : ''}
    ${tab === 'tasks' || tab === 'rules' ? rulesView(parent) : ''}
    ${tab === 'history' ? historyView() : ''}
    <footer class="dashboard-footer">${icon('sun')} Balans handlar om mer än minuter.<span>Dagsgränser följer svensk tid · ${stockholmDay()}</span></footer>
  </main>`;
}

function rulesView(parent: boolean) {
  const id = parent ? selectedChild : user!.id;
  const rules = data.rules.filter(r => r.child_id === id);
  return `<section><div class="section-heading"><div><h2>${parent ? 'Regler & belöningar' : 'Små uppgifter, nya minuter'}</h2><p>${parent ? 'Ändringar gäller nya förfrågningar. Redan inskickade behåller sin belöning.' : 'Gör uppgiften först. Tryck sedan på Klart och be om ett godkännande.'}</p></div>
    ${parent ? `<label class="select-label">Visa regler för<select id="child-filter">${data.profiles.filter(p => p.role === 'child').map(p => `<option value="${e(p.id)}" ${id === p.id ? 'selected' : ''}>${e(p.name)}</option>`).join('')}</select></label>` : '<span class="muted">Börjar om varje dag</span>'}</div>
    <div class="task-grid">${rules.map(rule => {
      const used = usedSlots(data, rule.id);
      const remaining = Math.max(0, rule.daily_limit - used);
      return `<article class="task-card"><div class="task-card-top"><span class="task-icon task-color-${rule.sort_order}">${icon(taskIcon(rule.sort_order))}</span><span class="reward">+${rule.reward} <span>min</span></span></div>
        <h3>${e(rule.title)}</h3><p>${e(rule.description)}</p>
        <div class="task-card-footer"><span class="slot-label">${parent ? `Max ${rule.daily_limit} gånger / dag` : `${used} av ${rule.daily_limit} idag`}</span>
        <button class="button ${parent ? 'secondary' : 'primary'} small" data-action="${parent ? 'edit' : 'submit'}" data-id="${e(rule.id)}" ${!parent && !remaining ? 'disabled' : ''}>${parent ? 'Redigera' : remaining ? `Klart ${icon('check')}` : 'Dagens gräns nådd'}</button></div></article>`;
    }).join('')}</div>
    ${!rules.length ? '<div class="empty-state">Inga regler finns ännu. Be en förälder kontrollera familjeinställningarna.</div>' : ''}
    <div class="info-line">${icon('clock')} Väntande och godkända uppgifter räknas mot dagens gräns. Avslagna uppgifter tar ingen plats.</div></section>`;
}

function requestsView(parent: boolean) {
  const requests = data.requests.filter(r => parent ? r.status === 'pending' : r.child_id === user!.id);
  const statuses = { pending: 'Väntar på godkännande', approved: 'Godkänd', rejected: 'Avslagen' };
  return `<section><div class="section-heading"><div><h2>${parent ? 'Väntar på ditt godkännande' : 'Dina förfrågningar'}</h2><p>${parent ? 'En liten insats som förtjänar lite uppmärksamhet.' : 'Här ser du dina förfrågningar och förälderns beslut.'}</p></div><span class="muted">${requests.length} ${parent ? 'väntande' : 'förfrågningar'}</span></div>
    ${requests.length ? `<div class="request-list">${requests.map(r => `<article class="request-row"><span class="request-symbol">${icon('book')}</span><div class="request-details"><h3>${parent ? `${e(name(r.child_id))} · ` : ''}${e(r.title)}</h3><span class="muted">${e(date(r.created_at))}</span>${r.note ? `<p class="request-note">${e(r.note)}</p>` : ''}</div><span class="reward">+${r.reward} <span>min</span></span>
      ${parent ? `<div class="request-actions"><button class="button secondary small" data-action="reject" data-id="${e(r.id)}">Avslå</button><button class="button primary small" data-action="approve" data-id="${e(r.id)}">${icon('check')} Godkänn</button></div>` :
      `<span class="status ${r.status}">${statuses[r.status]}</span>`}</article>`).join('')}</div>` :
      `<div class="empty-state"><span class="empty-icon">${icon(parent ? 'check' : 'clock')}</span><h3>${parent ? 'Allt är i balans.' : 'Här börjar dina framsteg.'}</h3><p>${parent ? 'Inga uppgifter väntar just nu. Nya förfrågningar dyker upp här.' : 'När du skickar in en uppgift kan du följa den här.'}</p></div>`}</section>`;
}

function historyView() {
  const entries = data.entries;
  return `<section><div class="section-heading"><div><h2>Minuter in & minuter ut</h2><p>De senaste 100 händelserna. Godkända uppgifter och använd skärmtid.</p></div></div>
    ${entries.length ? `<div class="history-list">${entries.map(entry => `<article class="history-row"><span class="history-icon ${entry.amount > 0 ? 'positive' : ''}">${icon(entry.amount > 0 ? 'check' : 'clock')}</span><div><h3>${e(entry.reason)}</h3><span class="muted">${user!.role === 'parent' ? `${e(name(entry.child_id))} · ` : ''}${e(date(entry.created_at))}</span></div><strong class="${entry.amount > 0 ? 'positive-text' : ''}">${entry.amount > 0 ? '+' : '−'}${Math.abs(entry.amount)} min</strong></article>`).join('')}</div>` :
      '<div class="empty-state"><span class="empty-icon">' + icon('clock') + '</span><h3>Ett nytt kapitel.</h3><p>När tid tjänas in eller används syns det här.</p></div>'}</section>`;
}

function modalView() {
  if (!modal) return '';
  const rule = data.rules.find(r => r.id === modal!.id);
  const child = data.profiles.find(p => p.id === modal!.id);
  const heading = modal.kind === 'submit' ? `Klart med ${rule?.title.toLowerCase()}?` :
    modal.kind === 'edit' ? `Redigera ${rule?.title.toLowerCase()}` : `Använd tid · ${child?.name}`;
  return `<dialog aria-labelledby="modal-title"><form id="${modal.kind}-form" class="modal-form"><div class="modal-heading"><span class="eyebrow">${modal.kind === 'submit' ? 'BRA JOBBAT!' : 'FÖRÄLDRAVY'}</span><button type="button" class="close-button" data-action="close" aria-label="Stäng">×</button></div><h2 id="modal-title">${e(heading)}</h2>
    ${modal.kind === 'submit' ? `<p>${e(rule!.description)}</p><div class="modal-reward">+${rule!.reward} minuter efter godkännande</div><label for="note">Vill du berätta något? <span class="muted">(valfritt)</span></label><textarea name="note" id="note" maxlength="500" rows="3" placeholder="Till exempel vilken bok du läste…"></textarea><button class="button primary wide" type="submit">Skicka för godkännande ${icon('arrow')}</button>` : ''}
    ${modal.kind === 'edit' ? `<p>Gäller ${e(name(rule!.child_id))}. Inskickade förfrågningar behåller sin ursprungliga belöning.</p><label for="description">Vad ska göras?</label><textarea id="description" name="description" maxlength="2000" rows="4" required>${e(rule!.description)}</textarea><div class="form-columns"><div><label for="reward">Belöning (minuter)</label><input id="reward" name="reward" type="number" min="1" max="10000" step="1" value="${rule!.reward}" required></div><div><label for="limit">Max gånger per dag</label><input id="limit" name="limit" type="number" min="1" max="100" step="1" value="${rule!.daily_limit}" required></div></div><button class="button primary wide" type="submit">Spara regeln ${icon('check')}</button>` : ''}
    ${modal.kind === 'deduct' ? `<p>Saldo: <strong>${child!.balance} minuter</strong>. Tiden dras av direkt när du bekräftar.</p><label for="kind">Vad har tiden använts till?</label><select id="kind" name="kind"><option value="regular">Vanlig skärmtid · 1 minut per minut</option><option value="youtube">YouTube · 2 minuter per minut</option></select><label for="minutes">Antal minuter som använts</label><input id="minutes" name="minutes" type="number" min="1" max="10000" step="1" placeholder="Till exempel 15" required><output id="cost" class="cost-preview" aria-live="polite">Välj antal minuter för att se avdraget.</output><button class="button primary wide" type="submit">Bekräfta avdrag ${icon('check')}</button>` : ''}
    <div id="modal-notice" class="modal-error" role="alert"></div><button type="button" class="button ghost wide" data-action="close">Avbryt</button></form></dialog>`;
}

function render() {
  app.innerHTML = `${header()}${loading ? '<main class="loading" role="status">Hämtar familjens skärmtid…</main>' : user ? dashboard() : login()}${!user && !loading ? '<footer class="login-footer">Mindre tjat. Mer balans. <span>En liten plats för er familj.</span></footer>' : ''}${modalView()}`;
  if (modal) {
    const dialog = app.querySelector('dialog')!;
    dialog.showModal();
    dialog.addEventListener('cancel', event => { event.preventDefault(); modal = null; render(); });
  }
  if (stale) app.querySelectorAll<HTMLButtonElement>('[data-action="submit"],[data-action="edit"],[data-action="deduct"],[data-action="approve"],[data-action="reject"]').forEach(button => { button.disabled = true; });
}

async function refresh() {
  try {
    if (isDemo) data = demo.data;
    else {
      data = await loadSnapshot();
      const session = await supabase!.auth.getSession();
      if (session.error) throw session.error;
      const current = data.profiles.find(p => p.id === session.data.session?.user.id);
      if (!current) throw new Error('Kontot saknar familjeprofil. Be en förälder köra familjeinställningen i Supabase.');
      user = current;
    }
    stale = false;
    updated = new Intl.DateTimeFormat('sv-SE', { hour: '2-digit', minute: '2-digit' }).format(new Date());
  } catch (error) {
    stale = true;
    throw error;
  }
}

async function run(action: () => Promise<void>, success?: string) {
  if (busy) return;
  busy = true;
  notice.textContent = '';
  const modalNotice = app.querySelector<HTMLDivElement>('#modal-notice');
  if (modalNotice) modalNotice.textContent = '';
  const buttons = [...app.querySelectorAll<HTMLButtonElement>('button')];
  const originalDisabled = buttons.map(button => button.disabled);
  buttons.forEach(button => { button.disabled = true; });
  app.setAttribute('aria-busy', 'true');
  try {
    await action();
    if (success) toast(success);
  } catch (error) {
    console.error(error);
    toast(errorMessage(error), true);
    if (stale) { modal = null; render(); }
  } finally {
    busy = false;
    app.removeAttribute('aria-busy');
    buttons.forEach((button, i) => { button.disabled = originalDisabled[i]; });
  }
}

async function rpc<T>(result: PromiseLike<{ data: T; error: { message: string } | null }>) {
  const response = await result;
  if (response.error) throw response.error;
}

app.addEventListener('click', event => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-action]');
  if (!button || button.disabled || busy) return;
  const { action, id = '' } = button.dataset;
  if (action === 'account') { account = id; render(); }
  else if (action === 'demo') {
    isDemo = true;
    data = demo.data;
    user = data.profiles.find(p => p.id === account)!;
    tab = user.role === 'parent' ? 'overview' : 'tasks';
    stale = false;
    updated = '';
    render();
  } else if (action === 'logout') {
    void run(async () => {
      if (!isDemo && supabase) {
        const { error } = await supabase.auth.signOut();
        if (error) throw error;
      }
      user = null; isDemo = false; modal = null; stale = false; render();
    });
  } else if (action === 'tab') { tab = id; render(); }
  else if (action === 'close') { modal = null; render(); }
  else if (action === 'refresh') {
    void run(async () => { await refresh(); render(); }, 'Saldon och uppgifter är uppdaterade.');
  } else if (action === 'submit' || action === 'edit' || action === 'deduct') {
    modal = { kind: action, id }; render();
  } else if (action === 'approve' || action === 'reject') {
    void run(async () => {
      if (isDemo) demo.review(user!, id, action === 'approve');
      else await rpc(supabase!.rpc('review_task', { p_request_id: id, p_approve: action === 'approve' }));
      await refresh(); render();
    }, action === 'approve' ? 'Uppgiften är godkänd och minuterna tillagda.' : 'Förfrågan är avslagen.');
  }
});

app.addEventListener('submit', event => {
  event.preventDefault();
  const form = event.target as HTMLFormElement;
  if (!form.checkValidity()) { form.reportValidity(); return; }
  const values = new FormData(form);
  const text = (key: string) => String(values.get(key) || '');
  void run(async () => {
    if (form.id === 'login-form') {
      const { error } = await supabase!.auth.signInWithPassword({
        email: account === 'parent' ? text('email').trim() : childEmails[account],
        password: text('password'),
      });
      if (error) throw error;
      isDemo = false;
      await refresh();
      tab = user!.role === 'parent' ? 'overview' : 'tasks';
      render();
      return;
    }
    if (!modal || !user || stale) throw new Error('Uppdatera sidan och försök igen.');
    if (form.id === 'submit-form') {
      if (isDemo) demo.submit(user, modal.id, text('note'));
      else await rpc(supabase!.rpc('submit_task', { p_rule_id: modal.id, p_note: text('note') }));
    } else if (form.id === 'edit-form') {
      const ruleValues: Pick<Rule, 'description' | 'reward' | 'daily_limit'> = {
        description: text('description').trim(), reward: Number(text('reward')), daily_limit: Number(text('limit')),
      };
      if (isDemo) demo.edit(user, modal.id, ruleValues);
      else await rpc(supabase!.rpc('edit_rule', {
        p_rule_id: modal.id, p_description: ruleValues.description,
        p_reward: ruleValues.reward, p_daily_limit: ruleValues.daily_limit,
      }));
    } else if (form.id === 'deduct-form') {
      const kind = text('kind');
      if (kind !== 'regular' && kind !== 'youtube') throw new Error('Välj en giltig skärmtyp.');
      const minutes = Number(text('minutes'));
      deduction(minutes, kind);
      if (isDemo) demo.deduct(user, modal.id, minutes, kind);
      else await rpc(supabase!.rpc('deduct_time', { p_child_id: modal.id, p_minutes: minutes, p_kind: kind }));
    }
    modal = null;
    await refresh(); render();
    toast(form.id === 'submit-form' ? 'Bra jobbat! Din förfrågan är skickad.' : 'Ändringen är sparad.');
  });
});

app.addEventListener('change', event => {
  const target = event.target as HTMLSelectElement;
  if (target.id === 'child-filter') { selectedChild = target.value; render(); }
});
app.addEventListener('input', () => {
  const output = app.querySelector<HTMLOutputElement>('#cost');
  if (!output) return;
  const minutes = Number(app.querySelector<HTMLInputElement>('#minutes')!.value);
  const kind = app.querySelector<HTMLSelectElement>('#kind')!.value as ScreenKind;
  try { output.textContent = `${minutes} min ${kind === 'youtube' ? 'YouTube' : 'skärmtid'} drar ${deduction(minutes, kind)} minuter från saldot.`; }
  catch { output.textContent = 'Ange ett helt antal minuter mellan 1 och 10 000.'; }
});

window.addEventListener('focus', () => {
  if (user && !isDemo && !modal && !busy) void run(async () => { await refresh(); render(); });
});
supabase?.auth.onAuthStateChange(event => {
  if (event === 'SIGNED_OUT' && !isDemo) {
    user = null; modal = null; loading = false; render();
  }
});

async function init() {
  render();
  try {
    if (supabase) {
      const { data: auth, error } = await supabase.auth.getSession();
      if (error) throw error;
      if (auth.session) { await refresh(); tab = user!.role === 'parent' ? 'overview' : 'tasks'; }
    }
  } catch (error) { console.error(error); toast(errorMessage(error), true); }
  finally { loading = false; render(); }
}
void init();
