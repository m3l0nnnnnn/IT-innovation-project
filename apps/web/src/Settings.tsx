import { useState, type FormEvent, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  BellRing, Check, CheckCircle2, CircleUserRound, KeyRound, LockKeyhole,
  Mail, Monitor, Moon, RotateCcw, ShieldCheck, Smartphone, Sun, UserRound
} from 'lucide-react';
import {
  applyColorMode, SETTINGS_KEY,
  type ColorMode
} from './appearance';
import './account-settings.css';

type Section = 'profile' | 'appearance' | 'notifications' | 'security';
type Preferences = {
  warningUpdates: boolean;
  actionReminders: boolean;
  weeklyDigest: boolean;
  colorMode: ColorMode;
};
type DemoAccount = {
  profile: { displayName: string; jobTitle: string };
  preferences: Preferences;
};

const INITIAL: DemoAccount = {
  profile: { displayName: 'Demo Manager', jobTitle: 'Town Council Operations' },
  preferences: {
    warningUpdates: true,
    actionReminders: true,
    weeklyDigest: false,
    colorMode: 'system'
  }
};
const sections: { id: Section; title: string; description: string; icon: typeof UserRound }[] = [
  { id: 'profile', title: 'My profile', description: 'Personal details', icon: UserRound },
  { id: 'appearance', title: 'Appearance', description: 'Theme and display', icon: Monitor },
  { id: 'notifications', title: 'Notifications', description: 'Alert preferences', icon: BellRing },
  { id: 'security', title: 'Security', description: 'Account protection', icon: ShieldCheck }
];

function readAccount(): DemoAccount {
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}') as Partial<DemoAccount>;
    const profile = saved?.profile;
    const prefs = saved?.preferences;
    return {
      profile: {
        displayName: typeof profile?.displayName === 'string' ? profile.displayName.slice(0, 64) : INITIAL.profile.displayName,
        jobTitle: typeof profile?.jobTitle === 'string' ? profile.jobTitle.slice(0, 64) : INITIAL.profile.jobTitle
      },
      preferences: {
        warningUpdates: typeof prefs?.warningUpdates === 'boolean' ? prefs.warningUpdates : INITIAL.preferences.warningUpdates,
        actionReminders: typeof prefs?.actionReminders === 'boolean' ? prefs.actionReminders : INITIAL.preferences.actionReminders,
        weeklyDigest: typeof prefs?.weeklyDigest === 'boolean' ? prefs.weeklyDigest : INITIAL.preferences.weeklyDigest,
        colorMode: prefs?.colorMode === 'light' || prefs?.colorMode === 'dark' ? prefs.colorMode : 'system'
      }
    };
  } catch {
    return INITIAL;
  }
}

function SectionHeading({ icon, title, detail }: { icon: ReactNode; title: string; detail: string }) {
  return <div className="account-panel-heading"><div className="account-panel-icon">{icon}</div><div><h2>{title}</h2><p>{detail}</p></div></div>;
}

function Toggle({ title, detail, checked, onChange }: {
  title: string;
  detail: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return <label className="account-toggle-row">
    <span><strong>{title}</strong><small>{detail}</small></span>
    <input className="account-toggle" type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)}/>
  </label>;
}

function SecurityRow({ icon, title, detail }: { icon: ReactNode; title: string; detail: string }) {
  return <div className="account-security-row"><div className="account-security-icon">{icon}</div><div className="account-security-copy"><strong>{title}</strong><small>{detail}</small></div><span className="account-status">Not connected</span></div>;
}

export default function SettingsPage() {
  const [sectionParams, setSectionParams] = useSearchParams();
  const requestedSection = sectionParams.get('section');
  const section: Section =
    requestedSection === 'appearance' || requestedSection === 'notifications' || requestedSection === 'security'
      ? requestedSection
      : 'profile';
  const [account, setAccount] = useState<DemoAccount>(readAccount);
  const [displayName, setDisplayName] = useState(account.profile.displayName);
  const [jobTitle, setJobTitle] = useState(account.profile.jobTitle);
  const [feedback, setFeedback] = useState('');
  const [error, setError] = useState('');

  function save(next: DemoAccount, message: string): void {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
      setAccount(next);
      window.dispatchEvent(new Event('estara-account-updated'));
      applyColorMode(next.preferences.colorMode);
      setError('');
      setFeedback(message);
    } catch {
      setError('Unable to save. Enable browser storage and try again.');
      setFeedback('');
    }
  }

  function updatePreference<K extends keyof Preferences>(key: K, value: Preferences[K]): void {
    save({
      ...account,
      preferences: { ...account.preferences, [key]: value }
    }, 'Preferences saved to this browser.');
  }

  function saveProfile(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const name = displayName.trim();
    if (name.length < 2) {
      setError('Display name must have at least two characters.');
      setFeedback('');
      return;
    }
    save({
      ...account,
      profile: { displayName: name, jobTitle: jobTitle.trim() }
    }, 'Demo profile saved to this browser.');
  }

  function reset(): void {
    try {
      localStorage.removeItem(SETTINGS_KEY);
      setAccount(INITIAL);
      window.dispatchEvent(new Event('estara-account-updated'));
      setDisplayName(INITIAL.profile.displayName);
      setJobTitle(INITIAL.profile.jobTitle);
      applyColorMode('system');
      setError('');
      setFeedback('Browser-only settings restored to defaults.');
    } catch {
      setError('Unable to reset settings because browser storage is unavailable.');
      setFeedback('');
    }
  }

  const initials = account.profile.displayName.trim().split(/\s+/).slice(0, 2).map(x => x[0]?.toUpperCase() ?? '').join('') || 'DM';
  return <div className="account-page">
    <div className="page-header">
      <div><p className="eyebrow">PERSONAL WORKSPACE</p><h1>Account settings</h1><p className="subtext">Your profile, display and notification preferences in one place.</p></div>
      <span className="account-demo-chip"><ShieldCheck size={14}/> Demo account</span>
    </div>
    <div className="account-layout">
      <aside className="account-nav-panel">
        <div className="account-identity"><div className="account-avatar">{initials}</div><div><strong>{account.profile.displayName}</strong><small>EMS Manager · Demo</small></div></div>
        <nav className="account-sections" aria-label="Account settings sections">
          {sections.map(item => <button key={item.id} type="button" className={'account-section-link' + (item.id === section ? ' selected' : '')} aria-pressed={item.id === section} onClick={() => { setSectionParams({ section: item.id }); setError(''); setFeedback(''); }}><item.icon size={18}/><span><strong>{item.title}</strong><small>{item.description}</small></span></button>)}
        </nav>
        <div className="account-nav-foot"><ShieldCheck size={16}/><span>Demo settings are saved only in this browser, not to an EMS account.</span></div>
      </aside>
      <div className="account-content">
        {error && <div className="account-message error" role="alert">{error}</div>}
        {feedback && <div className="account-message" role="status"><CheckCircle2 size={16}/>{feedback}</div>}

        {section === 'profile' && <section className="card account-panel" aria-label="My profile">
          <SectionHeading icon={<CircleUserRound size={20}/>} title="My profile" detail="Details displayed in your Estara demo workspace."/>
          <div className="account-profile-overview"><div className="account-avatar large">{initials}</div><div><strong>{account.profile.displayName}</strong><small>Illustrative account · Not signed in</small></div><span className="account-neutral-pill">DEMO</span></div>
          <form onSubmit={saveProfile}>
            <div className="account-fields">
              <label><span>Display name</span><input value={displayName} required minLength={2} maxLength={64} autoComplete="off" onChange={e=>setDisplayName(e.target.value)}/></label>
              <label><span>Job title</span><input value={jobTitle} maxLength={64} autoComplete="off" onChange={e=>setJobTitle(e.target.value)}/></label>
              <label><span>Email address</span><input readOnly value="Not configured for demo" aria-label="Email address not configured"/></label>
              <label><span>Access role</span><input readOnly value="EMS Manager (example)"/></label>
            </div>
            <div className="account-actions"><p>Only display name and job title can be saved in this prototype.</p><button type="submit" className="primary-button">Save changes</button></div>
          </form>
        </section>}

        {section === 'appearance' && <section className="card account-panel" aria-label="Appearance">
          <SectionHeading icon={<Monitor size={20}/>} title="Appearance" detail="Choose how Estara looks on this device."/>
          <div className="account-group-heading"><h3>Colour theme</h3><p>Select a theme or match your computer's appearance automatically.</p></div>
          <div className="account-themes" role="group" aria-label="Colour theme">
            {([
              { id: 'light' as const, title: 'Light', detail: 'Bright and clear', icon: Sun },
              { id: 'dark' as const, title: 'Dark', detail: 'Easy on the eyes', icon: Moon },
              { id: 'system' as const, title: 'Follow system', detail: 'Match your device', icon: Monitor }
            ]).map(mode=><button key={mode.id} type="button" className={'account-theme-option'+(account.preferences.colorMode === mode.id?' active':'')} onClick={()=>updatePreference('colorMode',mode.id)} aria-pressed={account.preferences.colorMode === mode.id}>
              <div className={'account-theme-preview '+mode.id}><div className="preview-side"/><div className="preview-main"><span/><span/><div><i/><i/></div></div></div>
              <div className="account-theme-caption"><mode.icon size={17}/><strong>{mode.title}</strong>{account.preferences.colorMode===mode.id&&<Check className="account-theme-check" size={15}/>}</div><small>{mode.detail}</small>
            </button>)}
          </div>
          <p className="account-helper">Your choice is applied immediately and remembered in this browser. “Follow system” tracks Windows/macOS theme changes automatically.</p>
        </section>}

        {section === 'notifications' && <section className="card account-panel" aria-label="Notification preferences">
          <SectionHeading icon={<BellRing size={20}/>} title="Notification preferences" detail="Decide which updates you would like to receive later."/>
          <div className="account-feature-note"><Mail size={17}/><p>These are preferences only. Email, Teams and push notifications are not connected in the demo.</p></div>
          <Toggle title="Early-warning updates" detail="Watch, Warning and Critical risk alerts." checked={account.preferences.warningUpdates} onChange={v=>updatePreference('warningUpdates',v)}/>
          <Toggle title="Corrective-action reminders" detail="Deadlines and actions needing follow-up." checked={account.preferences.actionReminders} onChange={v=>updatePreference('actionReminders',v)}/>
          <Toggle title="Weekly performance digest" detail="A summary of performance changes and open risks." checked={account.preferences.weeklyDigest} onChange={v=>updatePreference('weeklyDigest',v)}/>
        </section>}

        {section === 'security' && <section className="card account-panel" aria-label="Security">
          <SectionHeading icon={<LockKeyhole size={20}/>} title="Security" detail="Account protection features planned for the full system."/>
          <div className="account-feature-note"><ShieldCheck size={17}/><p>Estara does not have real user accounts yet. Security controls below are placeholders, not working account actions.</p></div>
          <SecurityRow icon={<KeyRound size={19}/>} title="Password" detail="Set or change your password after authentication is implemented."/>
          <SecurityRow icon={<Smartphone size={19}/>} title="Two-factor authentication" detail="Require a second verification step for sign-in."/>
          <SecurityRow icon={<CircleUserRound size={19}/>} title="Active sessions" detail="Review and revoke active signed-in devices."/>
        </section>}

        <div className="account-bottom-bar"><span>Estara prototype · Local preferences only</span><button type="button" className="account-reset" onClick={reset}><RotateCcw size={15}/> Reset demo settings</button></div>
      </div>
    </div>
  </div>;
}
