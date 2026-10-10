/* 一张照片算不算「拍到了遗迹」。输入都是数，node 里能测。
 * ndc：遗迹包围盒 8 个角投影后的 NDC 坐标 [{x,y,z}]（three 的 Vector3.project）；
 * los：相机到遗迹中心之间没被地形挡住；
 * cover：遗迹在画面上的像素还剩多少看得见、主要被谁挡（coverFromPixels 的结果；没有就不查）。
 * 规则（spec 2026-09-30）：中心在画面中间 80% 以内；包围盒在画面上够大；没被挡住。
 * D71 补：载具、建筑挡掉一半以上（看得见的不到 minVisible）也不算，并说出是谁挡的。
 * 「够大」看宽和高里较大的那个占画面的比例 ≥ 12%：只看高度的话，猎兔犬 2 号（0.38 m 高、2 m 宽）
 * 要趴到跟前才算，第三人称下人自己就把它挡住了。 */
export const PHOTO_RULE = Object.freeze({ center: 0.8, minSize: 0.12, minVisible: 0.5 });

export function judgePhoto({ ndc, los, cover = null }) {
  // 有角落在相机后面（投影 z 越出 [-1,1]）就不算：人贴着遗迹、或者背对着它。
  if (!ndc.length || ndc.some(p => p.z > 1 || p.z < -1)) return { ok: false, reason: 'behind' };
  const xs = ndc.map(p => p.x), ys = ndc.map(p => p.y);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  if (Math.abs(cx) > PHOTO_RULE.center || Math.abs(cy) > PHOTO_RULE.center) return { ok: false, reason: 'edge' };
  // 画面里能看到的那一段宽、高，各占整幅的比例（NDC 宽高都是 2）。
  const span = v => (Math.min(1, Math.max(...v)) - Math.max(-1, Math.min(...v))) / 2;
  const size = Math.max(span(xs), span(ys));
  if (size < PHOTO_RULE.minSize) return { ok: false, reason: 'small', size };
  if (!los) return { ok: false, reason: 'blocked', size };
  if (cover && cover.visible < PHOTO_RULE.minVisible) return { ok: false, reason: 'occluded', by: cover.by, visible: cover.visible, size };
  return cover ? { ok: true, size, visible: cover.visible } : { ok: true, size };
}

/* 遗迹在画面上还剩多少看得见（D71）。两张同样大小的 id 图（RGBA 字节，只看红）：
 * alone：只画遗迹，红 255；mixed：遗迹画完，再把遮挡物按深度一个个画上去，第 k 个红 = (k+1)·OCCLUDER_STEP。
 * 只数 alone 里是遗迹的像素：mixed 里还是 255 的算看得见，变成别的就记到那个遮挡物名下（同名的合在一起）。
 * 返回 { pixels, visible: 0~1, by: 挡得最多的那个名字 | null }；画面上一个遗迹像素都没有时返回 null（没法判）。 */
export const OCCLUDER_STEP = 16;
export function coverFromPixels(alone, mixed, names) {
  let pixels = 0, seen = 0;
  const lost = new Map();
  for (let i = 0; i < alone.length; i += 4) {
    if (alone[i] < 128) continue;
    pixels++;
    const name = names[Math.round(mixed[i] / OCCLUDER_STEP) - 1];
    if (mixed[i] > 255 - OCCLUDER_STEP / 2 || name === undefined) seen++;
    else lost.set(name, (lost.get(name) || 0) + 1);
  }
  if (!pixels) return null;
  const top = [...lost].sort((a, b) => b[1] - a[1])[0];
  return { pixels, visible: seen / pixels, by: top ? top[0] : null };
}
