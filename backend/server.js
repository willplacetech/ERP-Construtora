import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { fileURLToPath } from 'url';
import connectDB from './config/db.js';
import errorHandler from './middleware/errorHandler.js';
import { bootstrapAdmin } from './services/bootstrapAdmin.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distPath = path.join(__dirname, '../frontend/dist');

import authRoutes from './routes/auth.js';
import clienteRoutes from './routes/clientes.js';
import obraRoutes from './routes/obras.js';
import orcamentoRoutes from './routes/orcamentos.js';
import contratoRoutes from './routes/contratos.js';
import financeiroRoutes from './routes/financeiro.js';
import materialRoutes from './routes/materiais.js';
import fornecedorRoutes from './routes/fornecedores.js';
import compraRoutes from './routes/compras.js';
import usuarioRoutes from './routes/usuarios.js';
import dashboardRoutes from './routes/dashboard.js';
import medicaoRoutes from './routes/medicoes.js';
import empresaRoutes from './routes/empresas.js';
import contaBancariaRoutes from './routes/contasBancarias.js';
import arquivoRoutes from './routes/arquivos.js';
import colaboradorRoutes from './routes/colaboradores.js';
import lembreteRoutes from './routes/lembretes.js';
import folhaRoutes from './routes/folhas.js';
import pontoRoutes from './routes/pontos.js';
import certidaoRoutes from './routes/certidoes.js';
import lancamentoFotoRoutes from './routes/lancamentoFoto.js';
import despesasRoutes from './routes/despesas.js';
import assistenteRoutes from './routes/assistente.js';
import empreiteiroRoutes from './routes/empreiteiros.js';
import reembolsoRoutes from './routes/reembolsos.js';
import chequeRoutes from './routes/cheques.js';
import acordoRoutes from './routes/acordos.js';
import recebivelObraRoutes from './routes/recebiveisObra.js';
import usuarioWhatsAppRoutes from './routes/usuarioWhatsApp.js';
import interacaoIARoutes from './routes/interacaoIA.js';
import arquivoDocumentoRoutes from './routes/arquivoDocumento.js';
import whatsappRoutes from './routes/whatsapp.js';
import mongoose from 'mongoose';

dotenv.config();

if (!process.env.MONGO_URI || !process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
	throw new Error('MONGO_URI e JWT_SECRET com pelo menos 32 caracteres sao obrigatorios');
}

const app = express();
const defaultOrigins = [
	'https://erp-construtora-back.onrender.com',
	'https://erp-construtora-pog1.onrender.com',
	'http://localhost:5173'
];
const configuredOrigins = (process.env.CORS_ORIGIN || '')
	.split(',')
	.map((origin) => origin.trim())
	.filter(Boolean);
const origins = [...new Set([...defaultOrigins, ...configuredOrigins])];
app.use(helmet({
	contentSecurityPolicy: {
		directives: {
			defaultSrc: ["'self'", 'https://erp-construtora-back.onrender.com'],
			scriptSrc: ["'self'"],
			styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
			fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
			imgSrc: ["'self'", 'data:'],
			connectSrc: ["'self'", 'https://erp-construtora-back.onrender.com'],
			frameAncestors: ["'none'"]
		}
	},
	frameguard: { action: 'deny' },
	referrerPolicy: { policy: 'strict-origin-when-cross-origin' }
}));
app.use(cors({ origin: origins }));
// Um anexo de 10 MB ocupa aproximadamente 13,4 MB ao ser enviado em base64.
app.use(['/api/assistente/analisar-imagem', '/api/assistente/whatsapp/processar'], express.json({ limit: '14mb' }));
app.use(express.json({ limit: '100kb' }));

const authLimiter = rateLimit({
	windowMs: 15 * 60 * 1000,
	limit: 20,
	standardHeaders: 'draft-7',
	legacyHeaders: false,
	skip: (req) => req.path === '/esqueci-senha',
	message: { error: 'Muitas tentativas. Tente novamente mais tarde.' }
});

// Rotas publicas e protegidas
app.use('/auth', authLimiter, authRoutes);
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/empresas', empresaRoutes);
app.use('/api/clientes', clienteRoutes);
app.use('/api/obras', obraRoutes);
app.use('/api/medicoes', medicaoRoutes);
app.use('/api/orcamentos', orcamentoRoutes);
app.use('/api/contratos', contratoRoutes);
app.use('/api/financeiro', financeiroRoutes);
app.use('/api/contas-bancarias', contaBancariaRoutes);
app.use('/api/materiais', materialRoutes);
app.use('/api/fornecedores', fornecedorRoutes);
app.use('/api/compras', compraRoutes);
app.use('/api/usuarios', usuarioRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/arquivos', arquivoRoutes);
app.use('/api/colaboradores', colaboradorRoutes);
app.use('/api/lembretes', lembreteRoutes);
app.use('/api/folhas', folhaRoutes);
app.use('/api/pontos', pontoRoutes);
app.use('/api/certidoes', certidaoRoutes);
app.use('/api/assistente', assistenteRoutes);
app.use('/api/lancamento-foto', lancamentoFotoRoutes);
app.use('/api/despesas', despesasRoutes);
app.use('/api/empreiteiros', empreiteiroRoutes);
app.use('/api/reembolsos', reembolsoRoutes);
app.use('/api/cheques', chequeRoutes);
app.use('/api/acordos', acordoRoutes);
app.use('/api/recebiveis-obra', recebivelObraRoutes);
app.use('/api/usuario-whatsapp', usuarioWhatsAppRoutes);
app.use('/api/interacao-ia', interacaoIARoutes);
app.use('/api/arquivos-documentos', arquivoDocumentoRoutes);
app.use('/api/whatsapp', whatsappRoutes);

// Servir frontend em producao
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(distPath));
  app.use((req, res, next) => {
    // Nao interceptar rotas de API, healthz ou auth
    if (req.path.startsWith('/api/') || req.path.startsWith('/auth/') || req.path === '/healthz') {
      return next();
    }
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

app.get('/healthz', (req, res) => {
	if (mongoose.connection.readyState !== 1) {
		return res.status(503).json({ ok: false });
	}
	return res.json({ ok: true });
});

app.get('/', (req, res) => res.json({ ok: true, api: 'Sienge-MERN essencial', versao: '1.0.0' }));

const PORT = process.env.PORT || 5000;
app.use((req, res, next) => {
	const err = new Error('Nao encontrado');
	err.status = 404;
	next(err);
});
app.use(errorHandler);

async function iniciar() {
	await connectDB();
	await bootstrapAdmin();
	const { criarAssistente } = await import('./services/assistente/index.js');
	await criarAssistente();
	const { iniciarScheduler } = await import('./services/assistente/scheduler.js');
	iniciarScheduler();
	app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
}

iniciar().catch((err) => {
	console.error(`Falha ao iniciar o servidor: ${err.message}`);
	process.exit(1);
});
