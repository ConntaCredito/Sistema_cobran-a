import { useState } from 'react';
import Papa from 'papaparse';
import { Upload, FileUp, CheckCircle, Database } from 'lucide-react';
import { supabase } from '../services/supabase';
import { v4 as uuidv4 } from 'uuid';

export const Import = () => {
  const [source, setSource] = useState<'BDR' | 'CORDEL'>('BDR');
  const [fund, setFund] = useState<'Alcar' | 'Alpha'>('Alcar');
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<any | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setResult(null);
    }
  };

  const processImport = () => {
    if (!file) return;
    setIsProcessing(true);

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        const rows = results.data as any[];
        const totalRows = rows.length;
        
        let validRows = 0;
        let errors = 0;

        try {
          // 1. Grava na Auditoria (Mantido da fase anterior)
          const { error: auditError } = await supabase.from('source_records').insert({
            source_system: source,
            original_payload: rows,
            import_hash: `import_${Date.now()}_${Math.random().toString(36).substring(7)}`,
            original_identifier: file.name
          });

          if (auditError) throw auditError;

          // 2. Loop de Processamento (Engine de Normalização)
          for (const row of rows) {
            try {
              // Valores esperados do CSV (Normalizando nomes de coluna)
              const cpf = row['cpf']?.replace(/\D/g, '');
              const nome_cliente = row['nome_cliente'];
              const cnpj = row['cnpj']?.replace(/\D/g, '');
              const nome_empresa = row['nome_empresa'];
              const numero_contrato = row['numero_contrato'];
              const valor_contratado = parseFloat(row['valor_contratado']);
              const saldo_devedor = parseFloat(row['saldo_devedor']);
              const situacao = row['situacao'];

              if (!cpf || !numero_contrato) {
                errors++;
                continue; // Pula linha se faltar chaves primárias lógicas
              }

              // A. Garantir Empresa
              let companyId = null;
              if (cnpj) {
                const { data: compData } = await supabase.from('companies').select('id').eq('cnpj', cnpj).single();
                if (compData) {
                  companyId = compData.id;
                } else {
                  companyId = uuidv4();
                  await supabase.from('companies').insert({ id: companyId, cnpj, company_name: nome_empresa });
                }
              }

              // B. Garantir Cliente
              let customerId = null;
              const { data: custData } = await supabase.from('customers').select('id').eq('cpf', cpf).single();
              if (custData) {
                customerId = custData.id;
              } else {
                customerId = uuidv4();
                await supabase.from('customers').insert({ id: customerId, cpf, full_name: nome_cliente });
              }

              // C. Garantir Contrato
              // Em um sistema real complexo, poderíamos atualizar o contrato se ele já existir pelo numero.
              // Para o MVP, assumimos inserção.
              const contractId = uuidv4();
              await supabase.from('contracts').insert({
                id: contractId,
                customer_id: customerId,
                company_id: companyId,
                contract_number: numero_contrato,
                source_system: source,
                fund: fund,
                contracted_amount: isNaN(valor_contratado) ? 0 : valor_contratado,
                outstanding_balance: isNaN(saldo_devedor) ? 0 : saldo_devedor,
                status: situacao || 'Regular'
              });

              validRows++;
            } catch (err) {
              console.error('Erro na linha', err);
              errors++;
            }
          }

          setResult({
            total: totalRows,
            valid: validRows,
            errors: errors,
            duplicates: 0,
            source: source,
            fileName: file.name,
            dbSuccess: true
          });
        } catch (e) {
          console.error(e);
          alert('Falha crítica na importação do Banco de Dados.');
        } finally {
          setIsProcessing(false);
        }
      },
      error: () => {
        setIsProcessing(false);
        alert('Erro ao processar o arquivo CSV.');
      }
    });
  };

  return (
    <div className="main-content">
      <h1 className="mb-4">Importar Dados</h1>
      
      <div style={{ display: 'grid', gap: '1.5rem', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}>
        
        <div className="glass-card">
          <h2 className="mb-4" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <FileUp size={24} /> Nova Importação
          </h2>
          
          <div className="mb-4">
            <label className="text-muted mb-1" style={{ display: 'block', fontSize: '0.9rem' }}>Fundo</label>
            <select 
              className="input-field" 
              value={fund} 
              onChange={(e) => setFund(e.target.value as any)}
            >
              <option value="Alcar">Fundo Alcar</option>
              <option value="Alpha">Fundo Alpha</option>
            </select>
          </div>

          <div className="mb-4">
            <label className="text-muted mb-1" style={{ display: 'block', fontSize: '0.9rem' }}>Sistema de Origem</label>
            <select 
              className="input-field" 
              value={source} 
              onChange={(e) => setSource(e.target.value as any)}
            >
              <option value="BDR">BDR (Banco de Dados de Risco)</option>
              <option value="CORDEL">CORDEL (Consignados)</option>
            </select>
          </div>

          <div className="mb-4" style={{ 
            border: '2px dashed var(--color-border)', 
            padding: '2rem', borderRadius: 'var(--radius-md)', 
            textAlign: 'center', background: 'rgba(0,0,0,0.2)' 
          }}>
            <input 
              type="file" 
              accept=".csv" 
              onChange={handleFileChange}
              style={{ display: 'none' }}
              id="file-upload"
            />
            <label htmlFor="file-upload" style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
              <Upload size={32} className="text-muted" />
              <span>{file ? file.name : 'Clique para selecionar um arquivo CSV'}</span>
              {!file && <span className="text-muted" style={{ fontSize: '0.8rem' }}>ou arraste e solte aqui</span>}
            </label>
          </div>

          <button 
            className="btn-primary" 
            style={{ width: '100%', justifyContent: 'center' }}
            disabled={!file || isProcessing}
            onClick={processImport}
          >
            {isProcessing ? 'Lendo CSV e Normalizando BD...' : 'Executar Importação'}
          </button>
        </div>

        {result && (
          <div className="glass-card" style={{ borderLeft: '4px solid var(--color-success)' }}>
            <h2 className="mb-4 text-success" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <CheckCircle size={24} /> Relatório de Importação
            </h2>
            
            <div className="mb-4">
              <p className="text-muted" style={{ fontSize: '0.9rem' }}>Origem: <strong style={{ color: '#fff' }}>{result.source}</strong></p>
              <p className="text-muted" style={{ fontSize: '0.9rem' }}>Arquivo: <strong style={{ color: '#fff' }}>{result.fileName}</strong></p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div style={{ background: 'rgba(255,255,255,0.05)', padding: '1rem', borderRadius: '0.5rem' }}>
                <div className="text-muted" style={{ fontSize: '0.8rem' }}>Registros Recebidos</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{result.total}</div>
              </div>
              <div style={{ background: 'rgba(16, 185, 129, 0.1)', border: '1px solid var(--color-success)', padding: '1rem', borderRadius: '0.5rem' }}>
                <div className="text-muted" style={{ fontSize: '0.8rem' }}>Inseridos com Sucesso</div>
                <div className="text-success" style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{result.valid}</div>
              </div>
              <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid var(--color-danger)', padding: '1rem', borderRadius: '0.5rem' }}>
                <div className="text-muted" style={{ fontSize: '0.8rem' }}>Falhas / Incompletos</div>
                <div className="text-danger" style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{result.errors}</div>
              </div>
            </div>

            <div className="mt-4 pt-4" style={{ borderTop: '1px solid var(--color-border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>
                <Database size={16} /> 
                Clientes, Empresas e Contratos alimentados na base de produção.
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
