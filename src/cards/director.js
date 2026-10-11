// Guidance order is independent of completion evidence. Deferred tasks remain pending.
export function createDirector({deck,load,save,now=Date.now}) {
 const stored=load(),done={...(stored?.done||{})};
 let deferred=[...(stored?.deferred||[])],world=null,previous=null,focus=stored?.focus||null;
 const available=c=>!done[c.id]&&(!c.available||c.available(world));
 const current=()=>deck.find(c=>c.id===focus&&available(c))||deck.find(c=>available(c)&&!deferred.includes(c.id))||deferred.map(id=>deck.find(c=>c.id===id)).find(c=>c&&available(c))||null;
 const persist=()=>save({done:{...done},deferred:[...deferred],focus});
 const finish=c=>{done[c.id]={at:now()};deferred=deferred.filter(id=>id!==c.id);return c;};
 return {
  get current(){return current();},get done(){return {...done};},get pending(){return deck.filter(available);},
  select(id){const c=deck.find(c=>c.id===id&&available(c));if(!c)return false;focus=id;persist();return true;},
  defer(){const c=current();if(!c)return null;deferred=deferred.filter(id=>id!==c.id);deferred.push(c.id);focus=null;persist();return c;},
  tick(snapshot){
   previous=world;world=snapshot;const shown=current();let finished=null,changed=false;
   for(const c of deck){
    if(!available(c)||c.event||!c.done(world))continue;
    // Transient states must have actually changed; an initial "not resting" is not a future achievement.
    if(c!==shown&&!c.recordAhead&&(!previous||c.done(previous)))continue;
    finish(c);changed=true;if(!finished||c===shown)finished=c;
   }
   if(changed)persist();return finished;
  },
  signal(name){
   const shown=current();const c=name==='accept'?(shown?.event===name?shown:null):deck.find(c=>available(c)&&c.event===name);
   if(!c)return null;finish(c);persist();return c;
  },
 };
}
