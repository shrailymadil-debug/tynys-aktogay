const fs=require('fs'),path=require('path'),vm=require('vm');
const ui=path.resolve(__dirname,'../ui'),cache=new Map();
async function moduleAt(file){if(cache.has(file))return cache.get(file);const m=new vm.SourceTextModule(fs.readFileSync(file,'utf8'),{identifier:file});cache.set(file,m);await m.link(spec=>moduleAt(spec==='three'?path.join(ui,'vendor/three.module.js'):path.resolve(path.dirname(file),spec)));return m;}
(async()=>{const m=await moduleAt(path.join(ui,'scene-details.js'));await m.evaluate();const THREE=cache.get(path.join(ui,'vendor/three.module.js')).namespace,merge=m.namespace.mergeStaticMeshes;
const root=new THREE.Group();root.position.set(33,7,-24);root.rotation.set(.1,.4,-.2);root.scale.set(.8,.9,.7);const bed=new THREE.Group();bed.position.set(-2,4,1);bed.rotation.z=.15;root.add(bed);
const yellow=new THREE.MeshStandardMaterial({color:0xffbb11}),dark=new THREE.MeshStandardMaterial({color:0x111111});
for(let i=0;i<6;i++){const a=new THREE.Mesh(new THREE.BoxGeometry(2,3,4),i%2?yellow:dark);a.position.set(i,2-i*.2,-i);(i<3?root:bed).add(a);}
const cargo=new THREE.Mesh(new THREE.SphereGeometry(2,8,4),yellow);cargo.position.set(1,5,0);root.add(cargo);
const glow=new THREE.Object3D();root.add(glow);
function vertices(object){object.updateWorldMatrix(true,true);const out=[];object.traverse(o=>{if(!o.isMesh)return;const g=o.geometry.index?o.geometry.toNonIndexed():o.geometry;const p=g.attributes.position,v=new THREE.Vector3();for(let i=0;i<p.count;i++){v.fromBufferAttribute(p,i).applyMatrix4(o.matrixWorld);out.push([v.x,v.y,v.z].map(n=>n.toFixed(4)).join(','));}if(g!==o.geometry)g.dispose();});return out.sort();}
const before=vertices(root),stats=merge(root,[cargo,glow],{local:true}),after=vertices(root);
if(JSON.stringify(before)!==JSON.stringify(after))throw new Error('World-space geometry changed when batching local parts');
if(cargo.parent!==root||glow.parent!==root)throw new Error('Independent cargo/glow lost');
if(stats.before!==7||stats.after!==3)throw new Error('Expected 7 -> 3 meshes: '+JSON.stringify(stats));
const drum=new THREE.Mesh(new THREE.CylinderGeometry(2,2,5,12),dark);drum.position.set(20,2,3);drum.rotation.y=.2;for(let i=0;i<3;i++){const a=new THREE.Mesh(new THREE.BoxGeometry(2,.2,.4),yellow);a.position.set(i,2,1);drum.add(a);}const db=vertices(drum);const ds=merge(drum,[],{local:true});if(JSON.stringify(db)!==JSON.stringify(vertices(drum))||drum.children.length!==1)throw new Error('Mesh-root drum batching changed geometry');
console.log(JSON.stringify({localWorldGeometry:'PASS',cargoAndGlow:'PASS',truck:stats,drum:ds}));
})().catch(e=>{console.error(e);process.exitCode=1});
