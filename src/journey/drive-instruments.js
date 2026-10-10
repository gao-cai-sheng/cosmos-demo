const finite = Number.isFinite;
const DEG = 180 / Math.PI;
const fixed = v => (Math.abs(v) < .005 ? 0 : v).toFixed(2);
const text = (element, value) => { if (element.textContent !== value) element.textContent = value; };
const attr = (element, name, value) => { if (element.getAttribute(name) !== value) element.setAttribute(name, value); };
const DIAL = {scale: 2, max: 45, radius: 46};
const SPEED = {max: 80, radius: 58, from: -115, to: 115};

/** Body angles from carrier.js `rotation.set(-atan(dh/dz), heading, atan(dh/dx), 'YXZ')`.
 * The nose is +z, so +x is the left side. roll > 0: right side low. pitch > 0: nose up. Degrees.
 */
export function aresAttitude(rotation) {
  if (!rotation || !finite(rotation.x) || !finite(rotation.z)) return null;
  return {roll: rotation.z * DEG, pitch: -rotation.x * DEG};
}

/** Steepest uniform slope the carrier footprint rule still lets ARES drive across (roll) or up (pitch). */
export function slopeLimits({halfWidth, front, rear, rise}) {
  return {roll: Math.atan(rise / (2 * halfWidth)) * DEG, pitch: Math.atan(rise / (front + rear)) * DEG};
}

const SIDES = ['左', '右'], AXLES = ['前', '中', '后'];
const RANK = {red: 2, amber: 1, green: 0};
/** Per-wheel load from carrier.travel (D31): each wheel shares the vehicle weight at zero travel,
 * nothing past full droop, and bottoms on the stop past full bump. Order matches carrier.js wheels:
 * +x (left) corners front→rear, then right ones (two or three axles).
 */
export function wheelLoads(travel, {droop, bump}) {
  if (!travel || ![4,6].includes(travel.length)) return null;
  const axles=travel.length/2,names=axles===2?['前','后']:AXLES;
  const wheels = Array.from(travel, (d, i) => {
    const ratio = Math.max(0, (Math.min(d, bump) + droop) / droop);
    const [state, tone] = d > bump ? ['触底', 'red'] : ratio === 0 ? ['悬空', 'red'] : ratio < .5 ? ['轻载', 'amber'] : ratio > 1.6 ? ['重载', 'amber'] : ['正常', 'green'];
    return {index: i, name: `${SIDES[Math.floor(i / axles)]}${names[i % axles]}轮`, ratio, state, tone};
  });
  const worst = wheels.reduce((a, b) => RANK[b.tone] > RANK[a.tone] ? b : a);
  return {wheels, tone: worst.tone, summary: worst.tone === 'green' ? (travel.length===4?'四轮着地':'六轮着地') : `${worst.name} ${worst.state}`};
}

/** SVG arc on a circle about the origin; angles in degrees, 0 = straight up, clockwise positive. */
export function arcPath(radius, from, to) {
  const point = a => `${fixed(radius * Math.sin(a / DEG))} ${fixed(-radius * Math.cos(a / DEG))}`;
  return `M${point(from)}A${radius} ${radius} 0 ${to - from > 180 ? 1 : 0} 1 ${point(to)}`;
}

const polar = (radius, angle) => [radius * Math.sin(angle / DEG), -radius * Math.cos(angle / DEG)];
const line = (r0, r1, angle) => { const [x0, y0] = polar(r0, angle), [x1, y1] = polar(r1, angle); return `M${fixed(x0)} ${fixed(y0)}L${fixed(x1)} ${fixed(y1)}`; };
const dialAngle = value => Math.max(-DIAL.max, Math.min(DIAL.max, value)) * DIAL.scale;
const speedAngle = kmh => SPEED.from + (SPEED.to - SPEED.from) * Math.max(0, Math.min(SPEED.max, kmh)) / SPEED.max;

// Rear view (roll) and side view with the nose to the right (pitch); both stand on their own ground line.
const ROLL_GLYPH = '<path class="cd-dial-ground" d="M-34 6H34"/><rect class="cd-dial-body" x="-19" y="-26" width="38" height="20"/><rect class="cd-dial-tyre" x="-26" y="-9" width="9" height="15" rx="2"/><rect class="cd-dial-tyre" x="17" y="-9" width="9" height="15" rx="2"/>';
const PITCH_GLYPH = '<path class="cd-dial-ground" d="M-38 6H38"/><rect class="cd-dial-body" x="-30" y="-24" width="46" height="18"/><rect class="cd-dial-cab" x="16" y="-20" width="11" height="14"/><circle class="cd-dial-tyre" cx="-16" cy="0" r="6"/><circle class="cd-dial-tyre" cx="-3" cy="0" r="6"/><circle class="cd-dial-tyre" cx="21" cy="0" r="6"/>';

function makeDial(kind, glyph) {
  const figure = document.createElement('figure');
  figure.className = 'cd-dial'; figure.dataset.kind = kind;
  const ticks = [-40, -30, -20, -10, 0, 10, 20, 30, 40].map(v => line(DIAL.radius + 4, DIAL.radius + (v % 20 ? 7 : 10), v * DIAL.scale)).join('');
  figure.innerHTML = `<svg viewBox="-62 -62 124 74" aria-hidden="true"><path class="cd-dial-track" d="${arcPath(DIAL.radius, -90, 90)}"/><path class="cd-dial-ticks" d="${ticks}"/><path class="cd-dial-limit"/><g class="cd-dial-glyph">${glyph}<path class="cd-dial-pointer" d="M0 -${DIAL.radius - 3}l-4 8h8z"/></g></svg><figcaption><span></span><b></b></figcaption>`;
  return figure;
}

function makeWheels(count=6) {
  const figure = document.createElement('figure');
  figure.className = 'cd-wheels';
  // Top view, nose up: left wheels on the left. Axle rows follow ARES_SPEC.suspension.axles (3.45, -0.48, -2.66 m).
  const rows = count===4?[6,42]:[6,29,42],axles=count/2;
  const tyres = Array.from({length:count},(_,i)=>i).map(i => `<rect class="cd-wheel" data-wheel="${i}" x="${i < axles ? 3 : 35}" y="${rows[i % axles]}" width="8" height="14" rx="1.5"/>`).join('');
  figure.innerHTML = `<svg viewBox="0 -4 46 66" aria-hidden="true"><path class="cd-wheels-nose" d="M23 -3l4 6h-8z"/><rect class="cd-wheels-body" x="14" y="4" width="18" height="56"/><rect class="cd-wheels-cab" x="16" y="6" width="14" height="11"/>${tyres}</svg><figcaption><span>轮荷</span><b></b></figcaption>`;
  return figure;
}

function makeSpeed(cruise, boost) {
  const section = document.createElement('section');
  section.className = 'cd-drive-panel cd-drive-speed';
  const ticks = Array.from({length: SPEED.max / 10 + 1}, (_, i) => line(SPEED.radius + 6, SPEED.radius + (i % 2 ? 10 : 14), speedAngle(i * 10))).join('');
  const label = (value, className, caption) => {
    const [x, y] = polar(SPEED.radius + 20, speedAngle(value));
    return `<path class="${className}" d="${line(SPEED.radius - 6, SPEED.radius + 14, speedAngle(value))}"/><text class="${className}" x="${x.toFixed(1)}" y="${(y + 3).toFixed(1)}" text-anchor="${x < -4 ? 'end' : x > 4 ? 'start' : 'middle'}">${caption}</text>`;
  };
  section.innerHTML = `<h2>SPEED · 车速</h2><svg viewBox="-120 -82 240 118" aria-hidden="true"><path class="cd-speed-track" d="${arcPath(SPEED.radius, SPEED.from, SPEED.to)}"/><path class="cd-speed-fill"/><path class="cd-speed-ticks" d="${ticks}"/>${label(cruise, 'cd-speed-cruise', `巡航 ${Math.round(cruise)}`)}${label(boost, 'cd-speed-boost', `Shift ${Math.round(boost)}`)}<text class="cd-speed-value" x="0" y="8" text-anchor="middle">0</text><text class="cd-speed-unit" x="0" y="27" text-anchor="middle">km/h</text></svg>`;
  return section;
}

/** ARES attitude, wheel load and speed gauges in the command deck's instrument slots.
 * update: {active, rotation (carrier.asset.group.rotation), speed m/s signed, travel (carrier.travel), autopilot}.
 * Mounted once with {cruise, boost} km/h from ARES_DRIVE, footprint limits and suspension stops.
 */
export function mountDriveInstruments({root, cruise, boost, limits, suspension}) {
  const css = document.createElement('link');
  css.rel = 'stylesheet'; css.href = new URL('./drive-instruments.css', import.meta.url).href;
  document.head.append(css);
  const host = document.createElement('div'); host.className = 'cd-drive'; host.hidden = true;
  const attitude = document.createElement('section'); attitude.className = 'cd-drive-panel cd-drive-attitude';
  attitude.innerHTML = `<h2>ATTITUDE · 姿态 <span>通行上限 侧倾 ${Math.round(limits.roll)}° / 俯仰 ${Math.round(limits.pitch)}°</span></h2><div class="cd-drive-row"></div>`;
  const roll = makeDial('roll', ROLL_GLYPH), pitch = makeDial('pitch', PITCH_GLYPH);let wheels=makeWheels(),wheelCount=6;
  attitude.querySelector('.cd-drive-row').append(roll, pitch, wheels);
  const speed = makeSpeed(cruise, boost);
  host.append(attitude, speed); root.append(host);
  attitude.title = '上限按停车规则算：车身九个采样点高差不超过 3.2 m，假设坡面平整。';
  for (const [dial, limit] of [[roll, limits.roll], [pitch, limits.pitch]]) {
    const a = dialAngle(limit);
    attr(dial.querySelector('.cd-dial-limit'), 'd', line(DIAL.radius - 5, DIAL.radius + 12, -a) + line(DIAL.radius - 5, DIAL.radius + 12, a));
  }
  let active = false, destroyed = false;

  function paintDial(dial, value, limit, caption) {
    attr(dial.querySelector('.cd-dial-glyph'), 'transform', `rotate(${dialAngle(value).toFixed(1)})`);
    dial.dataset.level = Math.abs(value) >= limit ? 'limit' : Math.abs(value) >= limit * .8 ? 'warn' : 'ok';
    text(dial.querySelector('span'), caption[0]); text(dial.querySelector('b'), caption[1]);
  }

  function update(snapshot = {}) {
    if (destroyed) return;
    const visible = !!snapshot.active;
    if (visible !== active) { active = visible; root.classList.toggle('cd-drive-active', active); host.hidden = !active; }
    if (!active) return;
    const stops=snapshot.suspension||suspension,currentLimits=snapshot.limits||limits,count=snapshot.travel?.length||6;
    if(count!==wheelCount){wheelCount=count;const next=makeWheels(count);wheels.replaceWith(next);wheels=next;pitch.querySelector('.cd-dial-glyph').innerHTML=(count===4?PITCH_GLYPH.replace('<circle class="cd-dial-tyre" cx="-3" cy="0" r="6"/>',''):PITCH_GLYPH)+'<path class="cd-dial-pointer" d="M0 -43l-4 8h8z"/>';}
    host.dataset.vehicle=snapshot.vehicleName||'ARES';host.dataset.wheels=String(count);
    text(attitude.querySelector('h2 span'),`通行上限 侧倾 ${Math.round(currentLimits.roll)}° / 俯仰 ${Math.round(currentLimits.pitch)}°`);
    for(const [dial,limit] of [[roll,currentLimits.roll],[pitch,currentLimits.pitch]]){const a=dialAngle(limit);attr(dial.querySelector('.cd-dial-limit'),'d',line(DIAL.radius-5,DIAL.radius+12,-a)+line(DIAL.radius-5,DIAL.radius+12,a));}
    const angles = aresAttitude(snapshot.rotation);
    attitude.toggleAttribute('data-missing', !angles);
    if (angles) {
      const r = Math.round(angles.roll), p = Math.round(angles.pitch);
      paintDial(roll, angles.roll, currentLimits.roll, ['侧倾', r === 0 ? '0° 水平' : `${Math.abs(r)}° ${r > 0 ? '右低' : '左低'}`]);
      // The side glyph noses right, so nose-up turns it anticlockwise.
      paintDial(pitch, -angles.pitch, currentLimits.pitch, ['俯仰', p === 0 ? '0° 水平' : `${Math.abs(p)}° ${p > 0 ? '抬头' : '低头'}`]);
    }
    const loads = wheelLoads(snapshot.travel, stops);
    if (loads) {
      loads.wheels.forEach(w => { const rect = wheels.querySelector(`[data-wheel="${w.index}"]`); rect.dataset.tone = w.tone; rect.setAttribute('aria-label', `${w.name} ${w.state}`); });
      wheels.dataset.tone = loads.tone; text(wheels.querySelector('b'), loads.summary);
    }
    const kmh = finite(snapshot.speed) ? Math.abs(snapshot.speed) * 3.6 : null;
    speed.toggleAttribute('data-missing', kmh === null);
    if (kmh !== null) {
      attr(speed.querySelector('.cd-speed-fill'), 'd', kmh < .5 ? '' : arcPath(SPEED.radius, SPEED.from, speedAngle(kmh)));
      speed.dataset.boost = String(kmh > cruise + 1);
      text(speed.querySelector('.cd-speed-value'), String(Math.round(kmh)));
      const direction = Math.abs(snapshot.speed) < .3 ? '停稳' : snapshot.speed > 0 ? '前进' : '倒车';
      text(speed.querySelector('.cd-speed-unit'), `km/h · ${snapshot.autopilot ? '自动驾驶' : direction}`);
    }
  }
  return {update, destroy() { destroyed = true; root.classList.remove('cd-drive-active'); host.remove(); css.remove(); }};
}
