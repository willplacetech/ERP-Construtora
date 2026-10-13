export default function errorHandler(err, req, res, next) {
  console.error(err);
  if (res.headersSent) return next(err);

  if (
    err?.name === 'CastError'
    || err?.name === 'ValidationError'
    || err?.type === 'entity.parse.failed'
    || err?.status === 400
  ) {
    return res.status(400).json({ error: 'Requisição inválida' });
  }
  if (err?.name === 'DocumentNotFoundError' || err?.status === 404 || err?.statusCode === 404) {
    return res.status(404).json({ error: 'Não encontrado' });
  }
  if (err?.code === 11000 || err?.status === 409 || err?.statusCode === 409) {
    return res.status(409).json({ error: 'Conflito' });
  }
  if (err?.status === 401 || err?.statusCode === 401) {
    return res.status(401).json({ error: 'Não autorizado' });
  }
  if (err?.status === 403 || err?.statusCode === 403) {
    return res.status(403).json({ error: 'Acesso negado' });
  }
  if (err?.status === 422 || err?.statusCode === 422) {
    return res.status(422).json({ error: 'Dados inválidos' });
  }
  return res.status(500).json({ error: 'Erro interno do servidor' });
}
