// 任务卡上的图：简笔画，不认字也看得懂（D70）。64×64，线条颜色跟着文字色走。
const svg = body => '<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="3" '
  + `stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const ICONS = Object.freeze({
  nursery:svg('<path d="M32 42V28M32 31C17 31 12 24 12 12c14 0 20 7 20 19ZM32 27c0-13 8-19 20-19 0 13-7 19-20 19ZM14 42h36l-4 16H18z"/>'),
  water:svg('<path d="M32 5C24 20 12 30 12 41a20 20 0 0 0 40 0C52 30 40 20 32 5Z"/><path d="M22 42a10 10 0 0 0 10 10"/>'),
  power:svg('<path d="M8 14h48v26H8zM8 26h48M24 14v26M40 14v26M20 52h24M32 40v12"/>'),
  meal:svg('<circle cx="32" cy="32" r="18"/><path d="M8 12v40M4 12v14h8V12M56 12v40"/>'),
  bed:svg('<path d="M8 48V20h14v12h34v16M8 40h48M8 48v8M56 48v8"/>'),
  lab:svg('<path d="M24 8h16M28 8v20L12 50h40L36 28V8M20 40h24"/>'),
  // 一个迈步走的人
  steps: svg('<circle cx="34" cy="11" r="5"/><path d="M33 18l-3 18"/><path d="M33 23l-10 6"/><path d="M33 23l9 8"/>'
    + '<path d="M30 36l10 9 2 12"/><path d="M30 36l-5 10-9 8"/>'),
  // 大车 ARES：六个轮子里画三个，带货斗
  truck: svg('<path d="M6 40V24h30v16"/><path d="M36 28h12l8 8v4H36z"/><path d="M12 24l6-8h12"/>'
    + '<circle cx="16" cy="44" r="5"/><circle cx="30" cy="44" r="5"/><circle cx="48" cy="44" r="5"/>'),
  // 家：前哨仓的拱形舱和门
  home: svg('<path d="M6 46V34c0-10 12-16 26-16s26 6 26 16v12z"/><path d="M26 46V36h12v10"/>'
    + '<path d="M4 46h56"/><circle cx="48" cy="32" r="3"/>'),
  // 通信台：一口锅和两道电波
  antenna: svg('<path d="M32 54V30"/><path d="M22 54h20"/><path d="M18 14c0 8 6 16 14 16s14-8 14-16"/>'
    + '<circle cx="32" cy="16" r="2.5"/><path d="M48 8c3 3 3 9 0 12"/><path d="M54 4c5 6 5 14 0 20"/>'),
  // 小车 MU-7：两片翅膀、一根桅杆
  rover: svg('<path d="M14 38V30h30v8"/><path d="M4 26h20M36 26h24"/><path d="M24 30V20h8"/>'
    + '<rect x="32" y="14" width="8" height="6" rx="1"/>'
    + '<circle cx="14" cy="44" r="5"/><circle cx="29" cy="44" r="5"/><circle cx="44" cy="44" r="5"/>'),
  // 勘测信标：杆子上一颗菱形，地上一圈虚线
  beacon: svg('<path d="M32 56V26"/><path d="M32 8l8 9-8 9-8-9z"/>'
    + '<ellipse cx="32" cy="56" rx="18" ry="4" stroke-dasharray="4 4"/>'),
  // 飞船 NX07：扁机身、四条腿
  ship: svg('<path d="M6 30c7-9 17-13 26-13s19 4 26 13l-7 6H13z"/><path d="M24 23h16"/>'
    + '<path d="M17 36l-6 14"/><path d="M47 36l6 14"/><path d="M27 36l-2 14"/><path d="M37 36l2 14"/>'),
  // 相机
  camera: svg('<rect x="8" y="20" width="48" height="30" rx="5"/><path d="M22 20l4-7h12l4 7"/>'
    + '<circle cx="32" cy="35" r="9"/><circle cx="48" cy="28" r="1.5"/>'),

});
