// Tiny DOM helpers. Text always goes in as text nodes, so user-typed chunks can't inject HTML.
export function h(tag, props, ...kids) {
  // The props object is optional: h('p', 'text') and h('p', node) work too.
  if (typeof props !== 'object' || props === null || props instanceof Node || Array.isArray(props)) { kids.unshift(props); props = null; }
  const [t, ...cls] = tag.split('.');
  const el = document.createElement(t || 'div');
  if (cls.length) el.className = cls.join(' ');
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.classList.add(...String(v).split(' ').filter(Boolean));
    else if (k === 'style' || k.includes('-') || !(k in el) || typeof el[k] === 'boolean' && typeof v === 'string') el.setAttribute(k, v);
    else el[k] = v;
  }
  for (const k of kids.flat(9)) if (k != null && k !== false) el.append(k instanceof Node ? k : String(k));
  return el;
}

export const mount = (el, ...kids) => { el.replaceChildren(...kids.flat(9).filter(Boolean)); return el; };

export function toast(msg, ms = 2600) {
  const t = h('div.toast', { role: 'status' }, msg);
  document.body.append(t);
  setTimeout(() => t.classList.add('out'), ms);
  setTimeout(() => t.remove(), ms + 400);
}

export function floatXp(n, from) {
  if (!n) return;
  const r = from?.getBoundingClientRect?.() || { left: innerWidth / 2, top: innerHeight / 2, width: 0 };
  const f = h('div.xpfloat', { style: `left:${r.left + r.width / 2}px;top:${r.top}px` }, `+${n} XP`);
  document.body.append(f);
  setTimeout(() => f.remove(), 1100);
}

export function confetti() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const box = h('div.confetti', { 'aria-hidden': 'true' });
  for (let i = 0; i < 40; i++)
    box.append(h('i', { style: `left:${Math.random() * 100}%;--d:${0.8 + Math.random()}s;--r:${Math.random() * 720 - 360}deg;--c:var(--c${i % 4})` }));
  document.body.append(box);
  setTimeout(() => box.remove(), 2200);
}

// Browser text-to-speech; prefers a British voice.
export function speak(text, rate = 1) {
  if (!('speechSynthesis' in window)) return false;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  const voices = speechSynthesis.getVoices();
  u.voice = voices.find(v => v.lang === 'en-GB') || voices.find(v => v.lang.startsWith('en')) || null;
  u.lang = u.voice?.lang || 'en-GB';
  u.rate = rate;
  speechSynthesis.speak(u);
  return true;
}

export const fmtPct = x => `${Math.round(x * 100)}%`;
