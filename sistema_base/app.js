
require('dotenv').config();

const fs = require('fs');
const path = require('path');

const express = require('express');
const mysql = require('mysql2/promise');

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const cookieParser = require('cookie-parser');
const Mustache = require('mustache');

const app = express();

app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

// ==================================================
// MIDDLEWARE: ADAPTAR PUT E DELETE
// MANTER
// ==================================================

app.use((req, res, next) => {
    const metodo = String(req.body?._method || '').toUpperCase();

    if (req.method === 'POST' && ['PUT', 'DELETE'].includes(metodo)) {
        req.method = metodo;
    }

    next();
});

// ==================================================
// CONEXÃO COM BANCO DE DADOS
// EDITE AQUI: caso os nomes sejam diferentes
// ==================================================

const db = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    dateStrings: true,
});

// ==================================================
// FUNÇÕES AUXILIARES
// MANTER
// ==================================================

// Renderizar páginas HTML com Mustache
function mostrar(nome, dados = {}) {
    const arquivo = path.join(__dirname, 'pages', `${nome}.html`);

    return Mustache.render(
        fs.readFileSync(arquivo, 'utf8'),
        dados
    );
}

// Criptografar informações
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

// Descriptografar informações
function descriptografar(texto) {
    const chave = Buffer.from(process.env.CRYPTO_CHAVE, 'utf8');
    const iv = Buffer.from(process.env.CRYPTO_IV, 'utf8');

    const decifra = crypto.createDecipheriv(
        'aes-256-cbc',
        chave,
        iv
    );

    return decifra.update(texto, 'hex', 'utf8')
        + decifra.final('utf8');
}

// Excluir registros com tratamento de chave estrangeira
async function excluir(res, tabela, id, volta, motivo) {
    try {
        await db.query(
            `DELETE FROM ${tabela} WHERE id = ?`,
            [id]
        );

        res.redirect(volta);

    } catch (erro) {

        if (erro.code === 'ER_ROW_IS_REFERENCED_2') {
            return res.status(409).send(
                `<p>Não foi possível excluir: ${motivo}</p>
                 <p><a href="${volta}">Voltar</a></p>`
            );
        }

        console.error(erro);

        res.status(500).send(
            `<p>Erro ao excluir.</p>
             <p><a href="${volta}">Voltar</a></p>`
        );
    }
}


// ==================================================
// LOGIN
// MANTER: normalmente não precisa alterar
// ==================================================

app.get('/', (req, res) => {
    res.send(mostrar('login'));
});

app.post('/login', async (req, res) => {

    const { email, senha } = req.body;

    const [usuarios] = await db.query(
        'SELECT * FROM usuarios WHERE email = ?',
        [email]
    );

    const usuario = usuarios[0];

    if (!usuario || !(await bcrypt.compare(senha, usuario.senha))) {
        return res.send(
            mostrar('login', {
                erro: 'E-mail ou senha inválidos.'
            })
        );
    }

    const token = jwt.sign(
        {
            id: usuario.id,
            nome: usuario.nome
        },
        process.env.JWT_SECRET,
        {
            expiresIn: '1h'
        }
    );

    res.cookie('token', token, {
        httpOnly: true
    });

    res.redirect('/principal');
});

app.post('/sair', (req, res) => {
    res.clearCookie('token');
    res.redirect('/');
});

// ==================================================
// AUTENTICAÇÃO
// MANTER
// ==================================================

app.use((req, res, next) => {

    try {

        req.usuario = jwt.verify(
            req.cookies.token,
            process.env.JWT_SECRET
        );

        next();

    } catch (erro) {

        res.redirect('/');
    }
});

// Página principal
app.get('/principal', (req, res) => {
    res.send(
        mostrar('principal', {
            nome: req.usuario.nome
        })
    );
});


// ==================================================
// ENTIDADE 1: CLIENTES
// EDITE AQUI: nome da entidade e campos
// ==================================================

// LISTAR E PESQUISAR
app.get('/clientes', async (req, res) => {

    const busca = req.query.busca || '';

    const [lista] = await db.query(
        'SELECT * FROM clientes WHERE nome LIKE ?',
        [`%${busca}%`]
    );

    // ATENÇÃO: descriptografar o CPF antes de exibir
    const clientes = lista.map(cliente => ({
        ...cliente,
        cpf: descriptografar(cliente.cpf)
    }));

    const editar = clientes.find(
        cliente => String(cliente.id) === req.query.editar
    );

    res.send(
        mostrar('clientes', {
            busca,
            clientes,
            editando: Boolean(editar),
            acao: editar ? `/clientes/${editar.id}` : '/clientes',
            form: editar || {}
        })
    );
});


// CADASTRAR
app.post('/clientes', async (req, res) => {

    const { nome, cpf, telefone, email } = req.body;

    await db.query(
        `INSERT INTO clientes
        (nome, cpf, telefone, email)
        VALUES (?, ?, ?, ?)`,
        [
            nome,
            criptografar(cpf),
            telefone,
            email
        ]
    );

    res.redirect('/clientes');
});


// EDITAR
app.put('/clientes/:id', async (req, res) => {

    const { nome, cpf, telefone, email } = req.body;

    await db.query(
        `UPDATE clientes
        SET nome = ?, cpf = ?, telefone = ?, email = ?
        WHERE id = ?`,
        [
            nome,
            criptografar(cpf),
            telefone,
            email,
            req.params.id
        ]
    );

    res.redirect('/clientes');
});


// EXCLUIR
app.delete('/clientes/:id', async (req, res) => {

    await excluir(
        res,
        'clientes',
        req.params.id,
        '/clientes',
        'O cliente possui agendamentos cadastrados.'
    );
});


// ==================================================
// ENTIDADE 2: SERVIÇOS
// EDITE AQUI: nome da entidade e campos
// ==================================================

// LISTAR E PREPARAR EDIÇÃO
async function mostrarServicos(req, res, erro = '') {

    const [servicos] = await db.query(
        'SELECT * FROM servicos'
    );

    const editar = servicos.find(
        servico => String(servico.id) === req.query.editar
    );

    res.send(
        mostrar('servicos', {
            servicos,
            erro,
            editando: Boolean(editar),
            acao: editar ? `/servicos/${editar.id}` : '/servicos',
            form: editar || {}
        })
    );
}

app.get('/servicos', async (req, res) => {
    await mostrarServicos(req, res);
});


// CADASTRAR
app.post('/servicos', async (req, res) => {

    const { nome, descricao, preco, duracao } = req.body;

    await db.query(
        `INSERT INTO servicos
        (nome, descricao, preco, duracao)
        VALUES (?, ?, ?, ?)`,
        [
            nome,
            descricao,
            preco,
            duracao || null
        ]
    );

    res.redirect('/servicos');
});


// EDITAR
app.put('/servicos/:id', async (req, res) => {

    const { nome, descricao, preco, duracao } = req.body;

    await db.query(
        `UPDATE servicos
        SET nome = ?, descricao = ?, preco = ?, duracao = ?
        WHERE id = ?`,
        [
            nome,
            descricao,
            preco,
            duracao || null,
            req.params.id
        ]
    );

    res.redirect('/servicos');
});


// EXCLUIR
app.delete('/servicos/:id', async (req, res) => {

    await excluir(
        res,
        'servicos',
        req.params.id,
        '/servicos',
        'O serviço possui agendamentos cadastrados.'
    );
});


// ==================================================
// ENTIDADE 3: AGENDAMENTOS
// ATENÇÃO: possui relacionamentos
// ==================================================

// LISTAR, RELACIONAR E PREPARAR EDIÇÃO
async function mostrarAgendamentos(req, res, erro = '') {

    const [lista] = await db.query(
        `SELECT
            agendamentos.*,
            clientes.nome AS cliente_nome,
            servicos.nome AS servico_nome

        FROM agendamentos

        JOIN clientes
        ON clientes.id = agendamentos.cliente_id

        JOIN servicos
        ON servicos.id = agendamentos.servico_id

        ORDER BY agendamentos.data_agendamento`
    );

    const [listaClientes] = await db.query(
        'SELECT id, nome FROM clientes'
    );

    const [listaServicos] = await db.query(
        'SELECT id, nome FROM servicos'
    );

    const agendamentos = lista.map(a => ({
        ...a,

        data_br: new Date(
            a.data_agendamento.replace(' ', 'T')
        ).toLocaleString('pt-BR'),

        data_input: a.data_agendamento
            .slice(0, 16)
            .replace(' ', 'T')
    }));

    const editar = agendamentos.find(
        a => String(a.id) === req.query.editar
    );

    const clientes = listaClientes.map(cliente => ({
        ...cliente,

        selecionado: editar &&
            cliente.id === editar.cliente_id
            ? 'selected'
            : ''
    }));

    const servicos = listaServicos.map(servico => ({
        ...servico,

        selecionado: editar &&
            servico.id === editar.servico_id
            ? 'selected'
            : ''
    }));

    res.send(
        mostrar('agendamentos', {
            agendamentos,
            clientes,
            servicos,
            erro,
            editando: Boolean(editar),
            acao: editar
                ? `/agendamentos/${editar.id}`
                : '/agendamentos',
            form: editar ? {
                ...editar,
                statusPendente: editar.status === 'Pendente',
                statusConfirmado: editar.status === 'Confirmado',
                statusConcluido: editar.status === 'Concluído',
                statusCancelado: editar.status === 'Cancelado'
            } : {}
        })
    );
}

app.get('/agendamentos', async (req, res) => {
    await mostrarAgendamentos(req, res);
});


// CADASTRAR
app.post('/agendamentos', async (req, res) => {

    const {
        cliente_id,
        servico_id,
        data_agendamento,
        status
    } = req.body;

    if (!cliente_id || !servico_id) {
        return mostrarAgendamentos(
            req,
            res,
            'Selecione o cliente e o serviço.'
        );
    }

    await db.query(
        `INSERT INTO agendamentos
        (cliente_id, servico_id, data_agendamento, status)
        VALUES (?, ?, ?, ?)`,
        [
            cliente_id,
            servico_id,
            data_agendamento.replace('T', ' '),
            status || 'Pendente'
        ]
    );

    res.redirect('/agendamentos');
});


// EDITAR
app.put('/agendamentos/:id', async (req, res) => {

    const {
        cliente_id,
        servico_id,
        data_agendamento,
        status
    } = req.body;

    await db.query(
        `UPDATE agendamentos
        SET cliente_id = ?,
            servico_id = ?,
            data_agendamento = ?,
            status = ?
        WHERE id = ?`,
        [
            cliente_id,
            servico_id,
            data_agendamento.replace('T', ' '),
            status,
            req.params.id
        ]
    );

    res.redirect('/agendamentos');
});


// EXCLUIR
app.delete('/agendamentos/:id', async (req, res) => {

    await excluir(
        res,
        'agendamentos',
        req.params.id,
        '/agendamentos',
        'Não foi possível excluir o agendamento.'
    );
});


// ==================================================
// INICIALIZAÇÃO DO SERVIDOR
// MANTER
// ==================================================

const porta = process.env.PORT || 3000;

app.listen(porta, () => {
    console.log(`Sistema rodando em http://localhost:${porta}`);
});
