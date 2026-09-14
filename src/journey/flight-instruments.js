const RANGE = 3000;
const SEGMENTS = 60;
const finite = Number.isFinite;
const text = (element, value) => { if (element.textContent !== value) element.textContent = value; };

/** Sample the actual height field along the craft's nose, +Z at heading 0.
 * Heights are world Y, including negative terrain. The difference is from the
 * craft's position datum; it is not a swept-volume collision/landing forecast.
 */
export function sampleFlightTerrain({heightAt, position, heading}) {
  if (typeof heightAt !== 'function' || !position || ![position.x, position.y, position.z, heading].every(finite)) return null;
  const samples = [];
  let highest = null;
  for (let i = 0; i <= SEGMENTS; i++) {
    const distance = RANGE * i / SEGMENTS;
    const x = position.x + Math.sin(heading) * distance;
    const z = position.z + Math.cos(heading) * distance;
    const y = heightAt(x, z);
    if (!finite(y)) return null;
    const point = {distance, x, z, y};
    samples.push(point);
    if (i > 0 && (!highest || y > highest.y)) highest = point;
  }
  return {samples, highest, range: RANGE, spacing: RANGE / SEGMENTS, shipY: position.y, minimumDifference: position.y - highest.y};
}

function makeTape(label, kind) {
  const element = document.createElement('div');
  element.className = `cd-flight-tape cd-flight-${kind}`;
  element.innerHTML = `<div class="cd-flight-scale"><div class="cd-flight-ticks"></div><div class="cd-flight-gate" hidden><span>入轨 600</span></div><b class="cd-flight-value">0</b></div><span class="cd-flight-unit">${label}</span>`;
  return element;
}

function paintTape(element, value, step, gate) {
  const ticks = element.querySelector('.cd-flight-ticks');
  const key = `${value.toFixed(1)}:${step}`;
  if (ticks.dataset.value === key) return;
  ticks.dataset.value = key;
  const minor = step / 5, middle = Math.floor(value / minor);
  const rows = [];
  for (let i = middle - 13; i <= middle + 13; i++) {
    if (i < 0) continue;
    const mark = i * minor, percent = 50 - (mark - value) / step * 20;
    if (percent < 0 || percent > 100) continue;
    rows.push(`<span class="${i % 5 === 0 ? 'cd-flight-major' : ''}" style="top:${percent}%">${i % 5 === 0 ? Math.round(mark) : ''}</span>`);
  }
  ticks.innerHTML = rows.join('');
  text(element.querySelector('.cd-flight-value'), Math.round(value).toLocaleString('en-US'));
  const marker = element.querySelector('.cd-flight-gate');
  const gatePercent = 50 - (600 - value) / step * 20;
  marker.hidden = !gate || gatePercent < 0 || gatePercent > 100;
  if (!marker.hidden) marker.style.top = `${gatePercent}%`;
  element.setAttribute('aria-label', `${element.querySelector('.cd-flight-unit').textContent} ${Math.round(value)}`);
}

/** Mount inside the shared command deck, so H/overlay visibility is inherited.
 * update accepts flyer.position, raw flyer.heading radians, speed m/s, altitude
 * AGL metres, verticalSpeed m/s, and active (current mode === 'flight').
 */
export function mountFlightInstruments({root, navigation = root.querySelector('.cd-navigation'), heightAt}) {
  const css = document.createElement('link');
  css.rel = 'stylesheet'; css.href = new URL('./flight-instruments.css', import.meta.url).href;
  document.head.append(css);
  const tapes = document.createElement('div'); tapes.className = 'cd-flight-tapes'; tapes.hidden = true;
  const speedTape = makeTape('km/h · 地速', 'speed'), altitudeTape = makeTape('m · 离地', 'altitude');
  const vertical = document.createElement('span'); vertical.className = 'cd-flight-vertical';
  altitudeTape.append(vertical); tapes.append(speedTape, altitudeTape); root.append(tapes);
  const profile = document.createElement('section'); profile.className = 'cd-flight-profile'; profile.hidden = true;
  profile.innerHTML = `<h2>前向剖面 · 3 km</h2><svg viewBox="0 0 240 150" preserveAspectRatio="none" role="img" aria-label="前方三公里实际地形剖面"><g class="cd-flight-grid"><path d="M10 38H230M10 74H230M10 110H230"/></g><path class="cd-flight-terrain"/><path class="cd-flight-level"/><path class="cd-flight-difference"/><path class="cd-flight-symbol"/><g class="cd-flight-distance"><text x="10" y="146">0</text><text x="83" y="146" text-anchor="middle">1</text><text x="157" y="146" text-anchor="middle">2</text><text x="230" y="146" text-anchor="end">3 km</text></g></svg><b class="cd-flight-summary">地形读取中</b><p>机体基准等高 · 50 m 采样<br>不含建筑与机体外廓</p>`;
  navigation.append(profile);
  let active = false, sampled = null, lastSample = -Infinity, destroyed = false;
  const terrain = profile.querySelector('.cd-flight-terrain'), level = profile.querySelector('.cd-flight-level');
  const difference = profile.querySelector('.cd-flight-difference'), symbol = profile.querySelector('.cd-flight-symbol');
  const summary = profile.querySelector('.cd-flight-summary');

  function drawProfile(shipY, grounded) {
    const low = Math.min(shipY, ...sampled.samples.map(p => p.y));
    const high = Math.max(shipY, sampled.highest.y);
    const span = Math.max(40, high - low);
    const y = height => 122 - (height - low) / span * 102;
    const points = sampled.samples.map(p => `${10 + p.distance / RANGE * 220},${y(p.y)}`);
    terrain.setAttribute('d', `M${points.join('L')}L230,132L10,132Z`);
    const ship = y(shipY), x = 10 + sampled.highest.distance / RANGE * 220;
    level.setAttribute('d', `M10,${ship}H230`);
    difference.setAttribute('d', `M${x},${ship}V${y(sampled.highest.y)}`);
    symbol.setAttribute('d', `M5,${ship + 3}L15,${ship + 3}L10,${ship - 4}Z`);
    const delta = shipY - sampled.highest.y;
    profile.dataset.warning = String(!grounded && delta <= 0);
    const detail = `等高地形差 ${Math.round(delta)} m · ${(sampled.highest.distance / 1000).toFixed(2)} km`;
    text(summary, grounded ? '地面待命 · 前向地形' : detail);
    profile.querySelector('svg').setAttribute('aria-label', `前方三公里实际地形，${detail}；50米采样，不含建筑与机体外廓`);
  }

  function update(snapshot = {}) {
    if (destroyed) return;
    const visible = !!snapshot.active;
    if (visible !== active) {
      active = visible; root.classList.toggle('cd-flight-active', active);
      tapes.hidden = profile.hidden = !active; lastSample = -Infinity;
    }
    if (!active) return;
    const speed = finite(snapshot.speed) ? Math.abs(snapshot.speed) * 3.6 : null;
    const altitude = finite(snapshot.altitude) ? Math.max(0, snapshot.altitude) : null;
    if (speed !== null) paintTape(speedTape, speed, 50, false);
    if (altitude !== null) paintTape(altitudeTape, altitude, altitude >= 10000 ? 1000 : altitude >= 2000 ? 500 : 100, true);
    speedTape.hidden = speed === null; altitudeTape.hidden = altitude === null;
    const vs = snapshot.verticalSpeed;
    text(vertical, finite(vs) ? `${vs >= 0 ? '+' : ''}${vs.toFixed(1)} m/s` : '— m/s');
    vertical.dataset.descending = String(vs < -.1);
    const now = performance.now();
    if (now - lastSample >= 200) {
      sampled = sampleFlightTerrain({heightAt, position: snapshot.position, heading: snapshot.heading});
      lastSample = now;
    }
    profile.querySelector('svg').toggleAttribute('hidden', !sampled);
    if (sampled && finite(snapshot.position?.y)) drawProfile(snapshot.position.y, snapshot.grounded);
    else text(summary, '地形数据暂不可用');
  }
  return {update, destroy() {destroyed = true; root.classList.remove('cd-flight-active'); tapes.remove(); profile.remove(); css.remove();}};
}
