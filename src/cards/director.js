// 任务卡的导演（D70）：现在该哪张卡、做完了记下来。不认识游戏，只认识 deck 和一张世界快照。
export function createDirector({ deck, load, save, now = Date.now }) {
  const done = { ...(load()?.done || {}) };
  // 牌是一张接一张发的，所以做完的一定是前面一段。老存档里如果夹着后来新插的卡，已经走过它后面的人不用回头补做：
  // 在内存里补记，下次有卡做完时一起存回去。
  const last = deck.findLastIndex(c => done[c.id]);
  deck.forEach((c, i) => { if (i < last && !done[c.id] && !c.required) done[c.id] = { at: done[deck[last].id].at, skipped: true }; });
  let world = null;
  const current = () => { const c = deck.find(c => !done[c.id]); return c && (!c.available || c.available(world)) ? c : null; };
  function finish(card) { done[card.id] = { at: now() }; save({ done: { ...done } }); return card; }
  return {
    get current() { return current(); },
    get done() { return { ...done }; },
    /** 喂一张世界快照。当前这张卡做完了就记下并返回它，否则返回 null。一次最多过一张，好让每张都露一下脸。 */
    tick(snapshot) {
      world = snapshot;
      const card = current();
      return card && !card.event && card.done(world) ? finish(card) : null;
    },
    /** 游戏里发生了一件事（到通信台报到、点了接受任务）。当前这张卡等的正是它，才算做完。 */
    signal(name) {
      const card = current();
      return card && card.event === name ? finish(card) : null;
    },
  };
}
