/* ---------- Lunavia : pictogrammes (traits simples), panneaux et flèches de manœuvre ---------- */
J.ic = (function () {
  const P = {
    search: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/>',
    close: '<path d="M6 6l12 12M18 6 6 18"/>',
    back: '<path d="M15 5l-7 7 7 7"/>',
    gear: '<path d="M4 7h9M18.5 7H20M4 17h1.5M11 17h9"/><circle cx="15.8" cy="7" r="2.6"/><circle cx="8.2" cy="17" r="2.6"/>',
    locate: '<circle cx="12" cy="12" r="6.8"/><circle cx="12" cy="12" r="2.3" fill="currentColor" stroke="none"/><path d="M12 2.5v2.7M12 18.8v2.7M2.5 12h2.7M18.8 12h2.7"/>',
    nav: '<path d="M12 3l7.2 17.5L12 16.6l-7.2 3.9z" fill="currentColor"/>',
    layers: '<path d="M12 3.5l8.5 4.7-8.5 4.7-8.5-4.7z"/><path d="M3.5 12.6l8.5 4.7 8.5-4.7"/><path d="M3.5 16.6l8.5 4.7 8.5-4.7"/>',
    star: '<path d="M12 3.6l2.6 5.3 5.8.8-4.2 4.1 1 5.8-5.2-2.8-5.2 2.8 1-5.8-4.2-4.1 5.8-.8z"/>',
    starf: '<path d="M12 3.6l2.6 5.3 5.8.8-4.2 4.1 1 5.8-5.2-2.8-5.2 2.8 1-5.8-4.2-4.1 5.8-.8z" fill="currentColor"/>',
    home: '<path d="M3.5 11.2 12 4l8.5 7.2"/><path d="M6 9.6V20h12V9.6"/><path d="M10 20v-5.5h4V20"/>',
    work: '<rect x="3.5" y="7.5" width="17" height="12" rx="2"/><path d="M9 7.5v-2h6v2M3.5 13h17"/>',
    pin: '<path d="M12 21.2s-6.6-6.3-6.6-11.2a6.6 6.6 0 0 1 13.2 0c0 4.9-6.600 11.2-6.600 11.2z"/><circle cx="12" cy="10" r="2.4"/>',
    route: '<circle cx="6" cy="18.2" r="2.3"/><circle cx="18" cy="5.800" r="2.3"/><path d="M8.300 18.2h5.900a3.500 3.500 0 0 0 0-7H9.800a3.500 3.500 0 0 1 0-7h5.900"/>',
    car: '<path d="M4.500 16.500v-4l1.900-5a1.600 1.600 0 0 1 1.500-1h8.200a1.600 1.600 0 0 1 1.500 1l1.900 5v4z"/><path d="M4.500 12.500h15M6.500 16.500v2.200M17.500 16.500v2.200"/><path d="M7.200 14.500h1.600M15.200 14.500h1.600"/>',
    bike: '<circle cx="6" cy="16.500" r="3.500"/><circle cx="18" cy="16.500" r="3.500"/><path d="M6 16.500 9.800 8.500h4.700l3.500 8M9.800 8.500l4.200 8M8.200 6h3M14.500 8.500 13.600 6H16"/>',
    walk: '<circle cx="13" cy="4.300" r="1.900" fill="currentColor" stroke="none"/><path d="M13.200 8.200 9.800 10.600v3.600M13.200 8.200l1.700 4 3.300 1.700M12.300 12.600l1.500 3.600.9 5.300M11 15.200l-1.200 3-2.300 3.300"/>',
    clock: '<circle cx="12" cy="12" r="8.500"/><path d="M12 7.200V12l3.300 2"/>',
    flag: '<path d="M6 21V4M6 4.500h12l-3 4 3 4H6"/>',
    vol: '<path d="M4 9.500v5h3.500L12 18.200V5.800L7.500 9.500z"/><path d="M15.500 9.200a4 4 0 0 1 0 5.600M18 6.800a7.500 7.500 0 0 1 0 10.400"/>',
    volx: '<path d="M4 9.500v5h3.500L12 18.200V5.800L7.500 9.500z"/><path d="M16 9.500l5 5M21 9.500l-5 5"/>',
    share: '<path d="M12 15V3.500M8 7.200l4-3.700 4 3.700M5.500 12v7.500h13V12"/>',
    trash: '<path d="M5 7h14M9.500 7V4.500h5V7M7 7l1 13h8l1-13"/>',
    chev: '<path d="M9 5l7 7-7 7"/>',
    fuel: '<rect x="4.500" y="4" width="9" height="16" rx="1.600"/><path d="M7 8.200h4M13.500 10.500h1.800a2 2 0 0 1 2 2V16a1.500 1.500 0 0 0 3 0V9.200L17.800 6.500"/>',
    bolt: '<path d="M13.200 2.800 5.800 13.600h5.400l-.9 7.600 7.900-11.200h-5.600z"/>',
    park: '<rect x="3.500" y="3.500" width="17" height="17" rx="3.200"/><path d="M9.600 17V7.500h3.200a3 3 0 0 1 0 6H9.600"/>',
    food: '<path d="M7 3.500V21M4.800 3.500v4a2.200 2.200 0 0 0 4.400 0v-4M17 3.500c-2.200 1.600-3.200 4.200-3.200 7.300H17M17 3.500V21"/>',
    cart: '<path d="M3 4.500h2.600l2 10.500h10.300l1.900-7.500H6.600"/><circle cx="9.500" cy="18.800" r="1.400"/><circle cx="16.500" cy="18.800" r="1.400"/>',
    cross: '<path d="M9.600 3.800h4.800v5.800h5.800v4.800h-5.800v5.800H9.600v-5.800H3.800V9.600h5.800z"/>',
    warn: '<path d="M12 3.800 21.300 20H2.700z"/><path d="M12 9.800v5"/><circle cx="12" cy="17.300" r=".7" fill="currentColor"/>',
    check: '<path d="M5 12.600l4.500 4.400L19 7.500"/>',
    play: '<path d="M8 5.500v13l10.500-6.500z" fill="currentColor"/>',
    pause: '<path d="M8.500 5.500v13M15.500 5.500v13"/>',
    info: '<circle cx="12" cy="12" r="8.500"/><path d="M12 11v5.500"/><circle cx="12" cy="7.900" r=".7" fill="currentColor"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    phone: '<path d="M6.500 3.800h3l1.400 3.900-2 1.500a12 12 0 0 0 5.900 5.900l1.500-2 3.900 1.400v3a2 2 0 0 1-2 2A16.200 16.200 0 0 1 4.500 5.800a2 2 0 0 1 2-2z"/>',
    globe: '<circle cx="12" cy="12" r="8.500"/><path d="M3.500 12h17M12 3.500c3.200 3 3.200 14 0 17M12 3.500c-3.200 3-3.200 14 0 17"/>',
    cloud: '<path d="M7.200 18.500a4.200 4.200 0 0 1-.6-8.360 5.600 5.600 0 0 1 10.900 1.060 3.700 3.700 0 0 1-.5 7.300z"/>',
    north: '<path d="M12 3.200 15.300 12H8.700z" fill="var(--red)" stroke="none"/><path d="M12 20.800 8.700 12h6.600z" fill="currentColor" stroke="none" opacity=".4"/>',
    list: '<path d="M8.500 6.500h11M8.500 12h11M8.500 17.500h11"/><circle cx="4.700" cy="6.500" r=".9" fill="currentColor"/><circle cx="4.700" cy="12" r=".9" fill="currentColor"/><circle cx="4.700" cy="17.500" r=".9" fill="currentColor"/>'
  };
  const f = (n, cls) => '<svg class="ic' + (cls ? ' ' + cls : '') + '" viewBox="0 0 24 24" aria-hidden="true">' + (P[n] || '') + '</svg>';
  f.has = n => !!P[n];
  return f;
})();

/* panneaux de signalement : triangle jaune bordé de rouge (signalisation temporaire), disques pour contrôle et route fermée */
J.signs = (function () {
  const tri = inner => '<svg class="sg" viewBox="0 0 40 36" aria-hidden="true"><path d="M20 2.800 37.500 33H2.500z" fill="#F7B500" stroke="#C1121C" stroke-width="3" stroke-linejoin="round"/>' + inner + '</svg>';
  return {
    jam: tri('<g fill="#15130B"><rect x="11.800" y="23.200" width="6.800" height="5.200" rx="1.300"/><rect x="21.400" y="23.200" width="6.800" height="5.200" rx="1.300"/><rect x="16.600" y="15.600" width="6.800" height="5.200" rx="1.300"/></g>'),
    crash: tri('<path d="M20 12.200l1.800 5 5-1.500-2.900 4.300 4.200 3-5.200.400.300 5.200-3.200-4.100-3.200 4.100.300-5.200-5.200-.400 4.200-3-2.900-4.300 5 1.500z" fill="#15130B"/>'),
    danger: tri('<path d="M20 12.500v9.500" stroke="#15130B" stroke-width="3.400" stroke-linecap="round"/><circle cx="20" cy="27.200" r="2" fill="#15130B"/>'),
    works: tri('<path d="M20 11.500l5.300 16H14.700z" fill="#15130B"/><path d="M12.300 28.800h15.400" stroke="#15130B" stroke-width="2.600" stroke-linecap="round"/><path d="M17.800 18.800h4.400M16.500 23h7" stroke="#F7B500" stroke-width="1.700"/>'),
    control: '<svg class="sg" viewBox="0 0 36 36" aria-hidden="true"><circle cx="18" cy="18" r="16" fill="#0F4C8A" stroke="#fff" stroke-width="2"/><path d="M18 8.500l7.500 2.800v5.600c0 4.600-3 8.300-7.500 10.200-4.500-1.900-7.500-5.600-7.500-10.200v-5.600z" fill="none" stroke="#fff" stroke-width="2.200" stroke-linejoin="round"/><path d="M14.500 17.600l2.600 2.600 4.400-4.800" fill="none" stroke="#fff" stroke-width="2.200" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    closed: '<svg class="sg" viewBox="0 0 36 36" aria-hidden="true"><circle cx="18" cy="18" r="16" fill="#C1121C" stroke="#fff" stroke-width="2"/><rect x="8.500" y="15" width="19" height="6" rx="1" fill="#fff"/></svg>'
  };
})();

/* le jalon : piquet d'arpenteur rouge et blanc, utilisé pour le logo et le repère de destination */
J.logo = '<svg class="logo" viewBox="0 0 24 24" aria-hidden="true"><path d="M10 10.500h4v3.600h-4z" fill="#fff"/><path d="M10 14.100h4v3.600h-4z" fill="#C1121C"/><path d="M10 17.700h4l-2 4.800z" fill="#fff"/><path d="M10 10.500h4v7.200l-2 4.800-2-4.800z" fill="none" stroke="#151A21" stroke-width=".9" stroke-linejoin="round"/><circle cx="12" cy="6.300" r="4.900" fill="#C1121C" stroke="#fff" stroke-width="1.200"/><circle cx="12" cy="6.300" r="1.700" fill="#fff"/></svg>';
J.pin = '<svg class="jpin" viewBox="0 0 30 50" width="30" height="50" aria-hidden="true"><ellipse cx="15" cy="48" rx="6" ry="1.800" fill="rgba(0,0,0,.28)"/><path d="M12.400 21h5.200v7h-5.200z" fill="#fff"/><path d="M12.400 28h5.200v7h-5.200z" fill="#C1121C"/><path d="M12.400 35h5.200v6L15 47.500 12.400 41z" fill="#fff"/><path d="M12.400 21h5.200v20L15 47.500 12.400 41z" fill="none" stroke="#151A21" stroke-width="1"/><circle cx="15" cy="12" r="10.500" fill="#C1121C" stroke="#fff" stroke-width="2.400"/><circle cx="15" cy="12" r="3.600" fill="#fff"/></svg>';

/* flèche de manœuvre dessinée d'après l'angle du virage */
J.arrow = function (s) {
  const open = '<svg class="mv" viewBox="0 0 48 48" aria-hidden="true">';
  if (s.type === 'arrive') return open + '<path d="M15 43V7M15 8.500h20l-5.500 7 5.500 7H15"/></svg>';
  if (s.type === 'roundabout' || s.type === 'rexit') {
    // la sortie est dessinée dans sa vraie direction quand le tracé la donne ; sinon d'après son numéro
    let a = s.type === 'rexit' ? 55 : typeof s.ang === 'number' ? s.ang : ({ 1: 90, 2: 0, 3: -90 })[s.exit] || 0;
    if (s.type === 'roundabout') a = Math.abs(a) > 160 ? 180 : Math.round(a / 15) * 15;
    const r = a * Math.PI / 180;
    const x1 = 24 + 9 * Math.sin(r), y1 = 24 - 9 * Math.cos(r), x2 = 24 + 19 * Math.sin(r), y2 = 24 - 19 * Math.cos(r);
    return open + '<circle cx="24" cy="24" r="9"/><path d="M24 45V33"/><path d="M' + x1.toFixed(1) + ' ' + y1.toFixed(1) + 'L' + x2.toFixed(1) + ' ' + y2.toFixed(1) + '"/>' + head(x2, y2, r) +
      (s.exit ? '<text x="24" y="28.400" text-anchor="middle" font-size="12" font-weight="700" fill="currentColor" stroke="none">' + s.exit + '</text>' : '') + '</svg>';
  }
  if (s.mod === 'uturn') return open + '<path d="M16 43V19a8.500 8.500 0 0 1 17 0v12"/>' + head(33, 32, Math.PI) + '</svg>';
  const soft = s.type === 'ramp' || s.type === 'exit' || s.type === 'fork' || s.type === 'merge';
  const left = s.mod && s.mod.indexOf('left') >= 0, right = s.mod && s.mod.indexOf('right') >= 0;
  let a = ({ 'slight-right': 40, right: 90, 'sharp-right': 135, 'slight-left': -40, left: -90, 'sharp-left': -135 })[s.mod] || 0;
  if (soft) a = left ? -40 : right ? 40 : 0;
  if (s.type === 'depart' || s.type === 'continue') a = 0;
  const r = a * Math.PI / 180, x = 24 + 15 * Math.sin(r), y = 27 - 15 * Math.cos(r);
  return open + '<path d="M24 43V27L' + x.toFixed(1) + ' ' + y.toFixed(1) + '"/>' + head(x, y, r) + '</svg>';

  function head(x, y, r) {
    const dx = -Math.sin(r), dy = Math.cos(r), w = 9.500, c = Math.cos(0.560), sn = Math.sin(0.560);
    const ax = x + w * (dx * c - dy * sn), ay = y + w * (dx * sn + dy * c), bx = x + w * (dx * c + dy * sn), by = y + w * (-dx * sn + dy * c);
    return '<path d="M' + ax.toFixed(1) + ' ' + ay.toFixed(1) + 'L' + x.toFixed(1) + ' ' + y.toFixed(1) + 'L' + bx.toFixed(1) + ' ' + by.toFixed(1) + '"/>';
  }
};

/* flèche d'une voie de circulation (guidage par voie) */
J.lane = function (l) {
  return '<span class="ln' + (l.on === 2 ? ' on' : l.on === 1 ? ' ok' : '') + '">' + J.arrow({ type: 'turn', mod: l.d === 'straight' ? '' : l.d }) + '</span>';
};
