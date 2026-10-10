// 艾琳出声（D70）。正式配音没定以前，用浏览器自带的中文语音占位：不用备音频文件，不联网。
// 以后换成录好的音频，只换这一个文件，speak(text) 的接口不变。
export function createVoice({ enabled = () => true, synth = globalThis.speechSynthesis,
  Utterance = globalThis.SpeechSynthesisUtterance } = {}) {
  let voice = null;
  // 先找普通话（zh-CN）；没有再退到别的中文语音。直接按 zh 找，Mac 上可能先挑到粤语。
  const pick = () => {
    const all = synth?.getVoices?.() || [];
    voice = all.find(v => /^zh[-_]CN/i.test(v.lang)) || all.find(v => /^zh/i.test(v.lang)) || null;
  };
  pick();
  synth?.addEventListener?.('voiceschanged', pick);   // Chrome 的语音列表是晚一点才到的
  return {
    get available() { return !!synth && !!Utterance; },
    /** 说一句。前面还有话排着队没说，就先清掉，免得一口气念一串过时的。说了返回 true。 */
    speak(text) {
      if (!synth || !Utterance || !text || !enabled()) return false;
      if (synth.pending) synth.cancel();
      if (!voice) pick();
      const u = new Utterance(text);
      u.lang = 'zh-CN'; u.rate = .95; u.pitch = 1.1;
      if (voice) u.voice = voice;
      synth.speak(u);
      return true;
    },
    stop() { synth?.cancel(); },
  };
}
