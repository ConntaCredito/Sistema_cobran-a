import { useState, useEffect } from 'react';
import { supabase } from '../services/supabase';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import type { DropResult } from '@hello-pangea/dnd';
import { User, FileText } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const COLUMNS = [
  { id: 'INITIAL', title: 'Novos / Inicial', color: '#6366f1' },
  { id: 'Em atendimento', title: 'Em Atendimento', color: '#3b82f6' },
  { id: 'Não respondeu', title: 'Não Respondeu', color: '#9ca3af' },
  { id: 'Negociando', title: 'Negociando', color: '#f59e0b' },
  { id: 'Promessa de Pagamento', title: 'Promessa', color: '#8b5cf6' },
  { id: 'Inviável', title: 'Inviável / Num Errado', color: '#ef4444' },
  { id: 'Pagamento realizado', title: 'Pagamento Realizado', color: '#10b981' }
];

export const KanbanBoard = ({ rawData = [], onRefresh }: { rawData?: any[], onRefresh?: () => void }) => {
  const [boardData, setBoardData] = useState<any[]>([]);
  const [displayLimit, setDisplayLimit] = useState(100);
  const navigate = useNavigate();
  const { profile } = useAuth();

  useEffect(() => {
    if (rawData && rawData.length > 0) {
      const mappedData = rawData.filter(c => c.contracts && c.contracts.length > 0).map(customer => {
        const contracts = customer.contracts || [];
        let overallStatus = 'INITIAL';
        
        if (customer.collection_history && customer.collection_history.length > 0) {
           const sortedHistory = customer.collection_history.sort((a: any, b: any) => 
             new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
           );
           
           const latestPhase = sortedHistory[0].phase;
           
           if (latestPhase === 'Não respondeu') overallStatus = 'Não respondeu';
           else if (latestPhase === 'Em atendimento') overallStatus = 'Em atendimento';
           else if (latestPhase === 'Tem interesse de regularizar, negociando') overallStatus = 'Negociando';
           else if (latestPhase === 'Promessa de Pagamento') overallStatus = 'Promessa de Pagamento';
           else if (latestPhase === 'Pagamento realizado') overallStatus = 'Pagamento realizado';
           else if (latestPhase === 'Sem condições de pagamento/sem previsão' || latestPhase === 'Número incorreto' || latestPhase === 'Pagamento não realizado') overallStatus = 'Inviável';
           else if (latestPhase) overallStatus = latestPhase;
        }

        let isDesligado = false;
        let isAfastado = false;
        let tipoEvento = '';
        let dataEvento = '';
        let vencimentoBase = '';

        const formatExcelDate = (serial: any) => {
           if (!serial || isNaN(Number(serial)) || Number(serial) < 30000) return '';
           const days = Math.floor(Number(serial) - 25569);
           return new Date(days * 86400 * 1000).toLocaleDateString('pt-BR', { timeZone: 'UTC' });
        };

        const totalDebt = contracts.reduce((acc: number, curr: any) => {
           if (curr.dismissal_date && new Date(curr.dismissal_date).getFullYear() > 1970) {
             isDesligado = true;
             if (!dataEvento) dataEvento = new Date(curr.dismissal_date).toLocaleDateString('pt-BR', { timeZone: 'UTC' });
           }
           
           if (curr.due_date && new Date(curr.due_date).getFullYear() > 1970 && !vencimentoBase) {
             vencimentoBase = new Date(curr.due_date).toLocaleDateString('pt-BR', { timeZone: 'UTC' });
           }

             if (curr.metadata) {
               const rawEvent = curr.metadata.tipo_evento || curr.metadata.tipo_evento_sacado || curr.metadata['TIPO EVENTO SACADO'] || curr.metadata.em_cobranca;
               if (typeof rawEvent === 'string' && rawEvent.trim() !== '' && !tipoEvento) {
                let evt = String(rawEvent).toUpperCase();
                if (evt.includes('RESCIS') || evt.includes('RECIS')) evt = 'DEMISSÃO';
                tipoEvento = evt;
                if (evt.includes('DEMISSÃO') || evt.includes('DESLIGAMENTO')) isDesligado = true;
                if (evt.includes('AFASTAMENTO')) isAfastado = true;
             }
             const dtDesl = curr.metadata['entrada_afastamento/rescisao'] || curr.metadata['dt_desligamento'] || curr.metadata['ENTRADA AFASTAMENTO/RESCISAO'] || curr.metadata['DT DESLIGAMENTO'];
             if (dtDesl && !isNaN(Number(dtDesl)) && Number(dtDesl) > 30000) {
                isDesligado = true;
                if (!dataEvento) dataEvento = formatExcelDate(dtDesl);
             }

             const dtVenc = curr.metadata['dt_venc_origem'] || curr.metadata['dt_venc_ajustado'] || curr.metadata['DT VENC ORIGEM'];
             if (dtVenc && !vencimentoBase) {
                vencimentoBase = formatExcelDate(dtVenc);
             }
           }

           const status = String(curr.status).toLowerCase();
           if (status !== 'quitado' && status !== 'regular') {
              return acc + (Number(curr.outstanding_balance) || 0);
           }
           return acc;
        }, 0);

        const hasQuitado = contracts.some((c: any) => String(c.status).toLowerCase() === 'quitado');
        const hasPromessa = contracts.some((c: any) => String(c.status).toLowerCase() === 'promessa de pagamento');

        if (hasQuitado && overallStatus !== 'Pagamento realizado') {
            overallStatus = 'Pagamento realizado';
        } else if (hasPromessa && overallStatus !== 'Pagamento realizado' && overallStatus !== 'Promessa de Pagamento') {
            overallStatus = 'Promessa de Pagamento';
        }

        if (!COLUMNS.find(c => c.id === overallStatus)) {
           overallStatus = 'INITIAL';
        }
    
        return {
          ...customer,
          overallStatus,
          latestPhase: customer.collection_history?.[0]?.phase || 'Sem Registro',
          return_date: customer.return_date,
          totalDebt,
          contractCount: contracts.length,
          isDesligado,
          isAfastado,
          tipoEvento,
          dataEvento,
          vencimentoBase
        };
      });
      setBoardData(mappedData);
    } else {
      setBoardData([]);
    }
  }, [rawData]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const bottom = e.currentTarget.scrollHeight - e.currentTarget.scrollTop <= e.currentTarget.clientHeight + 10;
    if (bottom) {
      setDisplayLimit(prev => prev + 100);
    }
  };

  const onDragEnd = async (result: DropResult) => {
    const { destination, source, draggableId } = result;

    if (!destination) return;
    if (destination.droppableId === source.droppableId && destination.index === source.index) return;

    const newStatus = destination.droppableId;

    setBoardData(prev => prev.map(c => c.id === draggableId ? { ...c, overallStatus: newStatus } : c));

    const customer = boardData.find(c => c.id === draggableId);
    if (!customer) return;

    // Em vez de atualizar contratos genéricos, inserimos uma nova ocorrência no CRM (Histórico)
    const { error } = await supabase.from('collection_history').insert({
      customer_id: customer.id,
      title: 'Mudança de Fase (Kanban)',
      phase: newStatus,
      description: `O cartão foi movido para a coluna "${newStatus}".`,
      responsible: profile?.username || 'Sistema'
    });
    
    if (error) {
      console.error('Falha ao registrar histórico', error);
      if (onRefresh) onRefresh();
    }
  };

  return (
    <DragDropContext onDragEnd={onDragEnd}>
      <div style={{ display: 'flex', gap: '1.5rem', flex: 1, overflowX: 'auto', paddingBottom: '1rem' }}>
        
        {COLUMNS.map(col => {
          const colCustomers = boardData.filter(c => c.overallStatus === col.id);

          return (
            <div key={col.id} style={{ display: 'flex', flexDirection: 'column', minWidth: '240px', width: '240px', background: '#f9fafb', borderRadius: '8px', border: '1px solid var(--color-border)' }}>
              
              <div style={{ padding: '0.75rem', borderBottom: `3px solid ${col.color}`, borderTopLeftRadius: '8px', borderTopRightRadius: '8px', background: '#ffffff' }}>
                <h3 style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.95rem', color: 'var(--color-text)', margin: 0 }}>
                  {col.title}
                  <span style={{ fontSize: '0.75rem', padding: '0.15rem 0.5rem', background: '#f3f4f6', borderRadius: '1rem', color: 'var(--color-text-muted)' }}>
                    {colCustomers.length}
                  </span>
                </h3>
              </div>

              <Droppable droppableId={col.id}>
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    onScroll={handleScroll}
                    style={{ 
                      padding: '0.5rem', 
                      flex: 1, 
                      overflowY: 'auto',
                      minHeight: '200px',
                      background: snapshot.isDraggingOver ? '#f3f4f6' : 'transparent',
                      transition: 'background 0.2s'
                    }}
                  >
                    {boardData.filter(c => c.overallStatus === col.id).slice(0, displayLimit).map((customer, index) => (
                      <Draggable key={customer.id} draggableId={customer.id} index={index}>
                        {(provided, snapshot) => (
                          <div
                            ref={provided.innerRef}
                            {...provided.draggableProps}
                            {...provided.dragHandleProps}
                            className="glass-card"
                            onClick={(e) => {
                              if (!e.defaultPrevented) navigate(`/customer/${customer.cpf}`);
                            }}
                            style={{
                              ...provided.draggableProps.style,
                              padding: '0.75rem',
                              marginBottom: '0.5rem',
                              cursor: 'pointer',
                              transform: snapshot.isDragging ? `${provided.draggableProps.style?.transform} rotate(2deg) scale(1.02)` : provided.draggableProps.style?.transform,
                              boxShadow: snapshot.isDragging ? `0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -2px rgba(0,0,0,0.05)` : '',
                              zIndex: snapshot.isDragging ? 100 : 1,
                              background: '#ffffff',
                              borderRadius: '6px'
                            }}
                          >
                            <div style={{ marginBottom: '0.5rem', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem', color: 'var(--color-text)' }}>
                              <div style={{ padding: '0.35rem', background: '#f3f4f6', borderRadius: '50%' }}>
                                <User size={14} style={{ color: '#6b7280' }} />
                              </div>
                              <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                                <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{customer.full_name}</span>
                                {customer.profiles ? (
                                  <span style={{ fontSize: '0.7rem', color: '#6b7280', fontWeight: 'normal' }}>@{customer.profiles.username}</span>
                                ) : (
                                  <span style={{ fontSize: '0.7rem', color: '#f59e0b', fontWeight: 'normal' }}>Sem dono</span>
                                )}
                              </div>
                            </div>
                            
                            <div style={{ fontSize: '0.75rem', color: '#6b7280', display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.5rem' }}>
                              <FileText size={12} /> {customer.contractCount} contrato{customer.contractCount > 1 ? 's' : ''}
                            </div>
                            
                            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
                              {customer.phone && (
                                <span style={{ fontSize: '0.75rem', background: '#e5e7eb', color: '#374151', padding: '0.1rem 0.4rem', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                                  📞 {customer.phone}
                                </span>
                              )}
                              {customer.email && <span title={customer.email} style={{ cursor: 'help' }}>✉️</span>}
                              
                              {customer.latestPhase === 'Sem condições de pagamento/sem previsão' && (
                                <span style={{ fontSize: '0.65rem', background: '#fee2e2', color: '#b91c1c', padding: '0.1rem 0.3rem', borderRadius: '4px', fontWeight: 'bold' }}>
                                  Sem Condições
                                </span>
                              )}
                              
                              {customer.return_date && (
                                <span style={{ fontSize: '0.65rem', background: '#dbeafe', color: '#1d4ed8', padding: '0.1rem 0.3rem', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '0.2rem', fontWeight: 'bold' }}>
                                  📅 {new Date(customer.return_date).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
                                </span>
                              )}
                              
                            </div>

                            {(customer.tipoEvento || customer.vencimentoBase || customer.dataEvento) && (
                              <div style={{ background: '#f8fafc', padding: '0.5rem', borderRadius: '6px', border: '1px solid #e2e8f0', marginBottom: '0.75rem' }}>
                                {customer.tipoEvento && (
                                  <div style={{ fontSize: '0.7rem', color: '#334155', display: 'flex', justifyContent: 'space-between', marginBottom: '0.15rem' }}>
                                    <strong style={{ color: '#475569' }}>EVENTO:</strong>
                                    <span style={{ fontWeight: 'bold', color: '#0f172a' }}>{customer.tipoEvento}</span>
                                  </div>
                                )}
                                {customer.dataEvento && (
                                  <div style={{ fontSize: '0.7rem', color: '#334155', display: 'flex', justifyContent: 'space-between', marginBottom: '0.15rem' }}>
                                    <strong style={{ color: '#475569' }}>DATA EVENTO:</strong>
                                    <span>{customer.dataEvento}</span>
                                  </div>
                                )}
                                {customer.vencimentoBase && (
                                  <div style={{ fontSize: '0.7rem', color: '#334155', display: 'flex', justifyContent: 'space-between' }}>
                                    <strong style={{ color: '#475569' }}>VENC. BASE:</strong>
                                    <span>{customer.vencimentoBase}</span>
                                  </div>
                                )}
                              </div>
                            )}

                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f9fafb', padding: '0.5rem', borderRadius: '4px', border: '1px solid #e5e7eb' }}>
                              <span style={{ fontSize: '0.7rem', color: '#6b7280' }}>Total</span>
                              <span style={{ fontWeight: 600, color: col.color, fontSize: '0.85rem' }}>
                                R$ {Number(customer.totalDebt).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                              </span>
                            </div>
                          </div>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            </div>
          );
        })}
        
      </div>
    </DragDropContext>
  );
};
