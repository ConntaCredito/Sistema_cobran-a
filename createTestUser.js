const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://lqnmzfvajlnfywpgblfa.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxxbm16ZnZhamxuZnl3cGdibGZhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY2MjIwODAsImV4cCI6MjEwMjE5ODA4MH0.NtKPftAleRmeesFm-L3cXlAu-q0fEqDF2Dlqe3nx-mc';
const supabase = createClient(supabaseUrl, supabaseKey);

async function createTestUser() {
  console.log('Criando usuario...');
  const { data, error } = await supabase.auth.signUp({
    email: 'teste@teste.com',
    password: 'password123',
  });
  
  if (error) {
    console.error('Erro ao criar usuario:', error.message);
  } else {
    console.log('Usuario criado com sucesso!');
    console.log('Email: teste@teste.com');
    console.log('Senha: password123');
  }
}

createTestUser();
