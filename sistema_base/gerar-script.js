
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

// ==================================================
// FUNÇÃO DE CRIPTOGRAFIA
// MANTER: alterar somente se o requisito mudar.
// ==================================================

function criptografar(texto) {
    const chave = Buffer.from(process.env.CRYPTO_CHAVE, 'utf8');
    const iv = Buffer.from(process.env.CRYPTO_IV, 'utf8');

    const cifra = crypto.createCipheriv(
        'aes-256-cbc',
        chave,
        iv
    );

    return cifra.update(texto, 'utf8', 'hex')
        + cifra.final('hex');
}

// ==================================================
// DADOS INICIAIS
// EDITE AQUI: dados de teste.
// ==================================================

const senhaHash = bcrypt.hashSync('123456', 10);

const cpf1 = criptografar('12345678912');
const cpf2 = criptografar('12345678913');
const cpf3 = criptografar('12345678914');

// ==================================================
// SCRIPT SQL
// ==================================================

const script = `

-- EDITE AQUI: nome do banco de dados
CREATE DATABASE IF NOT EXISTS sistema;
USE sistema;


-- ================================================
-- TABELA: USUARIOS
-- MANTER: estrutura de autenticação
-- ================================================

CREATE TABLE IF NOT EXISTS usuarios (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nome VARCHAR(100) NOT NULL,
    email VARCHAR(100) NOT NULL,
    senha VARCHAR(255) NOT NULL
);


-- ================================================
-- TABELA: CLIENTES
-- EDITE AQUI: campos conforme o enunciado
-- ================================================

CREATE TABLE IF NOT EXISTS clientes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nome VARCHAR(100) NOT NULL,
    cpf VARCHAR(255) NOT NULL,
    telefone VARCHAR(20),
    email VARCHAR(100)
);


-- ================================================
-- TABELA: SERVICOS
-- EDITE AQUI: campos dos serviços/produtos
-- ================================================

CREATE TABLE IF NOT EXISTS servicos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nome VARCHAR(100) NOT NULL,
    descricao TEXT,
    preco DECIMAL(10,2) NOT NULL,
    duracao INT
);


-- ================================================
-- TABELA: AGENDAMENTOS
-- ATENÇÃO: relacionamentos entre tabelas
-- ================================================

CREATE TABLE IF NOT EXISTS agendamentos (
    id INT AUTO_INCREMENT PRIMARY KEY,

    cliente_id INT NOT NULL,
    servico_id INT NOT NULL,

    data_agendamento DATETIME NOT NULL,
    status VARCHAR(50) DEFAULT 'Pendente',

    FOREIGN KEY (cliente_id) REFERENCES clientes(id),
    FOREIGN KEY (servico_id) REFERENCES servicos(id)
);


-- ================================================
-- DADOS INICIAIS: USUARIOS
-- MANTER: senha armazenada com hash
-- ================================================

INSERT INTO usuarios (nome, email, senha) VALUES
('Administrador', 'admin@sistema.com', '${senhaHash}'),
('Funcionario', 'funcionario@sistema.com', '${senhaHash}');


-- ================================================
-- DADOS INICIAIS: CLIENTES
-- EDITE AQUI: campos e informações
-- ================================================

INSERT INTO clientes (nome, cpf, telefone, email) VALUES
('Joao da Silva', '${cpf1}', '(11) 90000-1111', 'joao@email.com'),
('Maria Souza', '${cpf2}', '(11) 90000-2222', 'maria@email.com'),
('Pedro Oliveira', '${cpf3}', '(11) 90000-3333', 'pedro@email.com');


-- ================================================
-- DADOS INICIAIS: SERVICOS
-- EDITE AQUI: serviços oferecidos
-- ================================================

INSERT INTO servicos (nome, descricao, preco, duracao) VALUES
('Consulta', 'Atendimento inicial', 100.00, 60),
('Retorno', 'Consulta de retorno', 50.00, 30),
('Avaliação', 'Avaliação geral', 80.00, 45);


-- ================================================
-- DADOS INICIAIS: AGENDAMENTOS
-- ATENÇÃO: IDs precisam existir nas tabelas
-- ================================================

INSERT INTO agendamentos
(cliente_id, servico_id, data_agendamento, status) VALUES

(1, 1, '2026-11-27 09:00:00', 'Pendente'),
(2, 2, '2026-11-28 10:00:00', 'Confirmado'),
(3, 3, '2026-11-29 14:00:00', 'Pendente');

`;

// ==================================================
// GERAÇÃO DO ARQUIVO SQL
// MANTER
// ==================================================

const caminho_saida = path.join(
    __dirname,
    'database',
    'script.sql'
);

fs.mkdirSync(path.dirname(caminho_saida), {
    recursive: true
});

fs.writeFileSync(caminho_saida, script, 'utf8');

console.log(`Arquivo gerado em: ${caminho_saida}`);
