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
const { boundedChannel } = require('diagnostics_channel');

const app = express();
app.use(express.urlencoded({extended: false}));
app.use(cookieParser());

app.use((req, res, next) => {
    const metodo = String(req.body?.method || "").toUpperCase();
    if(req.method === 'POST' && ['PUT', 'DELETE'].includes(metodo)) {
        req.method = metodo;
    };
    next();
});

const db = mysql.createPool ({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    dateStrings: true,
});

function mostrar(nome, dados = {}) {
    const arquivo = path.join(__dirname, 'pages', `${nome}.html`);
    return Mustache.render(fs.readFileSync(arquivo, 'utf8'), dados);
};

function criptografar(texto) {
    const cifra = crypto.createCipheriv ('aes-256-cbc', process.env.CRYPTO_CHAVE, process.env.CRYPTO_IV);
    return cifra.update(texto, 'utf8', 'hex') + cifra.final('hex');
};

function descriptografar(texto) {
    const decifra = crypto.createDecipheriv('aes-256-cbc', process.env.CRYPTO_CHAVE, process.env.CRYPTO_IV);
    return decifra.update(texto, 'hex', 'utf8') + decifra.final('utf8');
};

async function excluir(res, tabela, id, volta, motivo) {
    try {
        await db.query(`DELETE FROM ${tabela} WHERE id = ?`, [id]);
        res.redirect(volta);
    } catch (erro) {
        if (erro.code === 'ER_ROW_IS_REFERENCED_2') {
            return res.status(409).send(`<p>Não foi possível excluir: ${motivo}</p> <p><a href="${volta}">Voltar</a></p>`);
        };
        console.error(erro);
        res.status(500).send(`<p>Erro ao excluir.</p> <p><a href="${volta}">Voltar</a></p>`);
    };
};

async function mostrarVeiculos(req, res, erro = "") {
    const [veiculos] = await db.query("SELECT * FROM veiculos");
    const [listaClientes] = await db.query("SELECT id, nome FROM clientes");

    const editar = veiculos.find((v) => String(v.id) === req.query.editar);
    const clientes = listaClientes.map((cliente) => ({
        ...cliente,
        selecionado: editar && cliente.id === editar.cliente_id ? "selected" : "",
    }));

    res.send(mostrar("veiculos", {
        veiculos,
        clientes,
        erro,
        editando: Boolean(editar),
        acao: editar ? `/veiculos/${editar.id}` : "/veiculos",
        form: editar || {},
    }));
};

// ========== Login ============ //
app.get("/", (req, res) => res.send(mostrar("login")));

app.post("/login", async (req, res) => {
    const {email, senha} = req.body;
    const [usuarios] = await db.query("SELECT * FROM usuarios WHERE email = ?", [email]);
    
    const usuario = usuarios[0];
    if(!usuario || !(await bcrypt.compare(senha, usuario.senha))) {
        return res.send(mostrar("login", { erro: "E-mail ou senha inválidos." }));
    };

    const token = jwt.sign({id: usuario.id, nome: usuario.nome}, process.env.JWT_SECRET, { expiresIn: "1h" });
    res.cookie("token", token, {httpOnly: true});
    res.redirect("/principal");
});

app.post("/sair", (req, res) => {
    res.clearCookie("token");
    res.redirect("/");
});

app.use((req, res, next) => {
    try {
        req.usuario = jwt.verify(req.cookies.token, process.env.JWT_SECRET);
        next();
    } catch (erro) {
        res.redirect("/");
    };
});

app.get("/principal", (req, res) => res.send(mostrar("principal", {nome: req.usuario.nome})));

// ========== Banco de Dados =========== //
const porta = process.env.PORT || 3000;
app.listen(porta, () => console.log(`Oficina rodando em http://localhost:${porta}`));
