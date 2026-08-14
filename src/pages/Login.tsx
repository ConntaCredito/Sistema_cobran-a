import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../services/supabase';
import { Lock, User, RefreshCcw } from 'lucide-react';
import { AnimeButton } from '../components/AnimeButton';
import './Login.css';

export const Login = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    // O Supabase exige um formato de e-mail válido.
    const internalEmail = `${username}@bdr.com`;

    const { error } = await supabase.auth.signInWithPassword({
      email: internalEmail,
      password,
    });

    if (error) {
      setError(error.message === 'Invalid login credentials' ? 'Usuário ou senha incorretos' : error.message);
      setLoading(false);
    } else {
      navigate('/');
    }
  };

  return (
    <div className="login-wrapper">
      <div className="login-card">
        
        <div className="login-logo">
          <RefreshCcw size={32} />
        </div>
        
        <h1 className="login-heading">Consolidator</h1>
        <p className="login-subtitle">Entre com suas credenciais de operador</p>

        <form onSubmit={handleLogin}>
          {error && (
            <div style={{ background: '#fef2f2', border: '1px solid #fee2e2', color: '#ef4444', padding: '0.75rem', borderRadius: 'var(--radius-sm)', fontSize: '0.85rem', textAlign: 'center', marginBottom: '1.5rem' }}>
              {error}
            </div>
          )}

          <div className="login-field">
            <User className="login-icon" />
            <input 
              type="text" 
              className="login-input" 
              placeholder="Usuário / Matrícula"
              value={username}
              onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/\s/g, ''))}
              required
            />
          </div>
          
          <div className="login-field">
            <Lock className="login-icon" />
            <input 
              type="password" 
              className="login-input" 
              placeholder="Senha"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          
          <AnimeButton type="submit" className="login-btn" disabled={loading}>
            {loading ? 'Autenticando...' : 'Acessar Sistema'}
          </AnimeButton>
        </form>

      </div>
    </div>
  );
};
