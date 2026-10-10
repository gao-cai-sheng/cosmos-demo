// Route arrivals round geographic coordinates to four decimals. Resolve only that
// rounding envelope within this mission, so returning home retains parked vehicles.
export function readCarrierSave(storage,kind,site,mission){
 const prefix=`cosmos.carrier.v1:${kind}:`,suffix=`:${mission}`;
 const key=`${prefix}${site.lat}:${site.lon}${suffix}`;
 const read=k=>{try{return JSON.parse(storage.getItem(k)||'null');}catch{return null;}};
 const exact=read(key);if(exact)return {key,value:exact};
 let closest=null,delta=Infinity;
 for(let i=0;i<storage.length;i++){
  const k=storage.key(i);if(!k?.startsWith(prefix)||!k.endsWith(suffix))continue;
  const parts=k.slice(prefix.length,-suffix.length).split(':');if(parts.length!==2)continue;
  const lat=Number(parts[0]),lon=Number(parts[1]);
  const dx=Math.abs(site.lat-lat),dz=Math.abs(((site.lon-lon+540)%360)-180);
  if(dx>.000051||dz>.000051)continue;
  const value=read(k);if(value&&dx+dz<delta){delta=dx+dz;closest={key:k,value};}
 }
 return closest||{key,value:null};
}
