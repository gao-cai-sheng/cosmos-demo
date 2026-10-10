import * as THREE from 'three';
import {GLTFLoader} from '../../vendor/three/examples/jsm/loaders/GLTFLoader.js';

/** EVA suit from blender/astronaut-hy3d (Hunyuan 3D four-view model, skinned in Blender).
 * Feet at y=0, +Z forward, 1.90 m. Each call loads its own copy: a skinned mesh cannot share
 * bones, and three's Object3D.clone(true) would leave copies bound to the original skeleton.
 * The GLB also carries eight baked locomotion clips (retarget.py); `clips` hands them to an
 * AnimationMixer, and `pose()` is the manual override that puts every bone back where the rig
 * authored it before applying its own angles - the mixer leaves bones wherever it stopped. */
export const ASTRONAUT_URL=new URL('../../assets/models/astronaut.glb',import.meta.url).href;
const JOINTS=['thigh_L','thigh_R','shin_L','shin_R','upperarm_L','upperarm_R','forearm_L','forearm_R'];
/** Ankle to toe along the foot bone's own +Y, metres. From rig_export.py's JOINTS; a bone carries no
 * length through glTF, so it is restated here and checked against the rest pose on load. */
export const FOOT_LENGTH=.2193;

export function loadAstronautModel(){
  return new GLTFLoader().loadAsync(ASTRONAUT_URL).then(({scene:model,animations:clips})=>{
    model.name='EVA suit model';model.updateMatrixWorld(true);
    const joints={},home=[],bones={},world=new THREE.Quaternion();let helmet=null;
    model.traverse(o=>{
      // Glass visor and the liner inside the helmet stay out of the shadow map.
      if(o.isMesh){o.castShadow=!o.material.transparent&&o.material.name!=='EVA helmet liner';o.receiveShadow=true;o.frustumCulled=false;}
      // Shell, visor, liner and head: one multi-material node, hidden together for the cockpit view.
      if(o.name==='Helmet'&&!helmet){o.name='Helmet shell';helmet=o;}
      if(o.isBone){bones[o.name]=o;home.push({bone:o,position:o.position.clone(),quaternion:o.quaternion.clone()});}
      if(o.isBone&&JOINTS.includes(o.name)){
        // Hinge about the model's X axis, expressed in the parent's rest frame so a child
        // (shin, forearm) keeps bending about its own knee/elbow when the parent swings.
        o.parent.getWorldQuaternion(world);
        joints[o.name]={bone:o,rest:o.quaternion.clone(),axis:new THREE.Vector3(1,0,0).applyQuaternion(world.invert())};
      }
    });
    if(!helmet||Object.keys(joints).length!==JOINTS.length)throw Error('astronaut.glb is missing its helmet or joints');
    // Ankles, plus how high each one rides when the suit stands flat: boot prints compare the live
    // bone height against that, so a planted foot reads as zero clearance on any terrain.
    const feet=[bones.foot_L,bones.foot_R],probe=new THREE.Vector3();
    const footRest=feet.map(bone=>{
      bone.getWorldPosition(probe);
      const ankle=probe.y;
      const toe=bone.localToWorld(probe.set(0,FOOT_LENGTH,0)).y;
      if(!(toe>0&&toe<ankle))throw Error(`FOOT_LENGTH no longer matches the rig: toe rest ${toe.toFixed(3)} m`);
      return {ankle,toe};
    });
    /** Angles in radians about model X; the same signs the rigid-part astronaut used. Missing joints
     * rest. Every bone is returned to the rest pose first, so this also undoes a stopped clip. */
    function pose(angles={}){
      for(const h of home){h.bone.position.copy(h.position);h.bone.quaternion.copy(h.quaternion);}
      for(const [name,j] of Object.entries(joints))j.bone.quaternion.setFromAxisAngle(j.axis,angles[name]||0).multiply(j.rest);
    }
    // Unskinned rest-pose copy for thumbnails: the deck portrait copies its subject with clone(true).
    const statue=new THREE.Group();statue.name='EVA suit statue';
    model.traverse(o=>{if(o.isSkinnedMesh){const m=new THREE.Mesh(o.geometry,o.material);m.name=o.name;m.matrixAutoUpdate=false;m.matrix.copy(o.matrixWorld);statue.add(m);}});
    return {model,helmet,pose,statue,clips,bones,feet,footRest};
  });
}
