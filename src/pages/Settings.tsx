import { useState, useEffect } from 'react';
import { supabase, supabaseAdmin, supabaseUrl, supabaseAnonKey } from '../services/supabase';
import { createClient } from '@supabase/supabase-js';
import { Settings as SettingsIcon, User, Users, Plus, Trash2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

export const Settings = () => {
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'ADMIN';

  const [profiles, setProfiles] = useState<any[]>([]);
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState('USER');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const fetchProfiles = async () => {
    const { data } = await supabase.from('profiles').select('*').order('created_at', { ascending: false });
    if (data) setProfiles(data);
  };

  useEffect(() => {
    if (isAdmin) {
      fetchProfiles();
    }
  }, [isAdmin]);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) return;
    
    setLoading(true);
    setMessage('');

    const cleanUsername = newUsername.toLowerCase().replace(/\s/g, '');
    const internalEmail = `${cleanUsername}@bdr.com`;

    let authUser: any = null;
    let createErrorMsg = '';

    // 1. Tentativa via supabaseAdmin.auth.admin.createUser
    try {
      const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email: internalEmail,
        password: newPassword,
        email_confirm: true
      });
      if (authData?.user && !authError) {
        authUser = authData.user;
      } else if (authError) {
        createErrorMsg = authError.message;
      }
    } catch (err: any) {
      createErrorMsg = err?.message || '';
    }

    // 2. Fallback: via cliente isolado de signUp (garante funcionamento sem deslogar o admin)
    if (!authUser) {
      try {
        const tempAuthClient = createClient(supabaseUrl, supabaseAnonKey, {
          auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
        });

        const { data: signUpData, error: signUpError } = await tempAuthClient.auth.signUp({
          email: internalEmail,
          password: newPassword
        });

        if (signUpError) {
          setMessage(`Erro: ${signUpError.message || createErrorMsg}`);
          setLoading(false);
          return;
        }

        authUser = signUpData.user;
      } catch (err: any) {
        setMessage(`Erro: ${err?.message || createErrorMsg}`);
        setLoading(false);
        return;
      }
    }

    if (!authUser) {
      setMessage(`Erro: ${createErrorMsg || 'Não foi possível cadastrar o usuário.'}`);
      setLoading(false);
      return;
    }

    // 3. Criar Profile
    let profileSaved = false;
    const { error: profileError } = await supabaseAdmin.from('profiles').upsert({
      id: authUser.id,
      username: cleanUsername,
      role: newRole
    });

    if (!profileError) {
      profileSaved = true;
    } else {
      const { error: p2Error } = await supabase.from('profiles').upsert({
        id: authUser.id,
        username: cleanUsername,
        role: newRole
      });
      if (!p2Error) {
        profileSaved = true;
      } else {
        setMessage(`Erro ao criar perfil: ${p2Error.message || profileError.message}`);
      }
    }

    if (profileSaved) {
      setMessage('Usuário criado com sucesso!');
      setNewUsername('');
      setNewPassword('');
      fetchProfiles();
    }

    setLoading(false);
  };

  const handleDeleteUser = async (userId: string, username: string) => {
    if (!window.confirm(`Tem certeza que deseja excluir o usuário "${username}"? Todos os clientes vinculados a ele ficarão sem dono.`)) return;
    
    try {
      await supabaseAdmin.auth.admin.deleteUser(userId);
    } catch (_) {}

    const { error } = await supabaseAdmin.from('profiles').delete().eq('id', userId);
    
    if (error) {
      const { error: pErr } = await supabase.from('profiles').delete().eq('id', userId);
      if (pErr) {
        alert(`Erro ao excluir: ${pErr.message}`);
      } else {
        fetchProfiles();
      }
    } else {
      fetchProfiles();
    }
  };

  return (
    <div>
      <h1 className="mb-4" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <SettingsIcon size={28} className="text-primary" /> Configurações do Sistema
      </h1>
      
      <div style={{ display: 'grid', gap: '1.5rem', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}>
        
        {/* Painel de Conta */}
        <div className="glass-card">
          <h2 className="mb-4" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.25rem' }}>
            <User size={20} className="text-muted" /> Sua Conta
          </h2>
          
          <div className="mb-4">
            <label className="text-muted mb-1" style={{ display: 'block', fontSize: '0.9rem' }}>Identificação (Operador)</label>
            <input 
              type="text" 
              className="input-field" 
              value={profile?.username || 'Carregando...'}
              disabled
              style={{ opacity: 0.7 }}
            />
            <small className="text-muted mt-1" style={{ display: 'block' }}>
              Acesso nível: {isAdmin ? 'Administrador' : 'Operador Padrão'}
            </small>
          </div>
          
          <button className="btn-secondary" style={{ width: '100%', justifyContent: 'center' }}>
            Alterar Senha
          </button>
        </div>

        {/* Gestão de Operadores (Somente Admin) */}
        {isAdmin && (
          <div className="glass-card" style={{ gridColumn: '1 / -1' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.25rem', margin: 0 }}>
                <Users size={20} className="text-muted" /> Gestão de Operadores
              </h2>
            </div>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '2rem' }}>
              
              {/* Form Criar Usuario */}
              <div style={{ background: 'rgba(0,0,0,0.2)', padding: '1.5rem', borderRadius: 'var(--radius-md)' }}>
                <h3 className="mb-4" style={{ fontSize: '1rem', color: 'var(--color-primary)' }}>Cadastrar Novo Usuário</h3>
                
                {message && (
                  <div className={`mb-4 ${message.includes('Erro') ? 'text-danger' : 'text-success'}`} style={{ fontSize: '0.85rem', padding: '0.5rem', background: 'rgba(0,0,0,0.3)', borderRadius: '4px' }}>
                    {message}
                  </div>
                )}

                <form onSubmit={handleCreateUser} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.5rem', color: 'var(--color-text-muted)' }}>Nome de Usuário</label>
                    <input 
                      type="text" 
                      className="input-field" 
                      placeholder="ex: joao.silva" 
                      value={newUsername}
                      onChange={(e) => setNewUsername(e.target.value)}
                      required
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.5rem', color: 'var(--color-text-muted)' }}>Senha</label>
                    <input 
                      type="password" 
                      className="input-field" 
                      placeholder="******" 
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      required
                      minLength={6}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.5rem', color: 'var(--color-text-muted)' }}>Nível de Acesso</label>
                    <select 
                      className="input-field" 
                      value={newRole}
                      onChange={(e) => setNewRole(e.target.value)}
                      style={{ cursor: 'pointer' }}
                    >
                      <option value="USER" style={{ background: '#171717' }}>Operador Padrão</option>
                      <option value="ADMIN" style={{ background: '#171717' }}>Administrador</option>
                    </select>
                  </div>
                  
                  <button type="submit" className="btn-primary mt-2" disabled={loading} style={{ justifyContent: 'center' }}>
                    {loading ? 'Criando...' : <><Plus size={16} /> Adicionar Usuário</>}
                  </button>
                </form>
              </div>

              {/* Lista de Usuarios */}
              <div>
                <h3 className="mb-4" style={{ fontSize: '1rem' }}>Usuários Cadastrados ({profiles.length})</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {profiles.map(p => (
                    <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem', background: 'rgba(255,255,255,0.02)', borderRadius: 'var(--radius-sm)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'var(--color-primary)', color: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>
                          {p.username.substring(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <strong style={{ display: 'block' }}>{p.username}</strong>
                          <span className="text-muted" style={{ fontSize: '0.8rem' }}>ID: {p.id.substring(0, 8)}...</span>
                        </div>
                      </div>
                      
                      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <span className={`tip-btn ${p.role === 'ADMIN' ? 'tip-btn--warn' : 'tip-btn--alt'}`} style={{ padding: '4px 10px', fontSize: '0.7rem', cursor: 'default' }}>
                          {p.role}
                        </span>
                        
                        {profile?.id !== p.id && (
                          <button 
                            onClick={() => handleDeleteUser(p.id, p.username)}
                            style={{ 
                              background: 'rgba(239, 68, 68, 0.1)', 
                              border: '1px solid rgba(239, 68, 68, 0.2)', 
                              color: 'var(--color-danger)', 
                              padding: '0.5rem', 
                              borderRadius: '6px', 
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              transition: '0.2s'
                            }}
                            title="Excluir usuário"
                            onMouseOver={(e) => e.currentTarget.style.background = 'rgba(239, 68, 68, 0.2)'}
                            onMouseOut={(e) => e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)'}
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};
