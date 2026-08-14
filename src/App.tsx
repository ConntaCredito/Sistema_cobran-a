import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { Sidebar } from './components/Sidebar';
import { Dashboard } from './pages/Dashboard';
import { Search } from './pages/Search';
import { CustomerDetails } from './pages/CustomerDetails';
import { CustomersList } from './pages/CustomersList';
import { CompaniesList } from './pages/CompaniesList';
import { CompanyDetails } from './pages/CompanyDetails';
import { ContractsList } from './pages/ContractsList';
import { History } from './pages/History';
import { Settings } from './pages/Settings';
import { Login } from './pages/Login';
import { AuthProvider } from './contexts/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';

// Componente helper para envolver rotas com Sidebar
const AppLayout = ({ children }: { children: React.ReactNode }) => (
  <div className="layout-container">
    <Sidebar />
    <div className="main-content">
      <div style={{ maxWidth: '1600px', margin: '0 auto', width: '100%' }}>
        {children}
      </div>
    </div>
  </div>
);

function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          <Route path="/login" element={<Login />} />
          
          {/* Rotas Protegidas */}
          <Route path="/" element={<ProtectedRoute><AppLayout><Dashboard /></AppLayout></ProtectedRoute>} />
          <Route path="/search" element={<ProtectedRoute><AppLayout><Search /></AppLayout></ProtectedRoute>} />
          <Route path="/customer/:cpf" element={<ProtectedRoute><AppLayout><CustomerDetails /></AppLayout></ProtectedRoute>} />
          <Route path="/customers" element={<ProtectedRoute><AppLayout><CustomersList /></AppLayout></ProtectedRoute>} />
          <Route path="/companies" element={<ProtectedRoute><AppLayout><CompaniesList /></AppLayout></ProtectedRoute>} />
          <Route path="/company/:id" element={<ProtectedRoute><AppLayout><CompanyDetails /></AppLayout></ProtectedRoute>} />
          <Route path="/contracts" element={<ProtectedRoute><AppLayout><ContractsList /></AppLayout></ProtectedRoute>} />
          <Route path="/settings" element={<ProtectedRoute><AppLayout><Settings /></AppLayout></ProtectedRoute>} />
          
          <Route path="*" element={<ProtectedRoute><AppLayout><div className="main-content"><h2>Em desenvolvimento...</h2></div></AppLayout></ProtectedRoute>} />
        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;
