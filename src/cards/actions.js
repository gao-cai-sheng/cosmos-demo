import {SOLAR_RESEARCH_ACTIONS} from './solar-research-deck.js';
import {POWER_RESEARCH_ACTIONS} from './power-research-deck.js';
import {ASSAY_ACTIONS} from './assay-deck.js';
import {RESEARCH_ACTIONS} from './research-deck.js';
import {NURSERY_ACTIONS} from './nursery-deck.js';
import {WATER_ACTIONS} from './water-deck.js';
// 任务卡上的按钮能做的事（D70）。名字和 deck.js 的 ACTION_NAMES 一一对应。
// 卡片打勾后还会停一会儿才换下一张，孩子可能连点两下：每个动作都要点两下也不出事。
export function createActions(mobility, survival, { relicGeo = () => null, home = () => null, openBrief = () => {} } = {}) {
  return {
    ...Object.fromEntries(SOLAR_RESEARCH_ACTIONS.map(name=>[name,()=>survival?.solarResearch?.action(name)])),
    ...Object.fromEntries(POWER_RESEARCH_ACTIONS.map(name=>[name,()=>survival?.powerResearch?.action(name)])),
    ...Object.fromEntries(ASSAY_ACTIONS.map(name=>[name,()=>survival?.assay?.action(name)])),
    ...Object.fromEntries(RESEARCH_ACTIONS.map(name=>[name,()=>survival?.research?.action(name)])),
    ...Object.fromEntries(NURSERY_ACTIONS.map(name=>[name,()=>survival?.nursery?.action(name)])),
    ...Object.fromEntries(WATER_ACTIONS.filter(x=>!['driveWater','inspectWater','summonCarrier'].includes(x)).map(name=>[name,()=>survival?.water?.action(name)])),
    requestWater:()=>mobility.support.open(),
    driveWater:(w,card)=>{const p=w.survival?.waterTargets?.[card.waterTarget];return p?mobility.driveTo({...p,name:'水务任务点'}):'没有可达的水务目标。';},
    inspectWater:()=>survival?.water?.open(),
    summonCarrier:()=>mobility.summon('carrier'),
    ...Object.fromEntries(Object.entries({releasePower:'release',selectPower:'select',installPower:'install',expandSolar:'expand-solar',connectSolar:'solar',connectBus:'bus',commissionPower:'commission',eatMeal:'meal',sleepNight:'sleep',}).map(([name,type])=>[name,()=>survival?.action(type)])),
    archiveSample:()=>mobility.operations?.action('unload'),
    readAnalysis:()=>survival?.openStation('lab'),
    unloadShip: () => mobility.unloadShip(),                                  // 已经卸过会自己什么都不做
    // cargoAction 是开关：车上有小车就卸下，没有就装回去。卡上的按钮只许卸。
    unloadRover: () => { if (mobility.carrier.loaded) mobility.cargoAction(); },
    remoteRover: async () => { if (mobility.carrier.active) mobility.leaveCarrier(); await mobility.boardRover(); },
    endRemote: () => mobility.walk(),

    // 规划到遗迹旁的路线并开始自动驾驶，就是 M 地图里那三下。路线算不出来时回原因。
    driveToRelic: (w, card) => mobility.driveTo(card.relic),
    // 人在船上才起飞。flyTo 在人不在船上时只是把航线发给飞船，孩子看不出发生了什么，所以这里挡住。
    flyToRelic: (w, card) => {
      const g = relicGeo(card.relic);
      if (g && mobility.flyer.active) mobility.routeFlight.flyTo({ id: card.relic, lat: g.lat, lon: g.lon });
    },
    goHome: w => {
      if (w.mode === 'carrier') return w.spots.homePark ? mobility.driveTo({ ...w.spots.homePark, name: '家门口' }) : undefined;
      const h = home();
      if (h && mobility.flyer.active) mobility.routeFlight.flyTo({ id: 'HOME', lat: h.lat, lon: h.lon });
    },
    openBrief: (w, card) => openBrief(card.relic),
  };
}
