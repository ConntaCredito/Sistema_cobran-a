import { useState } from 'react';
import * as XLSX from 'xlsx';
import { Upload, FileUp, CheckCircle, Database, RefreshCw, Users, FileText } from 'lucide-react';
import { supabase } from '../services/supabase';

export const ImportEstoque = () => {
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<any | null>(null);
  const [progress, setProgress] = useState({ current: 0, total: 0, percentage: 0 });
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const [isSyncing, setIsSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<any | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setResult(null);
    }
  };

  const processImport = async () => {
    if (!file) return;
    setIsProcessing(true);
    setProgress({ current: 0, total: 0, percentage: 0 });
    setElapsedSeconds(0);

    const startTime = Date.now();
    const timerInterval = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      const rows = XLSX.utils.sheet_to_json(worksheet) as any[];

      const totalRows = rows.length;
      setProgress({ current: 0, total: totalRows, percentage: 0 });

      let validRows = 0;
      let errors = 0;

      // Inserção em lotes (batching) para melhor performance
      const batchSize = 100;
      for (let i = 0; i < totalRows; i += batchSize) {
        const batch = rows.slice(i, i + batchSize);
        
        const mappedBatch = batch.map(row => {
          // Tentar encontrar colunas comuns independentemente da capitalização
          const getVal = (keys: string[]) => {
            const foundKey = Object.keys(row).find(k => keys.includes(k.toLowerCase().trim()));
            return foundKey ? String(row[foundKey]) : null;
          };

          const rawCpf = getVal(['cpf', 'cnpj', 'documento', 'doc']);
          const cpf = rawCpf ? rawCpf.replace(/\D/g, '') : null;
          const nome = getVal(['nome', 'nome_cliente', 'cliente', 'razao', 'razao_social']);

          return {
            cpf: cpf,
            nome: nome,
            status: 'Disponível',
            file_name: file.name,
            payload: row
          };
        });

        const { error } = await supabase.from('estoque').insert(mappedBatch);

        if (error) {
          console.error('Erro no lote:', error);
          errors += batch.length;
        } else {
          validRows += batch.length;
        }

        const currentProcessed = Math.min(i + batchSize, totalRows);
        setProgress({
          current: currentProcessed,
          total: totalRows,
          percentage: Math.round((currentProcessed / totalRows) * 100)
        });
      }

      setResult({
        total: totalRows,
        valid: validRows,
        errors: errors,
        fileName: file.name,
      });

    } catch (e) {
      console.error(e);
      alert('Falha crítica na importação do Excel.');
    } finally {
      clearInterval(timerInterval);
      setIsProcessing(false);
    }
  };

  const syncEstoque = async () => {
    setIsSyncing(true);
    setSyncResult(null);

    try {
      // 1. Fetch available stock
      const { data: estoqueList, error: fetchError } = await supabase
        .from('estoque')
        .select('*')
        .eq('status', 'Disponível');

      if (fetchError) throw fetchError;
      if (!estoqueList || estoqueList.length === 0) {
        alert('Nenhum registro no estoque para sincronizar.');
        return;
      }

      let customersCreated = 0;
      let contractsCreated = 0;

      for (const item of estoqueList) {
        if (!item.cpf) continue;
        
        // 2. Check if customer exists (avoid duplicate CPF)
        const { data: existingCustomer } = await supabase
          .from('customers')
          .select('id')
          .eq('cpf', item.cpf)
          .single();

        let customerId = existingCustomer?.id;

        if (!customerId) {
           // Insert new customer
           const { data: newCustomer, error: insertError } = await supabase
             .from('customers')
             .insert({ cpf: item.cpf, full_name: item.nome || 'Cliente Desconhecido' })
             .select('id')
             .single();
             
           if (insertError) {
             console.error('Erro ao criar cliente', insertError);
             continue; // Skip se falhar a criação do cliente
           }
           customerId = newCustomer.id;
           customersCreated++;
        }

        // 3. Create Contract
        const payload = item.payload || {};
        const getVal = (keys: string[]) => {
            const foundKey = Object.keys(payload).find(k => keys.includes(k.toLowerCase().trim()));
            return foundKey ? String(payload[foundKey]) : null;
        };

        const contractNumber = getVal(['contrato', 'numero_contrato', 'num_contrato']) || `ESTOQUE-${item.id.substring(0, 8)}`;
        
        const rawAmount = getVal(['valor', 'valor_divida', 'saldo', 'saldo_devedor', 'outstanding_balance']) || '0';
        const cleanAmount = rawAmount.replace(/[^\d.,-]/g, '').replace(/\./g, '').replace(',', '.');
        const amount = parseFloat(cleanAmount) || 0;

        const { error: contractError } = await supabase
          .from('contracts')
          .insert({
            customer_id: customerId,
            contract_number: contractNumber,
            contracted_amount: amount,
            outstanding_balance: amount,
            status: 'Ativo'
          });

        if (!contractError) {
          contractsCreated++;
        }

        // 4. Mark as Synced
        await supabase
          .from('estoque')
          .update({ status: 'Sincronizado' })
          .eq('id', item.id);
      }

      setSyncResult({ customers: customersCreated, contracts: contractsCreated });

    } catch (e) {
      console.error(e);
      alert('Falha ao sincronizar o estoque.');
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="main-content">
      <h1 className="mb-4">Importar Estoque (Base Fria)</h1>
      <p className="text-muted mb-4">Envie planilhas Excel reais (.xlsx, .xls) ou CSV. Os dados serão guardados de forma segura e flexível no Estoque.</p>
      
      <div style={{ display: 'grid', gap: '1.5rem', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}>
        
        <div className="glass-card">
          <h2 className="mb-4" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <FileUp size={24} /> Subir Planilha
          </h2>

          <div className="mb-4" style={{ 
            border: '2px dashed var(--color-border)', 
            padding: '2rem', borderRadius: 'var(--radius-md)', 
            textAlign: 'center', background: 'rgba(0,0,0,0.2)' 
          }}>
            <input 
              type="file" 
              accept=".xlsx, .xls, .csv" 
              onChange={handleFileChange}
              style={{ display: 'none' }}
              id="file-upload"
            />
            <label htmlFor="file-upload" style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
              <Upload size={32} className="text-muted" />
              <span>{file ? file.name : 'Clique para selecionar um arquivo Excel (.xlsx)'}</span>
              {!file && <span className="text-muted" style={{ fontSize: '0.8rem' }}>ou arraste e solte aqui</span>}
            </label>
          </div>

          <button 
            className="btn-primary" 
            style={{ width: '100%', justifyContent: 'center' }}
            disabled={!file || isProcessing}
            onClick={processImport}
          >
            {isProcessing ? 'Lendo Excel e Gravando no Estoque...' : 'Iniciar Importação de Estoque'}
          </button>

          {isProcessing && (
            <div className="mt-4 p-4 glass-card" style={{ background: 'rgba(255,255,255,0.02)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', fontSize: '0.9rem' }}>
                <span className="text-muted">Progresso: {progress.current} / {progress.total}</span>
                <span className="text-primary" style={{ fontWeight: 'bold' }}>{progress.percentage}%</span>
              </div>
              <div style={{ width: '100%', height: '8px', background: 'rgba(255,255,255,0.1)', borderRadius: '4px', overflow: 'hidden' }}>
                <div style={{ width: `${progress.percentage}%`, height: '100%', background: 'var(--color-primary)', transition: 'width 0.3s ease' }}></div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.75rem', fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
                <span>⏱️ Decorrido: {Math.floor(elapsedSeconds / 60)}m {elapsedSeconds % 60}s</span>
                {progress.current > 0 && progress.percentage < 100 && (
                  <span>⏳ Falta aprox: {Math.floor(((elapsedSeconds / progress.current) * (progress.total - progress.current)) / 60)}m {Math.floor(((elapsedSeconds / progress.current) * (progress.total - progress.current)) % 60)}s</span>
                )}
              </div>
            </div>
          )}
        </div>

        {result && (
          <div className="glass-card" style={{ borderLeft: '4px solid var(--color-success)' }}>
            <h2 className="mb-4 text-success" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <CheckCircle size={24} /> Relatório de Carga
            </h2>
            
            <div className="mb-4">
              <p className="text-muted" style={{ fontSize: '0.9rem' }}>Arquivo: <strong style={{ color: '#fff' }}>{result.fileName}</strong></p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div style={{ background: 'rgba(255,255,255,0.05)', padding: '1rem', borderRadius: '0.5rem' }}>
                <div className="text-muted" style={{ fontSize: '0.8rem' }}>Registros Lidos</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{result.total}</div>
              </div>
              <div style={{ background: 'rgba(16, 185, 129, 0.1)', border: '1px solid var(--color-success)', padding: '1rem', borderRadius: '0.5rem' }}>
                <div className="text-muted" style={{ fontSize: '0.8rem' }}>Enviados ao Estoque</div>
                <div className="text-success" style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{result.valid}</div>
              </div>
              {result.errors > 0 && (
                <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid var(--color-danger)', padding: '1rem', borderRadius: '0.5rem' }}>
                  <div className="text-muted" style={{ fontSize: '0.8rem' }}>Falhas</div>
                  <div className="text-danger" style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{result.errors}</div>
                </div>
              )}
            </div>

            <div className="mt-4 pt-4" style={{ borderTop: '1px solid var(--color-border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--color-text-muted)', fontSize: '0.9rem', marginBottom: '1rem' }}>
                <Database size={16} /> 
                Os dados foram armazenados de forma flexível na base apartada (Estoque).
              </div>

              <button 
                className="btn-primary" 
                style={{ width: '100%', justifyContent: 'center', background: 'var(--color-accent)' }}
                disabled={isSyncing}
                onClick={syncEstoque}
              >
                {isSyncing ? (
                  <><RefreshCw size={20} className="spin" /> Sincronizando Estoque...</>
                ) : (
                  <><RefreshCw size={20} /> Sincronizar Estoque para CRM</>
                )}
              </button>
            </div>
            
            {syncResult && (
              <div className="mt-4 p-4 glass-card" style={{ background: 'rgba(59, 130, 246, 0.1)', border: '1px solid rgba(59, 130, 246, 0.3)' }}>
                 <h3 className="mb-2" style={{ color: '#60a5fa', fontSize: '1.1rem' }}>Sincronização Concluída!</h3>
                 <p className="text-muted" style={{ fontSize: '0.9rem', marginBottom: '1rem' }}>O estoque foi fundido com a sua base de clientes sem gerar CPFs duplicados.</p>
                 
                 <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                    <div>
                      <div className="text-muted" style={{ fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}><Users size={14} /> Novos Clientes Criados</div>
                      <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{syncResult.customers}</div>
                    </div>
                    <div>
                      <div className="text-muted" style={{ fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}><FileText size={14} /> Novos Contratos Adicionados</div>
                      <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{syncResult.contracts}</div>
                    </div>
                 </div>
              </div>
            )}

          </div>
        )}
      </div>
    </div>
  );
};
