import { BadgeCheck, Dumbbell } from 'lucide-react'
import styles from './ReceiptView.module.css'

/**
 * Recibo em HTML (visualização no sistema). Mesmo layout do PDF.
 * O "papel" é sempre branco, inclusive no modo escuro.
 * @param {{ model: ReturnType<typeof import('./receiptModel').buildReceiptModel> }} props
 */
export default function ReceiptView({ model: m }) {
  const vars = {
    '--accent': m.colors.accent,
    '--accent-text': m.colors.accentText,
    '--accent-tint': m.colors.accentTint,
    '--accent-soft': m.colors.accentSoft,
    '--accent-deep': m.colors.accentDeep,
  }

  return (
    <article className={`${styles.paper} ${m.cfg.estilo === 'classico' ? styles.classic : styles.modern}`} style={vars} aria-label={`Recibo nº ${m.numero}`}>
      <header className={styles.header}>
        <div className={styles.brand}>
          <span className={styles.logo}>
            {m.logo ? <img src={m.logo} alt="" /> : m.academia.iniciais || <Dumbbell size={22} />}
          </span>
          <div className={styles.brandText}>
            <strong>{m.academia.nome}</strong>
            {m.academia.cnpj && <small>{m.academia.cnpj}</small>}
          </div>
        </div>
        <div className={styles.docTitle}>
          <span>{m.cfg.titulo}</span>
          <strong>Nº {m.numero}</strong>
        </div>
      </header>

      <div className={styles.body}>
        <section className={styles.amount}>
          <div>
            <span className={styles.label}>Valor recebido</span>
            <strong className={styles.value}>{m.valor}</strong>
            <em className={styles.extenso}>({m.valorExtenso})</em>
          </div>
          {m.cfg.exibir_selo && (
            <span className={styles.stamp}>
              <BadgeCheck size={18} /> PAGO
            </span>
          )}
        </section>

        <p className={styles.statement}>
          Recebemos de <b>{m.aluno.nome}</b>
          {m.aluno.cpf && <>, CPF {m.aluno.cpf}</>}, a importância de <b>{m.valor}</b> ({m.valorExtenso}), referente a{' '}
          <b>{m.referencia}</b>, dando plena e total quitação.
        </p>

        <dl className={styles.details}>
          {m.detalhes.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>

        {m.cfg.mensagem && <p className={styles.message}>{m.cfg.mensagem}</p>}

        <div className={styles.signRow}>
          <span className={styles.place}>{m.localData}</span>
          {m.assinatura.exibir && (
            <div className={styles.signature}>
              {m.assinatura.imagem && (
                <span className={styles.signMark}>
                  <img src={m.assinatura.imagem} alt={`Assinatura de ${m.assinatura.nome}`} />
                </span>
              )}
              {m.assinatura.cursiva && (
                <span
                  className={`${styles.signMark} ${styles.cursive}`}
                  style={{ fontSize: `${Math.round(34 * m.assinatura.cursivaEscala)}px` }}
                  aria-hidden
                >
                  {m.assinatura.cursiva}
                </span>
              )}
              <span className={styles.signLine} />
              <strong>{m.assinatura.nome}</strong>
              {m.assinatura.cargo && <small>{m.assinatura.cargo}</small>}
            </div>
          )}
        </div>
      </div>

      <footer className={styles.footer}>
        {(m.academia.endereco || m.academia.contato) && (
          <p>{[m.academia.endereco, m.academia.contato].filter(Boolean).join(' · ')}</p>
        )}
        {m.cfg.rodape && <p>{m.cfg.rodape}</p>}
        <p className={styles.auth}>
          Código de autenticidade <b>{m.codigo}</b> · Documento gerado eletronicamente
        </p>
      </footer>
    </article>
  )
}
