/* ============================================================
   地形适配层
   ------------------------------------------------------------
   载具对外界只要两个函数：heightAt(x,z) 和 normalAt(x,z,eps,out)。
   月面版背后是一张烘焙好的高度图；这边背后是 MOLA 实测高程加分形细节。
   两者接口一样，所以物理代码一个字都不用改 —— 这正是当初把
   Rover 的依赖收窄到两个函数的价值。
   ============================================================ */
import * as THREE from 'three';

/**
 * @param {(x:number,z:number,cell?:number)=>number} heightFn 场景自己的高程函数
 * @param {number} cell 采样尺度（米）。车轮接触斑是厘米级，
 *        所以这里要用很小的值，否则车会在自己都看不见的起伏上跳。
 */
export function makeTerrainAdapter(heightFn, cell = 0.05) {
  return {
    heightAt(x, z) {
      return heightFn(x, z, cell);
    },
    /* 法线用中心差分。eps 决定「车轮感觉到多粗的地面」：
       取太小，车轮会去追每一粒砾石的坡度，车身抖得像在筛糠；
       取太大，明显的坎会被抹平，车直接开过去而不是被顶起来。
       0.30 m 大致是轮胎接触斑的尺度，这个量级是对的。 */
    normalAt(x, z, eps = 0.3, out = new THREE.Vector3()) {
      const hL = heightFn(x - eps, z, cell), hR = heightFn(x + eps, z, cell);
      const hD = heightFn(x, z - eps, cell), hU = heightFn(x, z + eps, cell);
      return out.set(hL - hR, 2 * eps, hD - hU).normalize();
    },
  };
}
