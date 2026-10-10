// 艾琳全身立绘（原件 docs/reference/character-erin/，界面用的 webp 从 cosmos-report-demo/assets 复制，亮度已统一）。
// 名字 → 文件；HEAD 是头顶在图里的位置（横向中心、顶端，占图宽高的比例），对话框头像小窗靠它对准脸。
// HEAD 由 PIL 量透明通道得出（头顶往下 4% 这一条的横向中心），和 demo 手量的六张误差 ≤ 0.011。
const HEADS = {
  approve: [.521, .011], emergency: [.486, .007], farewell: [.491, .010], moved: [.484, .014],
  patient: [.486, .008], 'pointing-tablet': [.470, .009], reassure: [.511, .007], 'relieved-disdain': [.518, .008],
  scolding: [.504, .008], solemn: [.501, .005], 'standing-tablet': [.513, .007], stepping: [.547, .010],
  surprised: [.374, .017], thinking: [.486, .009], tired: [.550, .015], 'walking-pointing': [.450, .015],
  welcome: [.547, .008], worried: [.520, .009],
};
// 简报里用的短名。
const ALIAS = { stand: 'standing-tablet', point: 'pointing-tablet', walk: 'walking-pointing' };
const file = name => ALIAS[name] || name;
export const poseSrc = name => new URL(`../../../assets/erin/${file(name)}.webp`, import.meta.url).href;
export const poseHead = name => HEADS[file(name)] || [.5, .01];
export const hasPose = name => !!HEADS[file(name)];
