import { useState } from 'react';
import TodosTab from './components/TodosTab';
import WorkloadTab from './components/WorkloadTab';
import './App.css';

const TABS = ['Todos', 'Review', 'Workload'];

function App() {
  const [activeTab, setActiveTab] = useState('Todos');

  return (
    <div className="app">
      <header className="app-header">
        <h1 className="app-title">Toodles</h1>
        <nav className="tabs" role="tablist">
          {TABS.map(tab => (
            <button
              key={tab}
              role="tab"
              aria-selected={activeTab === tab}
              className={`tab-btn${activeTab === tab ? ' active' : ''}`}
              onClick={() => setActiveTab(tab)}
            >
              {tab}
            </button>
          ))}
        </nav>
      </header>

      <main className="app-content">
        {activeTab === 'Todos' && <TodosTab />}
        {activeTab === 'Review' && (
          <p className="coming-soon">Review coming soon</p>
        )}
        {activeTab === 'Workload' && <WorkloadTab />}
      </main>
    </div>
  );
}

export default App;
