// 没拍清时艾琳说的话（D76）。原因（reason、by）来自 src/relics/relic-tasks.js 的 relic:photo 事件。
// 屏幕上那张照片卡照旧写着大人看的字；这里是给认字不多的孩子听的。
const WHO = { ARES: '大车', 'MU-7': '小车', NX07: '飞船', 前哨仓: '家' };   // 卡片上怎么叫，这里就怎么叫
const LINE = {
  none: '镜头里没有它。转过去，对着光柱。', behind: '镜头里没有它。转过去，对着光柱。',
  edge: '偏了一点。把它放到画面中间。', small: '太远了，再走近一点。',
  blocked: '被土坡挡住了，换个地方。', air: '飞近一点再拍。',
};
/** detail：relic:photo 事件带的那一份（ok、reason、by）。拍到了返回 ''。 */
export function photoHint(detail) {
  if (!detail || detail.ok) return '';
  if (detail.reason === 'occluded') return `被${WHO[detail.by] || '东西'}挡住了，往旁边走几步。`;
  return LINE[detail.reason] || '没拍清，再试一次。';
}
