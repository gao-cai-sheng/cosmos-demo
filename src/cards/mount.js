// 艾琳任务卡的总装（D70、D76）：内容 deck、前提小卡 needs、导演 director、世界快照 world，接上画面 card-hud / beacon / briefing 和声音 voice。
import { playerLine } from '../journey/player.js';
import * as THREE from 'three';
import { DECK } from './deck.js';
import { ICONS } from './icons.js';
import { needFor, NEEDS } from './needs.js';
import { photoHint } from './photo-hints.js';
import { createDirector } from './director.js';
import { createWorld } from './world.js';
import { mountCardHud, assetUrl } from './card-hud.js';
import { createBeacon } from './beacon.js';
import { createVoice } from './voice.js';
import { openBriefing } from './briefing.js';
import { createActions } from './actions.js';
import { lookahead, offPath, firstRoute } from './guide.js';
import { planTerrainRoute } from '../journey/route.js';
import { relicById } from '../relics/catalog.js';
import { relicArchiveOpen } from '../relics/archive-overlay.js';
import { getJourney, updateJourney, getSettings, updateSettings } from '../journey/state.js';
import { sfx } from '../journey/sfx.js';

const PRAISE = ['好！', '做得好！', '就是这样！', '漂亮！'];
const TICK_MS = 200;        // 多久看一次世界
const HOLD_MS = 1300;       // 做完一张，打勾停多久再出下一张
const SPEAK_AFTER_MS = 500; // 卡出来多久后艾琳开口
const NUDGE_MS = 60000;     // 多久没动静，艾琳再说一遍
const AHEAD_M = 5;          // 家里箭头指路线上前方多少米
const OFF_PATH_M = 6;       // 离开路线这么远就重新规划
const REPLAN_MS = 2000;     // 家里的路线算不出来时，隔多久再试一次
// 航线图盖满屏幕的那几段（src/journey/route-flight.js 的 phase）：小卡先收起来。
const CRUISE = new Set(['fading', 'cruise', 'leaving', 'arrive-wait']);

const actionsOf = c => c.actions || (c.action ? [c.action] : []);
const sayOf = (c, w) => (typeof c.say === 'function' ? c.say(w) : c.say);
/** 光柱顶上那张图：卡上有照片用照片，没有用简笔画。 */
const tagOf = c => (c.pic ? `<img src="${assetUrl(c.pic)}" alt="">` : ICONS[c.icon]);

/** mobility：src/journey/mobility.js 的返回值。surveyPoints：三个勘测信标 [{id,x,z}]。
 * relicSites：src/relics/relic-sites.js 的返回值。openBrief(id)：打开某一处遗迹的简报浮层（地表页面给）。 */
export function mountCards({ scene, camera, mobility, heightAt, surveyPoints = [], relicSites = null, openBrief = () => {}, survival, homeScene }) {
  const ACTIONS = createActions(mobility, survival, { relicGeo: relicById, home: () => getJourney()?.site, openBrief });
  const world = createWorld({ mobility, getJourney, surveyPoints, relicSites, survival, homeScene });
  const director = createDirector({ deck: DECK, load: () => getJourney()?.cards, save: cards => updateJourney({ cards }) });
  const voice = createVoice({ enabled: () => getSettings().voice });
  let shown, shownAt = 0, spoken = false, owed = false, lastNudge = 0, lastTick = -1e9, holdUntil = 0, praise = 0, briefing = null;
  let seen = null;                       // 最近一张世界快照：按钮按下去那一刻用
  let picked = null, pickedFor = null;   // 两张大图的卡挑了哪个。不存档，换卡就忘
  const autoRan = new Set();             // 自己弹出来的卡：这一页里已经替玩家点过的

  /** 艾琳说一句不在卡上的话（没拍清的原因、路线算不出来的原因）。 */
  function tell(text) { if (!text) return; hud.say(text); voice.speak(text); }
  function run(card, action) {
    if(action.run==='viewBrief')return openBig(card);
    const fn = ACTIONS[action.run]; if (!fn) return;
    Promise.resolve(fn(seen, card)).then(reply => { if (typeof reply === 'string') tell(reply); })
      .catch(error => console.error('[cards action]', error));
  }

  function defer(){briefing=null;mobility.setOverlay(false);voice.stop();director.defer();shown=null;lastTick=-1e9;holdUntil=0;}
  const hud = mountCardHud({
    onDefer:defer,
    onSelect:id=>{director.select(id);shown=null;lastTick=-1e9;holdUntil=0;},
    muted: !getSettings().voice,
    onMute: () => { const on = !getSettings().voice; updateSettings({ voice: on }); if (!on) voice.stop(); return !on; },
    onAction: i => {
      if(mobility.frozen || briefing || relicArchiveOpen())return;
      const face = shown, card = director.current, action = face && actionsOf(face)[i];
      if(face?.big){openBig(card);return;}
      if (!action || !card || !seen) return;
      seen = world.read();
      if ((action.ready && !action.ready(seen)) || (action.visible && !action.visible(seen))) return;
      // 两张大图的卡：记下挑了哪个。人还没上车（上船）就先出前提小卡，上去以后再点一下才出发，免得一上船就飞走。
      if (face === card && action.want) {
        picked = action.want; pickedFor = card.id;
        if (needFor(picked, seen, card.goal?.(seen) || null)) { lastTick = -1e9; return; }
      }
      run(card, action);
    },
  });
  // 前哨仓地基比原地形高，光环要立在地基面上；人在家里时立在舱内地板上。
  const groundAt = (x, z) => mobility.refuge?.inside ? mobility.refuge.floor(x, z) : (mobility.padFloor?.(x, z) ?? heightAt(x, z));
  const beacon = createBeacon({ scene, camera, groundAt });

  // 浏览器在玩家第一次点按之前不让出声。那时候说的话记成「欠一句」，第一次点按时补上。
  function speak(text) { owed = !navigator.userActivation?.hasBeenActive; voice.speak(text); }
  const firstGesture = () => { if (owed && shown && !shown.big && spoken && seen) { owed = false; voice.speak(sayOf(shown, seen)); } };
  addEventListener('pointerdown', firstGesture, true); addEventListener('keydown', firstGesture, true);
  // 没拍清：艾琳出声说为什么。只在轮到拍照卡时说，别的时候乱按 K 不吵。
  const onPhoto = e => { if (director.current?.photo) tell(photoHint(e.detail)); };
  addEventListener('relic:photo', onPhoto);

  const look = new THREE.Vector3();
  /** aim 在镜头的哪一边（angle，右正，卡上的箭头照它转）；meters 默认是直线距离，沿路线走时传路线剩下的米数。 */
  function wayTo(from, aim, meters) {
    camera.getWorldDirection(look);
    const dx = aim.x - from.x, dz = aim.z - from.z;
    return { angle: Math.atan2(-dx * look.z + dz * look.x, dx * look.x + dz * look.z), meters: meters ?? Math.hypot(dx, dz) };
  }

  // 家里有墙和走廊，箭头直指目标会让人撞墙：用游戏自己的规划器在舱内地板上算一条路，箭头指路线前方 AHEAD_M 米。
  // 路线只在换了目标、或人走偏了才重新算；算不出来就退回直指，隔 REPLAN_MS 再试，不每一拍都重算。
  let inside = null;   // { key, path, at }
  function guideInside(cardId, from, target, now) {
    const key = `${cardId}:${target.x.toFixed(1)},${target.z.toFixed(1)}`;
    const stale = !inside || inside.key !== key || (inside.path ? offPath(inside.path, from) > OFF_PATH_M : now - inside.at > REPLAN_MS);
    if (stale) {
      const r = mobility.refuge, apart = (x, z, p) => Math.hypot(x - p.x, z - p.z);
      // 人碰到墙就停住、不会贴着墙滑，所以路线要走在走廊中间：规划时把墙往外「胀」margin 米，
      // 只有起点和终点 4 米以内不胀（通信台本来就贴着墙）。
      const roomAround = (x, z, m) => !r.blocked(x + m, z) && !r.blocked(x - m, z) && !r.blocked(x, z + m) && !r.blocked(x, z - m);
      const path = firstRoute(({ resolution, margin }) => planTerrainRoute({ start: from, goal: target, heightAt: (x, z) => r.floor(x, z),
        blocked: (x, z) => r.blocked(x, z) || (margin > 0 && apart(x, z, from) > 4 && apart(x, z, target) > 4 && !roomAround(x, z, margin)),
        maxSlope: 25, resolution, maxSpan: 400 }));
      inside = { key, path, at: now };
    }
    return inside.path ? lookahead(inside.path, from, AHEAD_M) : null;
  }

  function openBig(card) {
    if (briefing) return;
    mobility.setOverlay(true);
    briefing = openBriefing({ card: { ...card, lines: card.lines.map(line => ({ ...line, say: playerLine(line.say, getJourney()?.player) })) }, speak, onNext: () => sfx.play('brief-next'), onDefer:defer, onAccept: () => {
      briefing = null; sfx.play('accept'); mobility.setOverlay(false); voice.stop();
      director.signal('accept'); lastTick = -1e9;
    } });
  }
  function present(card, now) {
    shown = card; shownAt = now; spoken = false; lastNudge = now;
    hud.show(card?.big?{...card,big:false,keys:[],action:{label:'听任务简报',run:'viewBrief'},say:card.lines[0]?.say}:card); beacon.set(null);
    if(card)sfx.play('card-new');
  }

  return {
    director, world, hud, beacon, voice,
    get current() { return director.current; },
    /** 屏幕上现在这张：当前的卡，或它的前提小卡。 */
    get shown() { return shown; },
    get briefing() { return briefing; },
    /** 游戏里发生了一件卡片在等的事。返回做完的那张卡，或 null。 */
    signal(name) {
      const card = director.signal(name);
      if (card) { hud.celebrate(); sfx.play('card-done'); lastTick = -1e9; }
      return card;
    },
    /** 每帧调。dt 为 0（暂停、降落演出中）时只画光柱，不推进。 */
    update(dt, now = performance.now()) {
      beacon.update(dt, now);
      hud.element.classList.toggle('ec-away', CRUISE.has(mobility.routeFlight?.phase));
      // 遗迹简报浮层开着时不推进：不然小卡那句话会和简报抢着说。
      if (!dt || mobility.frozen || briefing || relicArchiveOpen() || now - lastTick < TICK_MS || now < holdUntil) return;
      lastTick = now;
      const w = seen = world.read();
      const finished = director.tick(w);
      if (finished) {
        picked = pickedFor = null; beacon.set(null);
        // 屏幕上正是它，才打勾、夸一句、停一下。老存档一口气跳过好几张时不吵。
        if (shown === finished) { hud.celebrate(); sfx.play('card-done'); voice.speak(PRAISE[praise++ % PRAISE.length]); holdUntil = now + HOLD_MS; }
        return;
      }
      const card = director.current;
      hud.setTasks(director.pending,card?.id);
      if (card?.id !== pickedFor) picked = pickedFor = null;
      // 这张卡要人在哪（车上、船上、地上）。没满足就先出前提小卡，满足了卡自己回来。
      const goal = card?.goal?.(w) || null;
      const need = card?.requiresHome && !w.homeScene
        ? (needFor('ship',w)||NEEDS.returnHome)
        : card && !card.big ? needFor(card.want?.(w, picked) ?? null, w, goal) : null;
      const face = need || card;
      if (face !== shown) present(face, now);
      if(!face)return;
      if(face.big){hud.say(playerLine(face.lines[0]?.say||'',getJourney()?.player));hud.setActions([{ready:true,visible:true}]);return;}
      const line = sayOf(face, w);
      if (!spoken && now - shownAt >= SPEAK_AFTER_MS) { spoken = true; hud.say(line); speak(line); }
      if (face.liveSay && spoken) hud.say(line);
      const target = face.target?.(w, goal) || null;
      beacon.set(target, tagOf(face), (face.pic || (need === NEEDS.runTo && card.pic)) ? assetUrl(face.pic || card.pic) : '');
      let aim = target, meters = null;
      if (target && w.player && w.inHome) { const g = guideInside(face.id, w.player, target, now); if (g) { aim = g.point; meters = g.remaining; } }
      else inside = null;
      hud.setWay(target && w.player ? wayTo(w.player, aim, meters) : null);
      const acts = actionsOf(face), state = acts.map(a => {
        const preview=survival?.actionStatus?.(a.run),ready=(!a.ready||!!a.ready(w))&&preview?.ready!==false;
        return {ready,visible:a.visible?!!a.visible(w):true,reason:preview?.reason||(!ready?'先按卡片提示到操作位置，并停稳或切换为步行。':'')};
      });
      hud.setActions(state);
      // 自己弹出来的卡（遗迹简报）：这一页里头一回能点的时候，替玩家点一下。
      if (face.auto && !autoRan.has(face.id) && state[0]?.ready) { autoRan.add(face.id); run(face, acts[0]); }
      if (now - lastNudge >= NUDGE_MS) { lastNudge = now; hud.nudge(); beacon.flash(); sfx.play('card-nudge'); voice.speak(line); }
    },
    dispose() {
      removeEventListener('pointerdown', firstGesture, true); removeEventListener('keydown', firstGesture, true);
      removeEventListener('relic:photo', onPhoto);
      briefing?.dismiss(); voice.stop(); hud.dispose(); beacon.dispose();
    },
  };
}
