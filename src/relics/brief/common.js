// 各份简报共用的片段。
/** 任务那一段的档案卡：这一轮只拍照（D65）；怎么处理遗迹（读数据 / 搬走）还没定，卡上也照实说。 */
export function photoTask(title, sub = '步行靠近按 K；落不下就悬停在 400 m 内，用机腹相机拍') {
  return {
    id: 'task', short: '任务', kick: '任务', title,
    items: [{ ic: '1', t: '拍一张看得清的照片', sub }],
    foot: ['<b>◆ 先别碰它</b>', '怎么处理，地球这边还在商量'],
  };
}
