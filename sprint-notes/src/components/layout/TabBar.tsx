import { useActiveMembers } from '../../stores/teamStore';
import { Avatar } from '../common';
import './TabBar.css';

interface TabBarProps {
  activeTab: string;
  onTabChange: (tabId: string) => void;
}

export function TabBar({ activeTab, onTabChange }: TabBarProps) {
  const members = useActiveMembers();
  return (
    <nav className="tab-bar no-print">
      <button
        className={`tab-bar__tab ${activeTab === 'overview' ? 'tab-bar__tab--active' : ''}`}
        onClick={() => onTabChange('overview')}
      >
        Team Overview
      </button>

      <div className="tab-bar__divider" />

      {members.map((member) => (
        <button
          key={member.id}
          className={`tab-bar__tab ${activeTab === member.id ? 'tab-bar__tab--active' : ''} ${member.role === 'admin' ? 'tab-bar__tab--admin' : ''}`}
          onClick={() => onTabChange(member.id)}
          title={member.role === 'admin' ? `${member.name} (Admin)` : member.name}
        >
          <Avatar name={member.name} src={member.avatarUrl} className="tab-bar__avatar" />
          <span className="tab-bar__name">{member.name.split(' ')[0]}</span>
          {member.role === 'admin' && <span className="tab-bar__admin-dot" aria-hidden="true" />}
        </button>
      ))}
    </nav>
  );
}
