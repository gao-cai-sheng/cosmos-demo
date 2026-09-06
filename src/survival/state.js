export const SAVE_KEY = 'cosmos.mars.survival.v1';
export const SUIT = [['seal','服体密封'],['oxygen','供氧阀组'],['battery','背包电源'],['filter','空气滤芯']];
export const CARGO = [
  {id:'life',name:'生命补给',code:'01',x:7,z:10,items:[['洁净水','120 L'],['储备口粮','20 人·Sol'],['氧气储备','20 人·Sol'],['空气滤材','20 人·Sol']]},
  {id:'power',name:'能源设备',code:'02',x:-7,z:10,items:[['折叠太阳能板','2 套'],['主电池','48 / 60 kWh'],['独立应急电池','24 kWh'],['电缆','100 m']]},
  {id:'build',name:'建造与维修',code:'03',x:0,z:18,items:[['压力帐篷套件','1 套'],['初始充舱气 / 备用气','各 1 份'],['提取机 / 净化器','各 1 套'],['提取 / 净化耗材','各 20 批'],['流体管线','40 m'],['维修包','4 份']]},
];
export const REFUGE = {x:2,z:-2};
export function freshState(){return {version:1,suit:[],cargo:[],refuge:false,departed:false,returned:false,environment:'inside',player:{x:0,z:-2,heading:0,firstPerson:true}};}
const validList=(value,ids)=>[...new Set(Array.isArray(value)?value.filter(x=>ids.includes(x)):[])];
export function normalize(raw){
  const s=freshState(); if(!raw||raw.version!==1)return s;
  s.suit=validList(raw.suit,SUIT.map(x=>x[0]));s.cargo=validList(raw.cargo,CARGO.map(x=>x.id));
  s.refuge=raw.refuge===true;s.departed=raw.departed===true;s.returned=s.departed&&raw.returned===true;
  s.environment=raw.environment==='outside'?'outside':'inside';
  const p=raw.player;
  if(p&&Number.isFinite(p.x)&&Number.isFinite(p.z)&&Math.abs(p.x)<1000&&Math.abs(p.z)<1000){
    const inside=Math.abs(p.x)<2.5&&p.z> -4.5&&p.z<.5;
    if(s.environment==='inside'&&inside || s.environment==='outside'&&!(Math.abs(p.x)<3.5&&p.z> -5.5&&p.z<5))s.player={x:p.x,z:p.z,heading:Number.isFinite(p.heading)?p.heading:0,firstPerson:p.firstPerson===true};
    else if(s.environment==='outside')s.player={x:0,z:7,heading:0,firstPerson:false};
  }else if(s.environment==='outside')s.player={x:0,z:7,heading:0,firstPerson:false};
  return s;
}
export function complete(s){return s.suit.length===SUIT.length&&s.cargo.length===CARGO.length&&s.refuge&&s.departed&&s.returned;}
export function applyAction(state,action){
  const s=normalize(state),near=(p,d=3)=>Math.hypot(s.player.x-p.x,s.player.z-p.z)<=d;
  if(action.type==='suit'&&SUIT.some(x=>x[0]===action.id))s.suit=validList([...s.suit,action.id],SUIT.map(x=>x[0]));
  if(action.type==='cargo'&&s.environment==='outside'){
    const c=CARGO.find(x=>x.id===action.id);if(c&&near(c))s.cargo=validList([...s.cargo,c.id],CARGO.map(x=>x.id));
  }
  if(action.type==='refuge'&&s.environment==='inside'&&near(REFUGE))s.refuge=true;
  if(action.type==='exit'&&s.environment==='inside'&&near({x:0,z:0},2.8)&&s.suit.length===4){s.environment='outside';s.departed=true;s.player={x:0,z:7,heading:0,firstPerson:false};}
  if(action.type==='enter'&&s.environment==='outside'&&near({x:0,z:6},2.8)){s.environment='inside';s.returned=s.departed;s.player={x:0,z:-.5,heading:Math.PI,firstPerson:true};}
  return s;
}
export function readSave(storage){try{const raw=storage.getItem(SAVE_KEY);return {state:normalize(raw?JSON.parse(raw):null),exists:!!raw};}catch{return {state:freshState(),exists:false,error:true};}}
