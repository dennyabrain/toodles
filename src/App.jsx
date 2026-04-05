import { useState } from 'react';
import { Routes, Route } from 'react-router-dom';
import TodosTab from './components/TodosTab';
import ReviewTab from './components/ReviewTab';
import WorkloadTab from './components/WorkloadTab';
import TodoDetailPage from './components/TodoDetailPage';
import './App.css';

const TABS = ['Todos', 'Review', 'Workload'];

function MainLayout() {
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
        {activeTab === 'Review' && <ReviewTab />}
        {activeTab === 'Workload' && <WorkloadTab />}
      </main>
    </div>
  );
}

function App() {
  return (
    <Routes>
      <Route path="/" element={<MainLayout />} />
      <Route path="/:todoId" element={<TodoDetailPage />} />
    </Routes>
  );
}

export default App;
