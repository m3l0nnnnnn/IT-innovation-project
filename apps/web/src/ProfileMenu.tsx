import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Bell, ChevronDown, Palette, UserRound } from 'lucide-react';
import { SETTINGS_KEY } from './appearance';
import './profile-menu.css';

type Profile = { displayName: string; jobTitle: string };
const DEFAULT_PROFILE: Profile = { displayName: 'Demo Manager', jobTitle: 'Town Council Operations' };

function getProfile(): Profile {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(SETTINGS_KEY) ?? '{}') as {
      profile?: { displayName?: unknown; jobTitle?: unknown };
    };
    return {
      displayName:
        typeof parsed?.profile?.displayName === 'string' && parsed.profile.displayName.trim()
          ? parsed.profile.displayName.trim().slice(0, 64)
          : DEFAULT_PROFILE.displayName,
      jobTitle:
        typeof parsed?.profile?.jobTitle === 'string' && parsed.profile.jobTitle.trim()
          ? parsed.profile.jobTitle.trim().slice(0, 64)
          : DEFAULT_PROFILE.jobTitle
    };
  } catch {
    return DEFAULT_PROFILE;
  }
}

function initialsFor(name: string): string {
  return name.trim().split(/\s+/).slice(0, 2).map(word => word[0]?.toUpperCase() ?? '').join('') || 'DM';
}

export default function ProfileMenu() {
  const [open, setOpen] = useState(false);
  const [profile, setProfile] = useState<Profile>(getProfile);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const location = useLocation();

  useEffect(() => {
    const refresh = () => setProfile(getProfile());
    window.addEventListener('estara-account-updated', refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener('estara-account-updated', refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);

  useEffect(() => {
    setOpen(false);
  }, [location.pathname, location.search]);

  useEffect(() => {
    if (!open) return;
    const dismissOnOutsideClick = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    const dismissOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', dismissOnOutsideClick);
    document.addEventListener('keydown', dismissOnEscape);
    return () => {
      document.removeEventListener('pointerdown', dismissOnOutsideClick);
      document.removeEventListener('keydown', dismissOnEscape);
    };
  }, [open]);

  const initials = initialsFor(profile.displayName);
  return <div ref={rootRef} className="profile-menu-root">
    <button
      type="button"
      ref={triggerRef}
      className={'profile-trigger' + (open ? ' is-open' : '')}
      onClick={() => setOpen(value => !value)}
      aria-label={'Open profile menu for ' + profile.displayName}
      aria-expanded={open}
      aria-haspopup="true"
      aria-controls="estara-profile-popover"
    >
      <span className="profile-avatar">{initials}</span>
      <span className="profile-trigger-details"><span className="profile-trigger-name">{profile.displayName}</span><span className="profile-trigger-role">{profile.jobTitle}</span></span>
      <ChevronDown className={'profile-chevron' + (open ? ' rotated' : '')} size={15}/>
    </button>
    {open && <div id="estara-profile-popover" className="profile-popover" aria-label="Profile options">
      <div className="profile-popover-header">
        <span className="profile-avatar large">{initials}</span>
        <div className="profile-popover-identity">
          <strong>{profile.displayName}</strong>
          <small>{profile.jobTitle}</small>
        </div>
      </div>
      <nav className="profile-menu-links" aria-label="Account navigation">
        <Link to="/settings?section=profile" onClick={() => setOpen(false)}>
          <UserRound size={18}/><span>My profile</span>
        </Link>
        <Link to="/settings?section=appearance" onClick={() => setOpen(false)}>
          <Palette size={18}/><span>Appearance</span>
        </Link>
        <Link to="/settings?section=notifications" onClick={() => setOpen(false)}>
          <Bell size={18}/><span>Notifications</span>
        </Link>
      </nav>
      <p className="profile-popover-footer">Preferences are saved in this browser.</p>
    </div>}
  </div>;
}
