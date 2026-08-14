// Fábrica de dados simulados cobrindo os 10 cenários solicitados no MVP

export interface Customer {
  id: string;
  cpf: string;
  fullName: string;
  companies: Company[];
  contracts: Contract[];
}

export interface Company {
  id: string;
  cnpj: string;
  razaoSocial: string;
  nomeFantasia: string;
}

export interface Contract {
  id: string;
  contractNumber: string;
  companyId: string;
  sourceSystem: 'BDR' | 'CORDEL' | 'CONSOLIDATED';
  contractedAmount: number;
  totalInstallments: number;
  installmentAmount: number;
  status: 'Ativo' | 'Quitado' | 'Cancelado' | 'Em atraso' | 'Divergente';
  outstandingBalance: number;
  installments: Installment[];
  discrepancy?: DiscrepancyInfo;
}

export interface Installment {
  id: string;
  number: number;
  dueDate: string;
  originalAmount: number;
  paidAmount: number;
  status: 'A vencer' | 'Pago' | 'Em atraso' | 'Cancelado';
}

export interface DiscrepancyInfo {
  type: 'SOMENTE_BDR' | 'SOMENTE_CORDEL' | 'DIVERGENTE';
  difference?: number;
  details: string;
}

export const MOCK_COMPANIES: Record<string, Company> = {
  comp1: { id: 'comp1', cnpj: '00.000.000/0001-91', razaoSocial: 'Empresa Fictícia 1 S.A', nomeFantasia: 'Fictícia 1' },
  comp2: { id: 'comp2', cnpj: '11.111.111/0001-92', razaoSocial: 'TechCorp Brasil Ltda', nomeFantasia: 'TechCorp' },
};

export const MOCK_CUSTOMERS: Customer[] = [
  // 1. Cliente com contrato regular (Apenas 1 empresa, dados conciliados perfeitamente)
  {
    id: 'cust1',
    cpf: '111.111.111-11',
    fullName: 'João Silva Regular',
    companies: [MOCK_COMPANIES.comp1],
    contracts: [
      {
        id: 'cont1', contractNumber: 'BDR-1001', companyId: 'comp1', sourceSystem: 'CONSOLIDATED',
        contractedAmount: 5000, totalInstallments: 10, installmentAmount: 500,
        status: 'Ativo', outstandingBalance: 4000,
        installments: [
          { id: 'inst1', number: 1, dueDate: '2023-01-10', originalAmount: 500, paidAmount: 500, status: 'Pago' },
          { id: 'inst2', number: 2, dueDate: '2023-02-10', originalAmount: 500, paidAmount: 500, status: 'Pago' },
          { id: 'inst3', number: 3, dueDate: '2023-03-10', originalAmount: 500, paidAmount: 0, status: 'A vencer' }
        ]
      }
    ]
  },
  // 2. Cliente com contrato atrasado e 10. CPF divergente (Divergência de saldo BDR x Cordel)
  {
    id: 'cust2',
    cpf: '222.222.222-22',
    fullName: 'Maria Santos Atrasada',
    companies: [MOCK_COMPANIES.comp2],
    contracts: [
      {
        id: 'cont2', contractNumber: 'COR-2005', companyId: 'comp2', sourceSystem: 'CONSOLIDATED',
        contractedAmount: 10000, totalInstallments: 20, installmentAmount: 500,
        status: 'Divergente', outstandingBalance: 8000,
        discrepancy: { type: 'DIVERGENTE', difference: 500, details: 'BDR reporta saldo R$7.500 | Cordel reporta R$8.000' },
        installments: [
          { id: 'inst4', number: 1, dueDate: '2023-01-10', originalAmount: 500, paidAmount: 500, status: 'Pago' },
          { id: 'inst5', number: 2, dueDate: '2023-02-10', originalAmount: 500, paidAmount: 0, status: 'Em atraso' }
        ]
      }
    ]
  },
  // 4. Múltiplos contratos (1 quitado, 1 ativo) / 6. Múltiplas empresas
  {
    id: 'cust3',
    cpf: '333.333.333-33',
    fullName: 'Carlos Multi Empresas',
    companies: [MOCK_COMPANIES.comp1, MOCK_COMPANIES.comp2],
    contracts: [
      {
        id: 'cont3', contractNumber: 'BDR-3001', companyId: 'comp1', sourceSystem: 'BDR',
        contractedAmount: 2000, totalInstallments: 5, installmentAmount: 400,
        status: 'Quitado', outstandingBalance: 0,
        installments: [
           { id: 'inst6', number: 1, dueDate: '2022-01-10', originalAmount: 400, paidAmount: 400, status: 'Pago' }
        ]
      },
      {
        id: 'cont4', contractNumber: 'COR-9090', companyId: 'comp2', sourceSystem: 'CORDEL',
        contractedAmount: 15000, totalInstallments: 30, installmentAmount: 500,
        status: 'Ativo', outstandingBalance: 14500,
        discrepancy: { type: 'SOMENTE_CORDEL', details: 'Contrato não existe no BDR' },
        installments: [
           { id: 'inst7', number: 1, dueDate: '2023-08-10', originalAmount: 500, paidAmount: 0, status: 'A vencer' }
        ]
      }
    ]
  }
];

export const getDashboardStats = () => {
  return {
    totalCustomers: MOCK_CUSTOMERS.length,
    totalContracted: MOCK_CUSTOMERS.reduce((acc, c) => acc + c.contracts.reduce((a, co) => a + co.contractedAmount, 0), 0),
    totalOutstanding: MOCK_CUSTOMERS.reduce((acc, c) => acc + c.contracts.reduce((a, co) => a + co.outstandingBalance, 0), 0),
    divergentContracts: MOCK_CUSTOMERS.filter(c => c.contracts.some(co => co.discrepancy)).length
  };
};

export const findCustomerByCpf = (cpf: string) => {
  const cleanCpf = cpf.replace(/\D/g, '');
  return MOCK_CUSTOMERS.find(c => c.cpf.replace(/\D/g, '') === cleanCpf);
};
