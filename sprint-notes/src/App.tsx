import { useState, useEffect } from 'react';
import { Header, TabBar } from './components/layout';
import { TeamOverview } from './components/overview';
import { EngineerPanel } from './components/engineer';
import { useSprintData } from './hooks/useJiraQuery';
import { useThemeStore } from './stores/themeStore';
import './App.css';

function App() {
  const [activeTab, setActiveTab] = useState('overview');
  const isDark = useThemeStore((state) => state.isDark);

  // Initialize sprint data loading
  useSprintData();

  // Apply theme attribute to <html>
  useEffect(() => {
    document.documentElement.dataset.theme = isDark ? 'dark' : 'light';
  }, [isDark]);

  return (
    <div className="app">
      <Header />
      <TabBar activeTab={activeTab} onTabChange={setActiveTab} />

      <main className="app__content">
        {activeTab === 'overview' ? (
          <TeamOverview />
        ) : (
          <EngineerPanel engineerId={activeTab} />
        )}
      </main>
    </div>
  );
}

export default App;
