import { Dumbbell, ShieldCheck } from 'lucide-react'
import receiptStyles from '../receipt/ReceiptView.module.css'
import styles from './ContractView.module.css'

/**
 * Contrato em HTML (mesmo cabeçalho/assinatura do recibo). Papel sempre branco.
 * @param {{ model: ReturnType<typeof import('./contractModel').buildContractModel> }} props
 */
export default function ContractView({ model: m }) {
  const vars = {
    '--accent': m.colors.accent,
    '--accent-text': m.colors.accentText,
    '--accent-tint': m.colors.accentTint,
    '--accent-soft': m.colors.accentSoft,
    '--accent-deep': m.colors.accentDeep,
  }
  const rs = receiptStyles

  return (
    <article className={`${rs.paper} ${m.cfg.estilo === 'classico' ? rs.classic : rs.modern}`} style={vars} aria-label={m.titulo}>
      <header className={rs.header}>
        <div className={rs.brand}>
          <span className={rs.logo}>{m.logo ? <img src={m.logo} alt="" /> : m.academia.iniciais || <Dumbbell size={22} />}</span>
          <div className={rs.brandText}>
            <strong>{m.academia.nome}</strong>
            {m.academia.cnpj && <small>{m.academia.cnpj}</small>}
          </div>
        </div>
        <div className={rs.docTitle}>
          <span>Contrato</span>
          <strong className={styles.code}>{m.codigo.slice(0, 9)}</strong>
        </div>
      </header>

      <div className={`${rs.body} ${styles.body}`}>
        {!m.temCabecalho && <h2 className={styles.title}>{m.titulo}</h2>}
        {m.paragrafos.map((p, i) => (
          <p key={i} className={i === 0 && m.temCabecalho ? styles.heading : styles.paragraph}>
            {p}
          </p>
        ))}

        <section className={styles.acceptance}>
          {m.aceite ? (
            <>
              <ShieldCheck size={20} />
              <div>
                <strong>Aceito eletronicamente</strong>
                <span>
                  por {m.aceite.nome}
                  {m.aceite.cpf && `, CPF ${m.aceite.cpf}`}, em {m.aceite.em} · IP {m.aceite.ip}
                </span>
              </div>
            </>
          ) : (
            <div>
              <strong>{m.status === 'cancelado' ? 'Contrato cancelado (substituído ou anulado)' : 'Aguardando aceite do aluno'}</strong>
              <span>
                Contratante: {m.aluno.nome}
                {m.aluno.cpf && `, CPF ${m.aluno.cpf}`}
              </span>
            </div>
          )}
        </section>

        <div className={rs.signRow}>
          <span className={rs.place}>Emitido em {m.emitidoEm}</span>
          <div className={rs.signature}>
            {m.assinatura.imagem && (
              <span className={rs.signMark}>
                <img src={m.assinatura.imagem} alt={`Assinatura de ${m.assinatura.nome}`} />
              </span>
            )}
            {m.assinatura.cursiva && (
              <span className={`${rs.signMark} ${rs.cursive}`} style={{ fontSize: `${Math.round(34 * m.assinatura.cursivaEscala)}px` }} aria-hidden>
                {m.assinatura.cursiva}
              </span>
            )}
            <span className={rs.signLine} />
            <strong>{m.assinatura.nome}</strong>
            {m.assinatura.cargo && <small>{m.assinatura.cargo}</small>}
          </div>
        </div>
      </div>

      <footer className={rs.footer}>
        {m.academia.rodape && <p>{m.academia.rodape}</p>}
        <p className={rs.auth}>
          Código de verificação <b>{m.codigo}</b> · Documento eletrônico
        </p>
      </footer>
    </article>
  )
}
