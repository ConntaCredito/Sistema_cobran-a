import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Search, Users, Building, FileText, Settings, ShieldCheck, RefreshCcw, LogOut } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

export const Sidebar = () => {
  const { profile } = useAuth();

  return (
    <aside className="sidebar">
      <div className="mb-4" style={{ padding: '0 1rem' }}>
        <h2 className="text-primary" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
          <RefreshCcw size={24} />
          Consolidator
        </h2>
        <p className="text-muted" style={{ fontSize: '0.8rem', marginTop: '0.25rem' }}>BDR & Cordel</p>
      </div>

      <nav style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
        <NavLink to="/" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
          <LayoutDashboard size={20} /> Dashboard
        </NavLink>
        
        <NavLink to="/search" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
          <Search size={20} /> Consultar CPF
        </NavLink>
        
        <NavLink to="/customers" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
          <Users size={20} /> Clientes
        </NavLink>
        
        <NavLink to="/companies" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
          <Building size={20} /> Empresas
        </NavLink>
        
        <NavLink to="/contracts" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
          <FileText size={20} /> Contratos
        </NavLink>

        {profile?.role === 'ADMIN' && (
          <NavLink to="/settings" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
            <ShieldCheck size={20} /> Gestão de Usuários
          </NavLink>
        )}
        
        {profile?.role !== 'ADMIN' && (
          <NavLink to="/settings" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
            <Settings size={20} /> Minha Conta
          </NavLink>
        )}
      </nav>

      {/* User profile and logout */}
      <div style={{ marginTop: 'auto', paddingTop: '1rem', borderTop: '1px solid var(--color-border)' }}>
        <button 
          onClick={() => {
            // Emissão de um evento customizado ou uso direto de window.location
            // Como o Sidebar não tem acesso direto ao hook nesse escopo sem refatorar o App, 
            // a maneira mais limpa é despachar o evento para o contexto.
            // Para simplificar, faremos um signOut manual via supabase client
            import('../services/supabase').then(({ supabase }) => {
              supabase.auth.signOut().then(() => {
                window.location.href = '/login';
              });
            });
          }}
          className="sidebar-link" 
          style={{ width: '100%', border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--color-danger)' }}
        >
          <LogOut size={20} /> Sair do Sistema
        </button>
      </div>
    </aside>
  );
};
