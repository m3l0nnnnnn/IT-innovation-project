import { useSyncExternalStore, type ReactNode } from 'react';
import { Link, useLocation, type LinkProps } from 'react-router-dom';
import { Eye, Lock, RotateCcw } from 'lucide-react';
import './role-preview.css';

export const DEMO_ROLES=['Administrator','EMS Manager','Field Inspector','Management Viewer'] as const;
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
  'Field Inspector':['/','/cases','/operations/inspections','/operations/map'],
  'Management Viewer':['/','/analytics','/analytics/trends','/analytics/factors','/analytics/scenarios','/alerts','/reports','/assistant']
};
export function isPreviewVisible(role:DemoRole,path:string){
  return permitted[role]===null||permitted[role]?.includes(path)===true;
}
// Module pages some role cannot see. Settings, developer tools and unknown paths are never hidden.
const modulePaths=new Set(Object.values(permitted).flatMap(paths=>paths??[]));
const pathOf=(to:string)=>to.split(/[?#]/)[0].replace(/(.)\/$/,'$1');
/** Whether the current preview role can see the page a link points to (query string ignored). */
export function useCanSee(to:string){
  const path=pathOf(to);
  const role=useDemoRole();
  return !modulePaths.has(path)||isPreviewVisible(role,path);
}
/** A Link that is hidden, or replaced by `fallback`, when the preview role cannot see its page. */
export function RoleLink({fallback=null,...props}:LinkProps&{to:string;fallback?:ReactNode}){
  return useCanSee(props.to)?<Link {...props}/>:<>{fallback}</>;
}
/** Shows a clear message instead of a page the preview role cannot see (e.g. a typed or bookmarked URL). */
export function RoleGate({children}:{children:ReactNode}){
  const role=useDemoRole();
  const {pathname}=useLocation();
  if(useCanSee(pathname))return <>{children}</>;
  return <div className="card rp-blocked" role="alert">
    <Lock size={20}/>
    <div><h2>Not available for {role}</h2>
      <p>This page is outside the {role} role. Use the sidebar to open the pages this role can see.</p>
      <div className="rp-blocked-actions"><Link className="primary-button" to="/">Go to dashboard</Link>
        <button type="button" className="rp-blocked-exit" onClick={()=>setDemoRole('Administrator')}>
          <RotateCcw size={14}/> Exit role preview</button></div></div>
  </div>;
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
