import { useState, useEffect } from 'react';
import { supabase } from '../services/supabase';
import { History as HistoryIcon, Clock, HardDrive, FileText } from 'lucide-react';

export const History = () => {
  const [records, setRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchHistory() {
      // Puxa as ultimas 50 importações, ordenadas da mais recente para a mais antiga
      const { data } = await supabase
        .from('source_records')
        .select('id, source_system, original_identifier, import_hash, created_at')
        .order('created_at', { ascending: false })
        .limit(50);
        
      if (data) setRecords(data);
      setLoading(false);
    }
    fetchHistory();
  }, []);

  return (
    <div className="main-content">
      <h1 className="mb-4" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <HistoryIcon size={28} className="text-primary" /> Histórico de Importações
      </h1>
      
      <div className="glass-card" style={{ padding: '0', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr style={{ background: 'rgba(255,255,255,0.05)', borderBottom: '1px solid var(--color-border)' }}>
              <th style={{ padding: '1rem' }}><Clock size={16} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '0.5rem' }} />Data / Hora</th>
              <th style={{ padding: '1rem' }}><HardDrive size={16} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '0.5rem' }} />Origem</th>
              <th style={{ padding: '1rem' }}><FileText size={16} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '0.5rem' }} />Arquivo Original</th>
              <th style={{ padding: '1rem' }}>Lote (Hash)</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={4} style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                  Carregando histórico...
                </td>
              </tr>
            ) : records.map(record => (
              <tr key={record.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <td style={{ padding: '1rem', fontWeight: 500 }}>
                  {new Date(record.created_at).toLocaleString('pt-BR')}
                </td>
                <td style={{ padding: '1rem' }}>
                  <span style={{ 
                    padding: '0.25rem 0.5rem', 
                    borderRadius: '0.25rem', 
                    fontSize: '0.8rem',
                    background: record.source_system === 'BDR' ? 'rgba(59, 130, 246, 0.2)' : 'rgba(139, 92, 246, 0.2)',
                    color: record.source_system === 'BDR' ? 'var(--color-primary)' : '#c084fc'
                  }}>
                    {record.source_system}
                  </span>
                </td>
                <td style={{ padding: '1rem', color: 'var(--color-text-muted)' }}>{record.original_identifier || 'Upload Direto'}</td>
                <td style={{ padding: '1rem', fontSize: '0.85rem', fontFamily: 'monospace', color: 'var(--color-text-muted)' }}>
                  {record.import_hash}
                </td>
              </tr>
            ))}
            {!loading && records.length === 0 && (
              <tr>
                <td colSpan={4} style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                  Nenhuma importação realizada no sistema ainda.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
