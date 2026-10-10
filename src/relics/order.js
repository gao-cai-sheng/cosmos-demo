// 遗迹任务顺序：离默认着陆场（埃律西昂 4.375°N 135.625°E）由近到远。
// 单独一个文件、不引别的模块：存档（journey/state.js）要用它校验，别把航线图整个拖进来。
export const TASK_ORDER = Object.freeze(['INSG', 'VKG2', 'BGL2', 'INGN', 'VKG1', 'PTHF']);
