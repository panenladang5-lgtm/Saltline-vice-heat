'use strict';
/* Saltline: Vice Heat — DOM layer: HUD, maps, menus, modals, input, touch.
   The sim stays DOM-free; this module translates events and state to pixels. */
const SLU = (() => {
  const HELP_TEXT = `WASD move · mouse drag look · click fire
Shift sprint · Space jump · E interact · F or Enter: enter / exit car
R reload · Q swap weapon · M map · Esc pause

Story: take contracts from Mara at the dispatch office (pink M). Finish all six to close the story. Side money: taxi fares, Dusk Shells, shop robberies, the chop shop, street races and the Coast Run. Wanted: fill the search bar's drain by staying unseen; Mara can cut a search for $50. Nico's garage (orange N) repairs; the clinic sells health, armour and ammo.`;

  function el(tag, cls, parent, html) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html !== undefined) e.innerHTML = html;
    if (parent) parent.appendChild(e);
    return e;
  }
  const fmtClock = (h) => {
    const hh = Math.floor(h), mm = Math.floor((h - hh) * 60);
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  };

  function createUI(hooks) {
    const style = el('style', null, document.head);
    style.textContent = `
      #game-root{position:fixed;inset:0;overflow:hidden;background:#0b1622;font-family:Verdana,Geneva,sans-serif;color:#e8f1f2;user-select:none}
      #game-root canvas.game3d{position:absolute;inset:0;display:block}
      .hud{position:absolute;pointer-events:none;z-index:5}
      #hud-tl{top:12px;left:14px;text-shadow:0 1px 3px #000}
      #hud-cash{font-size:22px;font-weight:bold;color:#ffe9a8}
      #hud-clock{font-size:13px;color:#cfe6ea;margin-top:2px}
      #hud-district{font-size:12px;color:#96e2d3;letter-spacing:1px;margin-top:2px}
      .bar{width:170px;height:9px;background:rgba(6,16,24,.72);border:1px solid rgba(200,230,235,.35);margin-top:5px}
      .bar>i{display:block;height:100%;transition:width .15s}
      #bar-hp>i{background:#e5484d}#bar-armour>i{background:#57a7e8}#bar-stam>i{background:#e8c85a}
      .barlbl{font-size:9px;letter-spacing:1px;color:#bcd6da}
      #hud-wanted{top:10px;left:50%;transform:translateX(-50%);text-align:center}
      #hud-stars{font-size:24px;letter-spacing:3px;color:#ffd94d;text-shadow:0 0 8px rgba(255,180,0,.7)}
      #hud-stars .off{color:rgba(255,255,255,.18);text-shadow:none}
      #search-wrap{width:190px;height:7px;background:rgba(6,16,24,.72);border:1px solid rgba(200,230,235,.35);margin:3px auto 0}
      #search-fill{height:100%;background:#ff5d47;width:100%}
      #hud-heli{font-size:11px;color:#ffd9c9;margin-top:3px;letter-spacing:1px}
      #hud-tr{top:12px;right:14px;text-align:right}
      #minimap{border:2px solid rgba(220,240,245,.5);background:#12242f;display:block}
      #hud-objective{margin-top:8px;max-width:230px;background:rgba(6,16,24,.66);border-left:3px solid #f2b23e;padding:7px 9px;font-size:12px;line-height:1.45;text-align:left}
      #hud-objective b{color:#ffd94d}
      #hud-vehicle{right:14px;bottom:14px;background:rgba(6,16,24,.66);padding:8px 11px;font-size:12px;min-width:170px}
      #hud-weapon{right:14px;bottom:120px;text-align:right;font-size:13px;text-shadow:0 1px 3px #000}
      #hud-ammo{font-size:20px;color:#ffe9a8;font-weight:bold}
      #toasts{left:14px;bottom:14px;max-width:360px}
      .toast{background:rgba(6,16,24,.78);border-left:3px solid #57c7b8;padding:6px 10px;margin-top:6px;font-size:12.5px;line-height:1.4;animation:tin .25s ease-out}
      @keyframes tin{from{opacity:0;transform:translateX(-8px)}to{opacity:1}}
      #hud-context{left:50%;bottom:86px;transform:translateX(-50%);text-align:center;font-size:14px;text-shadow:0 1px 4px #000}
      #hud-context .key{display:inline-block;border:1px solid #cfe6ea;border-bottom-width:3px;border-radius:4px;padding:0 7px;margin-right:7px;background:rgba(10,24,34,.8);font-weight:bold}
      #hud-channel{left:50%;bottom:118px;transform:translateX(-50%);width:240px;height:10px;background:rgba(6,16,24,.75);border:1px solid rgba(200,230,235,.4);display:none}
      #hud-channel>i{display:block;height:100%;background:#f2b23e;width:0}
      #hud-brief{top:64px;left:50%;transform:translateX(-50%);background:rgba(6,16,24,.8);border:1px solid rgba(242,178,62,.6);padding:8px 14px;font-size:13px;display:none;max-width:520px;text-align:center}
      .modal{position:absolute;inset:0;display:none;align-items:center;justify-content:center;background:rgba(4,10,16,.72);z-index:20;pointer-events:auto}
      .modal.open{display:flex}
      .card{background:#10222f;border:1px solid #2d4a5c;max-width:560px;width:92%;max-height:86vh;overflow:auto;padding:22px 26px;box-shadow:0 18px 50px rgba(0,0,0,.6)}
      .card h1{font-family:Georgia,serif;font-size:34px;margin:0 0 2px;color:#f4dcb9;letter-spacing:1px}
      .card h2{font-family:Georgia,serif;font-size:21px;margin:0 0 10px;color:#f4dcb9}
      .card h3{font-size:12px;letter-spacing:2px;color:#96e2d3;margin:16px 0 6px}
      .card p{font-size:13.5px;line-height:1.55;color:#d7e6ea}
      .card .sub{color:#9fc3cc;font-size:13px;margin-bottom:14px}
      .btn{display:block;width:100%;text-align:left;background:#17303f;color:#e8f1f2;border:1px solid #2d4a5c;padding:11px 14px;margin-top:9px;font-size:14px;cursor:pointer;font-family:inherit}
      .btn:hover:not(:disabled){background:#1f4257;border-color:#57c7b8}
      .btn:disabled{opacity:.42;cursor:default}
      .btn .price{float:right;color:#ffe9a8}
      .dlg-who{font-size:11px;letter-spacing:2px;color:#f2b23e;margin-bottom:5px}
      .dlg-text{font-size:16.5px;line-height:1.6;min-height:56px}
      #chapter-card{position:absolute;inset:0;display:none;align-items:center;justify-content:center;z-index:15;pointer-events:none}
      #chapter-card .inner{text-align:center;text-shadow:0 2px 14px #000}
      #chapter-card h2{font-family:Georgia,serif;font-size:40px;color:#f4dcb9;letter-spacing:3px;margin:0}
      #chapter-card p{color:#cfe6ea;font-size:15px;font-style:italic}
      #complete-banner{position:absolute;top:16%;left:50%;transform:translateX(-50%);display:none;z-index:15;text-align:center;pointer-events:none}
      #complete-banner h2{font-family:Georgia,serif;font-size:34px;color:#ffd94d;letter-spacing:2px;text-shadow:0 2px 14px #000;margin:0}
      #flash{position:absolute;inset:0;background:radial-gradient(ellipse at center,transparent 55%,rgba(200,20,20,.55) 100%);opacity:0;pointer-events:none;z-index:8}
      #bigmap-card{text-align:center}
      #bigmap{display:block;margin:0 auto;border:2px solid rgba(220,240,245,.4)}
      .standrow{display:flex;justify-content:space-between;font-size:12.5px;padding:3px 0;border-bottom:1px solid rgba(120,160,175,.18)}
      #touch{position:absolute;inset:0;z-index:6;pointer-events:none;display:none}
      #touch.on{display:block}
      .tbtn{position:absolute;pointer-events:auto;width:62px;height:62px;border-radius:50%;background:rgba(16,34,47,.55);border:1px solid rgba(200,230,235,.5);color:#e8f1f2;font-size:12px;font-weight:bold;display:flex;align-items:center;justify-content:center}
      #stick{position:absolute;left:26px;bottom:90px;width:110px;height:110px;border-radius:50%;background:rgba(16,34,47,.4);border:1px solid rgba(200,230,235,.4);pointer-events:auto}
      #stick-knob{position:absolute;left:35px;top:35px;width:40px;height:40px;border-radius:50%;background:rgba(220,240,245,.5)}
      input[type=range]{width:180px}
      .stat-grid{display:grid;grid-template-columns:1fr 1fr;gap:4px 18px;font-size:13px}
      pre.help{white-space:pre-wrap;font-size:12.5px;line-height:1.55;color:#d7e6ea;font-family:inherit}
    `;

    const root = el('div', null, document.body); root.id = 'game-root';
    const hudTL = el('div', 'hud', root); hudTL.id = 'hud-tl';
    const cashEl = el('div', null, hudTL); cashEl.id = 'hud-cash';
    const clockEl = el('div', null, hudTL); clockEl.id = 'hud-clock';
    const districtEl = el('div', null, hudTL); districtEl.id = 'hud-district';
    const mkBar = (id, lbl) => {
      const l = el('div', 'barlbl', hudTL, lbl);
      const b = el('div', 'bar', hudTL); b.id = id;
      const i = el('i', null, b);
      return i;
    };
    const hpFill = mkBar('bar-hp', 'HEALTH');
    const armourFill = mkBar('bar-armour', 'ARMOUR');
    const stamFill = mkBar('bar-stam', 'STAMINA');
    const wantedBox = el('div', 'hud', root); wantedBox.id = 'hud-wanted';
    const starsEl = el('div', null, wantedBox); starsEl.id = 'hud-stars';
    const searchWrap = el('div', null, wantedBox); searchWrap.id = 'search-wrap';
    const searchFill = el('div', null, searchWrap); searchFill.id = 'search-fill';
    const heliEl = el('div', null, wantedBox); heliEl.id = 'hud-heli';
    const hudTR = el('div', 'hud', root); hudTR.id = 'hud-tr';
    const minimap = el('canvas', null, hudTR); minimap.id = 'minimap'; minimap.width = 168; minimap.height = 168;
    const objectiveEl = el('div', null, hudTR); objectiveEl.id = 'hud-objective';
    const weaponEl = el('div', 'hud', root); weaponEl.id = 'hud-weapon';
    const vehicleEl = el('div', 'hud', root); vehicleEl.id = 'hud-vehicle'; vehicleEl.style.display = 'none';
    const toastsEl = el('div', 'hud', root); toastsEl.id = 'toasts';
    const contextEl = el('div', 'hud', root); contextEl.id = 'hud-context';
    const channelEl = el('div', 'hud', root); channelEl.id = 'hud-channel';
    const channelFill = el('i', null, channelEl);
    const briefEl = el('div', 'hud', root); briefEl.id = 'hud-brief';
    const flashEl = el('div', null, root); flashEl.id = 'flash';
    const chapterEl = el('div', null, root); chapterEl.id = 'chapter-card';
    const chapterInner = el('div', 'inner', chapterEl);
    const completeEl = el('div', null, root); completeEl.id = 'complete-banner';

    // ---------- modals ----------
    function makeModal(id) {
      const m = el('div', 'modal', root); m.id = id;
      const card = el('div', 'card', m);
      return { m, card };
    }
    const title = makeModal('m-title');
    const dialogue = makeModal('m-dialogue');
    const shop = makeModal('m-shop');
    const pause = makeModal('m-pause');
    const death = makeModal('m-death');
    const bigmap = makeModal('m-bigmap'); bigmap.card.id = 'bigmap-card';

    const ui = {
      root, input: null, edges: {},
      modalOpen: false, titleOpen: true, paused: false, mapOpen: false,
      fps: 0, camYaw: Math.PI, camDist: 13,
      _toastQ: [],
    };
    function refreshModalFlag() {
      ui.modalOpen = title.m.classList.contains('open') || dialogue.m.classList.contains('open') ||
        shop.m.classList.contains('open') || pause.m.classList.contains('open') ||
        death.m.classList.contains('open') || bigmap.m.classList.contains('open');
      ui.paused = pause.m.classList.contains('open');
      ui.mapOpen = bigmap.m.classList.contains('open');
      ui.titleOpen = title.m.classList.contains('open');
    }
    function openM(x) { x.m.classList.add('open'); refreshModalFlag(); }
    function closeM(x) { x.m.classList.remove('open'); refreshModalFlag(); }

    // ---------- input ----------
    const keys = {};
    const edges = { enter: false, interact: false, reload: false, weapon: false, jump: false, pause: false, map: false };
    const input = {
      moveX: 0, moveZ: 0, sprint: false, fire: false, handbrake: false,
      interactHeld: false, touchMove: null,
    };
    ui.input = input; ui.edges = edges;
    ui.pollEdges = () => { const e = { ...edges }; for (const k in edges) edges[k] = false; return e; };
    const KEYMAP = {
      KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down',
      KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right',
    };
    window.addEventListener('keydown', (ev) => {
      if (ev.repeat) return;
      keys[ev.code] = true;
      if (ev.code === 'KeyF' || ev.code === 'Enter') edges.enter = true;
      if (ev.code === 'KeyE') { edges.interact = true; input.interactHeld = true; }
      if (ev.code === 'KeyR') edges.reload = true;
      if (ev.code === 'KeyQ' || ev.code === 'Tab') { edges.weapon = true; if (ev.code === 'Tab') ev.preventDefault(); }
      if (ev.code === 'Space') { edges.jump = true; ev.preventDefault(); }
      if (ev.code === 'Escape' || ev.code === 'KeyP') edges.pause = true;
      if (ev.code === 'KeyM') edges.map = true;
    });
    window.addEventListener('keyup', (ev) => {
      keys[ev.code] = false;
      if (ev.code === 'KeyE') input.interactHeld = false;
    });
    function readKeys() {
      let mx = 0, mz = 0;
      if (keys.KeyW || keys.ArrowUp) mz += 1;
      if (keys.KeyS || keys.ArrowDown) mz -= 1;
      if (keys.KeyA || keys.ArrowLeft) mx -= 1;
      if (keys.KeyD || keys.ArrowRight) mx += 1;
      if (input.touchMove) { mx = input.touchMove.x; mz = input.touchMove.z; }
      input.moveX = mx; input.moveZ = mz;
      input.sprint = !!(keys.ShiftLeft || keys.ShiftRight);
      input.handbrake = !!keys.Space;
    }
    // mouse: drag rotates camera, press fires
    let dragging = false, lastMX = 0;
    function bindMouse(canvas) {
      canvas.addEventListener('mousedown', (ev) => {
        hooks.audioKick && hooks.audioKick();
        if (ui.modalOpen) return;
        dragging = true; lastMX = ev.clientX;
        if (ev.button === 0) input.fire = true;
      });
      window.addEventListener('mousemove', (ev) => {
        if (!dragging || ui.modalOpen) return;
        const dx = ev.clientX - lastMX; lastMX = ev.clientX;
        ui.camYaw -= dx * 0.0052;
      });
      window.addEventListener('mouseup', () => { dragging = false; input.fire = false; });
      canvas.addEventListener('wheel', (ev) => {
        ui.camDist = Math.min(22, Math.max(8, ui.camDist + Math.sign(ev.deltaY) * 1.6));
      }, { passive: true });
    }
    ui.bindMouse = bindMouse;

    // ---------- touch ----------
    const touchBox = el('div', null, root); touchBox.id = 'touch';
    if ('ontouchstart' in window) {
      touchBox.classList.add('on');
      const stick = el('div', null, touchBox); stick.id = 'stick';
      const knob = el('div', null, stick); knob.id = 'stick-knob';
      let stickId = null;
      stick.addEventListener('touchstart', (e) => { stickId = e.changedTouches[0].identifier; }, { passive: true });
      window.addEventListener('touchmove', (e) => {
        for (const t of e.changedTouches) {
          if (t.identifier !== stickId) continue;
          const r = stick.getBoundingClientRect();
          let dx = (t.clientX - (r.left + 55)) / 42, dy = (t.clientY - (r.top + 55)) / 42;
          const l = Math.hypot(dx, dy); if (l > 1) { dx /= l; dy /= l; }
          knob.style.left = `${35 + dx * 30}px`; knob.style.top = `${35 + dy * 30}px`;
          input.touchMove = { x: dx, z: -dy };
        }
      }, { passive: true });
      window.addEventListener('touchend', (e) => {
        for (const t of e.changedTouches) if (t.identifier === stickId) {
          stickId = null; input.touchMove = null;
          knob.style.left = '35px'; knob.style.top = '35px';
        }
      });
      const mkBtn = (label, right, bottom, on, off) => {
        const b = el('div', 'tbtn', touchBox, label);
        b.style.right = right + 'px'; b.style.bottom = bottom + 'px';
        b.addEventListener('touchstart', (e) => { e.preventDefault(); hooks.audioKick && hooks.audioKick(); on(); }, { passive: false });
        if (off) b.addEventListener('touchend', off);
        return b;
      };
      mkBtn('FIRE', 26, 96, () => { input.fire = true; }, () => { input.fire = false; });
      mkBtn('E', 104, 60, () => { edges.interact = true; input.interactHeld = true; }, () => { input.interactHeld = false; });
      mkBtn('CAR', 26, 176, () => { edges.enter = true; });
      mkBtn('JUMP', 104, 140, () => { edges.jump = true; });
    }

    // ---------- toasts / brief / chapter ----------
    ui.toast = (txt) => {
      const t = el('div', 'toast', toastsEl, txt);
      setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .5s'; }, 4600);
      setTimeout(() => t.remove(), 5200);
      while (toastsEl.children.length > 5) toastsEl.firstChild.remove();
    };
    let briefTimer = null;
    ui.showBrief = (txt) => {
      briefEl.textContent = txt; briefEl.style.display = 'block';
      clearTimeout(briefTimer);
      briefTimer = setTimeout(() => { briefEl.style.display = 'none'; }, 9000);
    };
    ui.showChapter = (D, idx) => {
      const ch = D.CHAPTERS[idx];
      chapterInner.innerHTML = `<h2>${ch.name}</h2><p>${ch.closing}</p>`;
      chapterEl.style.display = 'flex';
      setTimeout(() => { chapterEl.style.display = 'none'; }, 3600);
    };
    ui.showComplete = () => {
      completeEl.innerHTML = `<h2>VICE HEAT COMPLETE</h2>`;
      completeEl.style.display = 'block';
      setTimeout(() => { completeEl.style.display = 'none'; }, 5000);
    };
    ui.flash = () => { flashEl.style.opacity = '1'; setTimeout(() => { flashEl.style.opacity = '0'; flashEl.style.transition = 'opacity .5s'; }, 60); };

    // ---------- dialogue ----------
    let dlgQueue = [], dlgDone = null;
    ui.showDialogue = (lines, titleText, onDone) => {
      dlgQueue = lines.slice(); dlgDone = onDone || null;
      dialogue.card.innerHTML = '';
      el('h2', null, dialogue.card, titleText || '—');
      const who = el('div', 'dlg-who', dialogue.card);
      const text = el('div', 'dlg-text', dialogue.card);
      const btn = el('button', 'btn', dialogue.card, 'NEXT');
      const render = () => {
        const cur = dlgQueue[0];
        who.textContent = cur.who.toUpperCase();
        text.textContent = cur.text;
        btn.textContent = dlgQueue.length > 1 ? 'NEXT' : 'BACK TO THE CITY';
      };
      btn.addEventListener('click', () => {
        hooks.sfx && hooks.sfx('ui');
        dlgQueue.shift();
        if (!dlgQueue.length) { closeM(dialogue); if (dlgDone) dlgDone(); }
        else render();
      });
      render();
      openM(dialogue);
    };

    // ---------- title ----------
    ui.showTitle = (hasSave) => {
      title.card.innerHTML = '';
      el('h1', null, title.card, 'SALTLINE');
      el('div', 'sub', title.card, 'VICE HEAT — a small-hours crime story on the Saltline coast.');
      const bNew = el('button', 'btn', title.card, hasSave ? 'NEW GAME (erases the current save)' : 'NEW GAME');
      bNew.addEventListener('click', () => { closeM(title); hooks.onNewGame && hooks.onNewGame(); });
      if (hasSave) {
        const bCont = el('button', 'btn', title.card, 'CONTINUE');
        bCont.addEventListener('click', () => { closeM(title); hooks.onContinue && hooks.onContinue(); });
      }
      el('h3', null, title.card, 'HOW TO PLAY');
      const help = el('pre', 'help', title.card, HELP_TEXT);
      el('p', null, title.card, 'Three.js r160 · fully offline · your progress saves in this browser.');
      openM(title);
    };
    ui.closeTitle = () => closeM(title);

    // ---------- pause ----------
    ui.openPause = (S, D) => {
      pause.card.innerHTML = '';
      el('h2', null, pause.card, 'PAUSED');
      const st = S.stats;
      const grid = el('div', 'stat-grid', pause.card);
      const rows = [
        ['Cash', `$${S.player.money}`], ['Day / time', `Day ${S.day} · ${fmtClock(S.hours)}`],
        ['Contracts done', `${S.story.done} / 6`], ['Shells', `${S.shellsGot.size} / 20`],
        ['Distance', `${(st.distance / 1000).toFixed(2)} km`], ['Earned', `$${st.earned}`],
        ['Shots fired', `${st.shots}`], ['Crashes', `${st.crashes}`],
        ['Races won', `${st.races}`], ['FPS', `${ui.fps}`],
      ];
      for (const [k, v] of rows) { el('div', null, grid, k); const vv = el('div', null, grid, v); vv.style.textAlign = 'right'; }
      const bResume = el('button', 'btn', pause.card, 'RESUME');
      bResume.addEventListener('click', () => closeM(pause));
      const bSave = el('button', 'btn', pause.card, 'SAVE GAME');
      const saveNote = el('p', null, pause.card, '');
      bSave.addEventListener('click', () => {
        const ok = hooks.onSave && hooks.onSave();
        saveNote.textContent = ok ? 'Saved.' : 'STORAGE UNAVAILABLE — this browser context refused the write; progress is kept for this session only.';
      });
      const bWeapon = el('button', 'btn', pause.card, `SWAP WEAPON (now: ${S.player.weapon === 'sidearm' ? 'Sidearm' : 'Baton'})`);
      bWeapon.addEventListener('click', () => { S.player.weapon = S.player.weapon === 'sidearm' ? 'baton' : 'sidearm'; bWeapon.textContent = `SWAP WEAPON (now: ${S.player.weapon === 'sidearm' ? 'Sidearm' : 'Baton'})`; });
      const bRadio = el('button', 'btn', pause.card, `RADIO: ${S.settings.music ? 'ON' : 'OFF'}`);
      bRadio.addEventListener('click', () => { S.settings.music = !S.settings.music; hooks.onMusic && hooks.onMusic(S.settings.music); bRadio.textContent = `RADIO: ${S.settings.music ? 'ON' : 'OFF'}`; });
      el('h3', null, pause.card, 'VOLUME');
      const vol = el('input', null, pause.card);
      vol.type = 'range'; vol.min = '0'; vol.max = '1'; vol.step = '0.05'; vol.value = String(S.settings.volume);
      vol.addEventListener('input', () => { S.settings.volume = Number(vol.value); hooks.onVolume && hooks.onVolume(S.settings.volume); });
      el('h3', null, pause.card, 'HOW TO PLAY');
      el('pre', 'help', pause.card, HELP_TEXT);
      const bTitle = el('button', 'btn', pause.card, 'QUIT TO TITLE');
      bTitle.addEventListener('click', () => { closeM(pause); hooks.onQuitToTitle && hooks.onQuitToTitle(); });
      openM(pause);
    };
    ui.closePause = () => closeM(pause);
    ui.pauseOpen = () => pause.m.classList.contains('open');

    // ---------- shop (clinic) ----------
    ui.openShop = (S, D) => {
      shop.card.innerHTML = '';
      el('h2', null, shop.card, 'BAY CLINIC — COUNTER');
      el('p', null, shop.card, `Cash: $${S.player.money} · District discounts apply.`);
      const items = [
        ['heal', 'Full heal', D.PRICES.heal, S.player.hp >= 100],
        ['armour', 'Armour to full', D.PRICES.armour, S.player.armour >= 100],
        ['ammo', 'Ammo +48', D.PRICES.ammo, false],
      ];
      for (const [kind, name, base, maxed] of items) {
        const price = D.priceWithDiscount(base, D.districtAt(S.player.x, S.player.z), S.standing);
        const b = el('button', 'btn', shop.card, `${name}<span class="price">$${price}</span>`);
        b.disabled = maxed || S.player.money < price;
        b.addEventListener('click', () => { if (hooks.onBuy && hooks.onBuy(kind)) ui.openShop(S, D); });
      }
      const bClose = el('button', 'btn', shop.card, 'CLOSE');
      bClose.addEventListener('click', () => closeM(shop));
      openM(shop);
    };
    ui.shopOpen = () => shop.m.classList.contains('open');
    ui.closeShop = () => closeM(shop);

    // ---------- death ----------
    ui.openDeath = (S, D) => {
      death.card.innerHTML = '';
      el('h2', null, death.card, 'WASTED');
      el('p', null, death.card, 'The city keeps what it catches.');
      const bRescue = el('button', 'btn', death.card, `FIELD RESCUE — $${D.PRICES.rescue} (wake here at 65 hp)`);
      bRescue.disabled = S.player.money < D.PRICES.rescue;
      bRescue.addEventListener('click', () => { if (hooks.onRescue && hooks.onRescue()) closeM(death); });
      const bRespawn = el('button', 'btn', death.card, `CLINIC RESPAWN — $${D.PRICES.respawn} (wake at the clinic)`);
      bRespawn.addEventListener('click', () => { if (hooks.onRespawn && hooks.onRespawn()) closeM(death); });
      openM(death);
    };
    ui.deathOpen = () => death.m.classList.contains('open');

    // ---------- big map ----------
    const bigCanvas = el('canvas', null, bigmap.card); bigCanvas.id = 'bigmap'; bigCanvas.width = 560; bigCanvas.height = 560;
    const standBox = el('div', null, bigmap.card);
    const bMapClose = el('button', 'btn', bigmap.card, 'CLOSE MAP (M)');
    bMapClose.addEventListener('click', () => closeM(bigmap));
    ui.toggleMap = (S, D) => {
      if (bigmap.m.classList.contains('open')) { closeM(bigmap); return; }
      drawMap(bigCanvas.getContext('2d'), 560, S, D, true);
      standBox.innerHTML = '';
      el('h3', null, standBox, 'DISTRICT STANDING');
      for (const d of D.DISTRICTS) {
        const t = D.tierOf(S.standing[d]);
        const row = el('div', 'standrow', standBox);
        el('span', null, row, d);
        el('span', null, row, `${t.name} · ${Math.floor(S.standing[d])} · shop discount ${t.discount}%`);
      }
      openM(bigmap);
    };
    ui.mapIsOpen = () => bigmap.m.classList.contains('open');

    // ---------- maps ----------
    const DISTRICT_COLORS = {
      'OLD QUARTER': '#4d7d60', 'GLASS DISTRICT': '#41779c', 'CORAL HEIGHTS': '#9c664c',
      'LITTLE PALM': '#7d9845', 'PORT SOL': '#6f5da0', 'SUNSTRAND BEACH': '#bfa155',
    };
    function paintBase(ctx, size, D) {
      ctx.fillStyle = '#2e6284'; ctx.fillRect(0, 0, size, size);
      const w2m = (v) => (v + 230) / 460 * size;
      // land
      ctx.fillStyle = '#3a5c44'; ctx.fillRect(0, 0, w2m(222), size);
      // districts
      const step = 460 / 28;
      for (let i = 0; i < 28; i++) for (let j = 0; j < 28; j++) {
        const x = -230 + i * step + step / 2, z = -230 + j * step + step / 2;
        if (x > 198) continue;
        ctx.fillStyle = DISTRICT_COLORS[D.districtAt(x, z)] || '#3a5c44';
        ctx.fillRect(w2m(x - step / 2), w2m(z - step / 2), step + 1, step + 1);
      }
      // beach sand
      ctx.fillStyle = '#dcc48f'; ctx.fillRect(w2m(198), 0, w2m(224) - w2m(198), size);
      // piers
      ctx.strokeStyle = '#8a6b4f'; ctx.lineWidth = Math.max(1.2, size / 190);
      for (const pz of D.PIERS) {
        ctx.beginPath(); ctx.moveTo(w2m(226), w2m(pz)); ctx.lineTo(w2m(252), w2m(pz)); ctx.stroke();
      }
      // roads: dark casing first, then a bright centre line, so the grid
      // reads at minimap size as well as on the big map
      for (const r of D.ROADS) {
        ctx.strokeStyle = 'rgba(16,24,32,.65)'; ctx.lineWidth = Math.max(2.4, size / 95);
        ctx.beginPath(); ctx.moveTo(w2m(r), 0); ctx.lineTo(w2m(r), size); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, w2m(r)); ctx.lineTo(w2m(222), w2m(r)); ctx.stroke();
        ctx.strokeStyle = 'rgba(238,244,246,.92)'; ctx.lineWidth = Math.max(1.1, size / 200);
        ctx.beginPath(); ctx.moveTo(w2m(r), 0); ctx.lineTo(w2m(r), size); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, w2m(r)); ctx.lineTo(w2m(222), w2m(r)); ctx.stroke();
      }
      return w2m;
    }
    function drawMap(ctx, size, S, D, big) {
      const w2m = paintBase(ctx, size, D);
      const p = S.player;
      const dot = (x, z, color, r) => { ctx.fillStyle = color; ctx.beginPath(); ctx.arc(w2m(x), w2m(z), r, 0, 7); ctx.fill(); };
      const ringDot = (x, z, color, r) => {
        ctx.fillStyle = color; ctx.beginPath(); ctx.arc(w2m(x), w2m(z), r, 0, 7); ctx.fill();
        ctx.strokeStyle = 'rgba(8,14,20,.85)'; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.arc(w2m(x), w2m(z), r, 0, 7); ctx.stroke();
      };
      // sites
      ringDot(D.SITES.mara.x, D.SITES.mara.z, '#f77f80', big ? 5 : 3.2);
      ringDot(D.SITES.nico.x, D.SITES.nico.z, '#f1ad5e', big ? 5 : 3.2);
      ringDot(D.SITES.clinic.x, D.SITES.clinic.z, '#72e5bb', big ? 5 : 3.2);
      ringDot(D.SITES.home.x, D.SITES.home.z, '#8bbcff', big ? 5 : 3.2);
      ringDot(D.SITES.chop.x, D.SITES.chop.z, '#f8cf69', big ? 5 : 3.2);
      // taxi: waiting passenger, then the fare destination
      if (S.taxi) {
        if (S.taxi.phase === 'fare') {
          const d = D.TAXI_SPOTS[S.taxi.dest];
          ringDot(d.x, d.z, '#3cc8cf', big ? 5 : 3.2);
        } else if (S.taxi.passengerOut) {
          const s = D.TAXI_SPOTS[S.taxi.spot];
          ringDot(s.x, s.z, '#3cc8cf', big ? 5 : 3.2);
        }
      }
      // objective: diamond inside a pulsing ring
      const obj = hooks.objectivePos ? hooks.objectivePos() : null;
      if (obj) {
        const pulse = (big ? 10 : 7.5) + Math.sin(performance.now() / 240) * 1.6;
        ctx.strokeStyle = 'rgba(255,217,77,.9)'; ctx.lineWidth = big ? 2 : 1.4;
        ctx.beginPath(); ctx.arc(w2m(obj.x), w2m(obj.z), pulse, 0, 7); ctx.stroke();
        ctx.save();
        ctx.translate(w2m(obj.x), w2m(obj.z));
        ctx.rotate(Math.PI / 4);
        ctx.fillStyle = '#ffd94d';
        const s = big ? 7 : 5;
        ctx.fillRect(-s / 2, -s / 2, s, s);
        ctx.restore();
      }
      // police
      const flash = Math.floor(performance.now() / 300) % 2 === 0;
      for (const u of S.policeCars) if (u.active) dot(u.x, u.z, flash ? '#ff5040' : '#4080ff', big ? 4 : 2.5);
      for (const u of S.policeFoot) if (u.active) dot(u.x, u.z, flash ? '#ff5040' : '#4080ff', big ? 3.5 : 2);
      if (S.blockCars) for (const u of S.blockCars) if (u.active) dot(u.x, u.z, flash ? '#ff5040' : '#4080ff', big ? 4.5 : 2.8);
      // player arrow: dark outline first so it reads on any district colour
      ctx.save();
      ctx.translate(w2m(p.x), w2m(p.z));
      ctx.rotate(Math.PI - p.ang);
      const ah = big ? 1 : 1.35;
      ctx.fillStyle = 'rgba(8,14,20,.9)';
      ctx.beginPath(); ctx.moveTo(0, -7.6 * ah); ctx.lineTo(5.2 * ah, 6.2 * ah); ctx.lineTo(0, 3.2 * ah); ctx.lineTo(-5.2 * ah, 6.2 * ah); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.moveTo(0, -7 * ah); ctx.lineTo(4.6 * ah, 5.6 * ah); ctx.lineTo(0, 2.8 * ah); ctx.lineTo(-4.6 * ah, 5.6 * ah); ctx.closePath(); ctx.fill();
      ctx.restore();
      // north tick
      ctx.fillStyle = 'rgba(232,241,242,.9)'; ctx.font = `bold ${big ? 12 : 10}px Verdana`;
      ctx.fillText('N', size - (big ? 20 : 15), big ? 18 : 14);
      if (big) {
        ctx.fillStyle = '#e8f1f2'; ctx.font = '11px Verdana';
        ctx.fillText('M Mara · N Nico · + Clinic · H Home · $ Chop · ◆ Objective', 10, size - 10);
      }
    }
    ui.drawMinimap = (S, D) => drawMap(minimap.getContext('2d'), 168, S, D, false);

    // ---------- per-frame HUD ----------
    let lastHudText = '';
    ui.updateHUD = (S, D, ctxInfo) => {
      readKeys();
      const p = S.player;
      const stars = S.starsCache !== undefined ? S.starsCache : 0;
      cashEl.textContent = `$${p.money}`;
      const stormTag = S.stormI > 0.3 ? ' · STORM' : '';
      clockEl.textContent = `Day ${S.day} · ${fmtClock(S.hours)}${stormTag}`;
      districtEl.textContent = D.districtAt(p.x, p.z);
      hpFill.style.width = `${Math.max(0, p.hp)}%`;
      armourFill.style.width = `${Math.max(0, p.armour)}%`;
      stamFill.style.width = `${Math.max(0, p.stamina)}%`;
      let sh = '';
      for (let i = 0; i < 5; i++) sh += `<span class="${i < stars ? '' : 'off'}">★</span>`;
      starsEl.innerHTML = S.wanted.episode ? sh : '';
      searchWrap.style.display = S.wanted.episode ? 'block' : 'none';
      searchFill.style.width = `${Math.round(S.wanted.search * 100)}%`;
      const anyFollow = S.helis.some(h => h.mode === 'follow');
      heliEl.textContent = anyFollow ? 'AIR: ON YOU' : (S.helis.length ? 'AIR: PATROL' : '');
      weaponEl.innerHTML = p.weapon === 'sidearm'
        ? `SIDEARM<div id="hud-ammo">${p.clip} / ${p.ammo}${p.reloadT > 0 ? ' · RELOADING' : ''}</div>`
        : `BATON<div id="hud-ammo">—</div>`;
      if (ctxInfo && ctxInfo.vehicle) {
        const v = ctxInfo.vehicle;
        vehicleEl.style.display = 'block';
        vehicleEl.innerHTML = `${v.name} · ${Math.round(Math.abs(v.speed) * 3.6)} km/h<br>` +
          `HULL <span style="color:${v.hp > 35 ? '#8fe388' : '#ff7a6b'}">${Math.max(0, Math.round(v.hp))}%</span>` +
          (v.fuelKnown ? ` · FUEL ${Math.round(v.fuel)}%` : ' · FUEL —') +
          (v.hp <= 35 ? '<br><span style="color:#ff7a6b">SMOKING — find Nico or a tow</span>' : '');
      } else vehicleEl.style.display = 'none';
      // objective panel
      objectiveEl.innerHTML = ctxInfo && ctxInfo.objective ? ctxInfo.objective : '';
      // context prompt
      if (ctxInfo && ctxInfo.context) contextEl.innerHTML = `<span class="key">E</span>${ctxInfo.context}`;
      else contextEl.innerHTML = '';
      // channel bar
      if (ctxInfo && ctxInfo.channel >= 0) {
        channelEl.style.display = 'block';
        channelFill.style.width = `${Math.round(ctxInfo.channel * 100)}%`;
      } else channelEl.style.display = 'none';
    };

    refreshModalFlag();
    return ui;
  }
  return { createUI, HELP_TEXT };
})();
