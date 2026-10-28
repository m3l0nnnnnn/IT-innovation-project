import { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { SETTINGS_KEY } from './appearance';
import { getSavedProfilePhoto } from './profile-photo';
import './profile-menu.css';

type Profile = { displayName: string; jobTitle: string };

const DEFAULT_PROFILE: Profile = {
  displayName: 'Demo Manager',
  jobTitle: 'Town Council Operations'
};

function getProfile(): Profile {
  try {
    const stored = JSON.parse(window.localStorage.getItem(SETTINGS_KEY) ?? '{}') as {
      profile?: { displayName?: unknown; jobTitle?: unknown };
    };
    const displayName = stored?.profile?.displayName;
    const jobTitle = stored?.profile?.jobTitle;
    return {
      displayName: typeof displayName === 'string' && displayName.trim()
        ? displayName.trim().slice(0, 64)
        : DEFAULT_PROFILE.displayName,
      jobTitle: typeof jobTitle === 'string' && jobTitle.trim()
        ? jobTitle.trim().slice(0, 64)
        : DEFAULT_PROFILE.jobTitle
    };
  } catch {
    return DEFAULT_PROFILE;
  }
}

function getInitials(name: string): string {
  return name.trim().split(/\s+/).slice(0, 2)
    .map(word => word[0]?.toUpperCase() ?? '').join('') || 'DM';
}

/** The sidebar account is a direct link to My Profile, not a popup menu. */
export default function ProfileMenu() {
  const [profile, setProfile] = useState<Profile>(getProfile);
  const [profilePhoto, setProfilePhoto] = useState<string | null>(getSavedProfilePhoto);

  useEffect(() => {
    const refresh = () => { setProfile(getProfile()); setProfilePhoto(getSavedProfilePhoto()); };
    window.addEventListener('estara-account-updated', refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener('estara-account-updated', refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);

  return <div className="profile-menu-root">
    <NavLink
      to="/settings?section=profile"
      className={({ isActive }) => 'profile-trigger' + (isActive ? ' is-active' : '')}
      aria-label={'Open My Profile for ' + profile.displayName}
      title={'My Profile — ' + profile.displayName}
    >
      <span className="profile-avatar" aria-hidden="true">{profilePhoto ? <img className="profile-avatar-image" src={profilePhoto} alt=""/> : getInitials(profile.displayName)}</span>
      <span className="profile-trigger-details">
        <span className="profile-trigger-name">{profile.displayName}</span>
        <span className="profile-trigger-role">{profile.jobTitle}</span>
      </span>
    </NavLink>
  </div>;
}
