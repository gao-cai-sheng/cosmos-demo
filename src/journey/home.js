import { readSave, complete } from '../survival/state.js';
import { getJourney, startJourney, sceneURL, resumeScene, journeyStage } from './state.js';
const state = getJourney();
const start = document.getElementById('start');
const resume = document.getElementById('resume');
const dialog = document.getElementById('new-game');
function launch() { startJourney(); location.href = sceneURL('orbit'); }
if (state) {
  const names = { orbit:'轨道选址', survey:'地表勘测', deploy:'部署穹顶', build:'建设先遣站', complete:'返回先遣站' };
  resume.hidden = false; resume.classList.add('primary'); start.classList.remove('primary');
  resume.textContent = '继续探索 · ' + names[journeyStage(state)];
  start.textContent = '新任务';
  document.getElementById('save-note').textContent = `${state.site.name} · ${state.survey.length} / 3 份勘测 · ${state.campuses.length} 座穹顶 · 本机存档`;
}
resume.addEventListener('click', () => { location.href = sceneURL(resumeScene()); });
start.addEventListener('click', () => state ? dialog.showModal() : launch());
document.getElementById('cancel-new').addEventListener('click', () => dialog.close());
document.getElementById('confirm-new').addEventListener('click', launch);

try { const survival=readSave(localStorage); if(survival.exists){ document.querySelector("#survival-start strong").textContent=complete(survival.state)?"物资检查已完成 · 返回营地 ↗":"继续生存准备 ↗"; } } catch {}
