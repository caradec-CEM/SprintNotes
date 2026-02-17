import { useState } from 'react';
import { Header, TabBar } from './components/layout';
import { TeamOverview } from './components/overview';
import { EngineerPanel } from './components/engineer';
import { useSprintData } from './hooks/useJiraQuery';
import './App.css';

function App() {
  const [activeTab, setActiveTab] = useState('overview');

  // Initialize sprint data loading
  useSprintData();

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
