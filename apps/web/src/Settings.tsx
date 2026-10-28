import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { BellRing, CheckCircle2, CircleUserRound, Eye, KeyRound, LockKeyhole, Mail, MonitorCog, RefreshCcw, ShieldCheck, Smartphone, UserRound, VolumeX } from 'lucide-react';

type Density = 'comfortable' | 'compact';
type Preferences = {
  warningUpdates: boolean;
  actionReminders: boolean;
  weeklyDigest: boolean;
  density: Density;
  reduceMotion: boolean;
};
type DemoAccount = {
  profile: { displayName: string; jobTitle: string };
  preferences: Preferences;
};
const STORAGE_KEY = 'estara.demo.account-settings.v1';
const DEFAULTS: DemoAccount = {
  profile: { displayName: 'Demo Manager', jobTitle: 'Town Council Operations' },
  preferences: {
    warningUpdates: true,
    actionReminders: true,
    weeklyDigest: false,
    density: 'comfortable',
    reduceMotion: false
  }
};

function loadSettings(): DemoAccount {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const saved = JSON.parse(raw) as Partial<DemoAccount>;
    const profile = saved?.profile;
    const prefs = saved?.preferences;
    return {
      profile: {
        displayName: typeof profile?.displayName === 'string' ? profile.displayName.slice(0, 64) : DEFAULTS.profile.displayName,
        jobTitle: typeof profile?.jobTitle === 'string' ? profile.jobTitle.slice(0, 64) : DEFAULTS.profile.jobTitle
      },
      preferences: {
        warningUpdates: typeof prefs?.warningUpdates === 'boolean' ? prefs.warningUpdates : DEFAULTS.preferences.warningUpdates,
        actionReminders: typeof prefs?.actionReminders === 'boolean' ? prefs.actionReminders : DEFAULTS.preferences.actionReminders,
        weeklyDigest: typeof prefs?.weeklyDigest === 'boolean' ? prefs.weeklyDigest : DEFAULTS.preferences.weeklyDigest,
        density: prefs?.density === 'compact' ? 'compact' : 'comfortable',
        reduceMotion: typeof prefs?.reduceMotion === 'boolean' ? prefs.reduceMotion : DEFAULTS.preferences.reduceMotion
      }
    };
  } catch {
    return DEFAULTS;
  }
}

function IconCircle({ children }: { children: ReactNode }) {
  return <div className="settings-section-icon">{children}</div>;
}
function ToggleRow({ label, detail, checked, onChange }: {
  label: string;
  detail: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return <label className="settings-toggle-row">
    <span className="settings-row-copy"><strong>{label}</strong><small>{detail}</small></span>
    <input type="checkbox" className="settings-toggle" checked={checked} onChange={e => onChange(e.target.checked)} />
  </label>;
}

export default function SettingsPage() {
  const [account, setAccount] = useState<DemoAccount>(loadSettings);
  const [displayName, setDisplayName] = useState(account.profile.displayName);
  const [jobTitle, setJobTitle] = useState(account.profile.jobTitle);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    document.documentElement.dataset.density = account.preferences.density;
    document.documentElement.dataset.reduceMotion = String(account.preferences.reduceMotion);
  }, [account.preferences.density, account.preferences.reduceMotion]);

  function persist(next: DemoAccount, message: string) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      setAccount(next);
      setError('');
      setNotice(message);
    } catch {
      setError('Browser storage is unavailable. Your changes were not saved.');
      setNotice('');
    }
  }

  function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = displayName.trim();
    const title = jobTitle.trim();
    if (name.length < 2) {
      setError('Display name must contain at least two characters.');
      setNotice('');
      return;
    }
    persist({ ...account, profile: { displayName: name, jobTitle: title } }, 'Demo profile saved in this browser.');
  }

  function updatePreference<K extends keyof Preferences>(key: K, value: Preferences[K]) {
    persist({ ...account, preferences: { ...account.preferences, [key]: value } }, 'Preference saved in this browser. No real notifications have been enabled.');
  }

  function resetSettings() {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
      setAccount(DEFAULTS);
      setDisplayName(DEFAULTS.profile.displayName);
      setJobTitle(DEFAULTS.profile.jobTitle);
      setError('');
      setNotice('Demo settings reset to defaults.');
    } catch {
      setError('Could not reset settings because browser storage is unavailable.');
      setNotice('');
    }
  }

  const initials = account.profile.displayName.trim().split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('') || 'DM';

  return <div className="settings-page">
    <header className="page-header">
      <div><p className="eyebrow">MY WORKSPACE</p><h1>Account settings</h1><p className="subtext">Manage your demo profile, notification preferences, and display options.</p></div>
      <span className="settings-demo-label"><ShieldCheck size={15}/> Local demo account</span>
    </header>
    <div className="settings-info-note">
      <ShieldCheck size={18}/>
      <div><strong>Demonstration mode</strong><p>Changes on this page are saved only to this browser. Estara has no live accounts, email delivery, or authentication yet. Do not enter real personal or organisation information.</p></div>
    </div>
    {error && <div className="settings-feedback settings-feedback-error" role="alert">{error}</div>}
    {notice && <div className="settings-feedback" role="status"><CheckCircle2 size={17}/>{notice}</div>}

    <div className="settings-layout">
      <div className="settings-main">
        <section className="card settings-section">
          <div className="settings-section-heading"><IconCircle><UserRound size={19}/></IconCircle><div><h2>Personal information</h2><p>Update how your demonstration profile is displayed.</p></div></div>
          <form onSubmit={saveProfile}>
            <div className="settings-profile-banner"><div className="settings-avatar" aria-hidden="true">{initials}</div><div><strong>{account.profile.displayName}</strong><p>EMS Manager · Demonstration account</p></div></div>
            <div className="settings-fields">
              <label><span>Display name</span><input autoComplete="off" required minLength={2} maxLength={64} value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="Display name"/></label>
              <label><span>Job title</span><input autoComplete="off" maxLength={64} value={jobTitle} onChange={e => setJobTitle(e.target.value)} placeholder="Job title"/></label>
              <label><span>Sign-in email</span><input type="text" readOnly value="Not configured (demo)" aria-description="A real login account has not been created."/></label>
              <label><span>Account role</span><input type="text" readOnly value="EMS Manager (illustrative)" /></label>
            </div>
            <div className="settings-form-footer"><small>Name and job title are browser-only demo fields.</small><button className="primary-button" type="submit">Save profile</button></div>
          </form>
        </section>

        <section className="card settings-section">
          <div className="settings-section-heading"><IconCircle><BellRing size={19}/></IconCircle><div><h2>Notification preferences</h2><p>Set your preferences for future Estara notifications.</p></div></div>
          <ToggleRow label="Early-warning alerts" detail="Preference for Watch, Warning and Critical alert updates." checked={account.preferences.warningUpdates} onChange={v => updatePreference('warningUpdates', v)}/>
          <ToggleRow label="Corrective-action reminders" detail="Preference for upcoming deadlines and assigned follow-ups." checked={account.preferences.actionReminders} onChange={v => updatePreference('actionReminders', v)}/>
          <ToggleRow label="Weekly performance summary" detail="Preference for a weekly KPI and risk digest." checked={account.preferences.weeklyDigest} onChange={v => updatePreference('weeklyDigest', v)}/>
          <p className="settings-section-hint"><Mail size={15}/> These switches save preferences only. They do not send emails, Teams messages, or push notifications.</p>
        </section>

        <section className="card settings-section">
          <div className="settings-section-heading"><IconCircle><MonitorCog size={19}/></IconCircle><div><h2>Display & accessibility</h2><p>Personalise how the Estara interface appears in this browser.</p></div></div>
          <label className="settings-select-row"><div className="settings-row-copy"><strong>Display density</strong><small>Choose roomier or more compact spacing.</small></div>
            <select value={account.preferences.density} onChange={e => updatePreference('density', e.target.value as Density)}><option value="comfortable">Comfortable</option><option value="compact">Compact</option></select>
          </label>
          <ToggleRow label="Reduce motion" detail="Minimise transitions and animations across the interface." checked={account.preferences.reduceMotion} onChange={v => updatePreference('reduceMotion', v)}/>
        </section>
      </div>

      <aside className="settings-aside">
        <section className="card settings-section">
          <div className="settings-section-heading"><IconCircle><LockKeyhole size={19}/></IconCircle><div><h2>Security</h2><p>Account protection status.</p></div></div>
          <div className="settings-security-row"><KeyRound size={18}/><div><strong>Password</strong><small>Requires a login system</small></div><span>Unavailable</span></div>
          <div className="settings-security-row"><Smartphone size={18}/><div><strong>Two-factor authentication</strong><small>Not implemented in demo</small></div><span>Unavailable</span></div>
          <div className="settings-security-row"><Eye size={18}/><div><strong>Active sessions</strong><small>No authenticated sessions yet</small></div><span>Demo</span></div>
          <div className="settings-security-notice"><ShieldCheck size={16}/> Password changes, MFA, sign-out and session revocation must be connected to secure backend authentication before release.</div>
        </section>
        <section className="card settings-section">
          <div className="settings-section-heading"><IconCircle><RefreshCcw size={19}/></IconCircle><div><h2>Reset demo settings</h2><p>Restore profile and preferences to their initial values.</p></div></div>
          <button type="button" className="settings-outline-button" onClick={resetSettings}>Reset local settings</button>
          <p className="settings-small-print">This removes only Estara's demo settings from the current browser. It does not affect records or GitHub.</p>
        </section>
        <div className="settings-sidebar-foot"><VolumeX size={16}/><span>No real emails, push messages or security changes are performed here.</span></div>
      </aside>
    </div>
  </div>;
}
