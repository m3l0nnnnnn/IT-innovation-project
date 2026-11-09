import { useSyncExternalStore } from 'react';
import { Eye, RotateCcw } from 'lucide-react';
import './role-preview.css';

export const DEMO_ROLES=['Administrator','EMS Manager','Estate Officer','Field Inspector','Management Viewer'] as const;
export type DemoRole=typeof DEMO_ROLES[number];
let current:DemoRole='Administrator';
try {
  const saved=window.sessionStorage.getItem('estara-demo-preview-role');
  if(DEMO_ROLES.some(role=>role===saved))current=saved as DemoRole;
}catch{/* Available even when sessionStorage is blocked. */}
const listeners=new Set<()=>void>();
const subscribe=(listener:()=>void)=>{listeners.add(listener);return ()=>{listeners.delete(listener);};};
const snapshot=()=>current;
/** The current preview role, for API calls outside React (sent as X-Estara-Role; demo only, not a permission check). */
export function getDemoRole(){return current;}
export function useDemoRole(){return useSyncExternalStore(subscribe,snapshot,()=>('Administrator' as DemoRole));}
export function setDemoRole(role:DemoRole){
  current=role;
  try{window.sessionStorage.setItem('estara-demo-preview-role',role);}catch{/* In-memory preview still works. */}
  listeners.forEach(listener=>listener());
}
/** UI navigation only: this is never a permission check. API access is not gated here. */
const permitted:Record<DemoRole,string[]|null>={
  'Administrator':null,
  'EMS Manager':['/','/cases','/operations/insights','/operations/hotspots','/operations/inspections','/operations/map',
    '/analytics','/analytics/trends','/analytics/factors','/analytics/settings','/analytics/scenarios',
    '/alerts','/actions','/risk/rules','/risk/replay','/reports','/assistant'],
  'Estate Officer':['/','/cases','/operations/insights','/operations/hotspots','/operations/inspections','/operations/map','/alerts','/actions'],
  'Field Inspector':['/','/cases','/operations/inspections','/operations/map'],
  'Management Viewer':['/','/analytics','/analytics/trends','/analytics/factors','/analytics/scenarios','/alerts','/reports','/assistant']
};
export function isPreviewVisible(role:DemoRole,path:string){
  return permitted[role]===null||permitted[role]?.includes(path)===true;
}
export function RoleBanner(){
  const role=useDemoRole();
  return <div className={'rp-banner'+(role==='Administrator'?' rp-admin':'')} role="status">
    <Eye size={17}/>
    <span>{role==='Administrator'
      ?'Administrator demo · All prototype modules shown · No authentication configured'
      :'Viewing as '+role+' · Navigation preview only; real permissions are NOT enforced'}</span>
    {role!=='Administrator'&&<button type="button" onClick={()=>setDemoRole('Administrator')}>
      <RotateCcw size={14}/> Exit role preview</button>}
  </div>;
}
export function RolePicker(){
  const role=useDemoRole();
  return <label className="rp-picker">View as role
    <select value={role} onChange={e=>setDemoRole(e.target.value as DemoRole)}>
      {DEMO_ROLES.map(name=><option key={name} value={name}>{name}</option>)}
    </select>
    <small>Visual preview, not account switching</small>
  </label>;
}
