import { CalendarCheck, Dumbbell, ShieldCheck, Users } from 'lucide-react'
import ThemeToggle from '../../components/shell/ThemeToggle'
import styles from './AuthLayout.module.css'

/** Ondas decorativas (estáticas, sem animação) na base da foto */
function Waves() {
  return (
    <svg className={styles.waves} viewBox="0 0 1440 320" preserveAspectRatio="none" aria-hidden focusable="false">
      <path
        className={styles.wave1}
        d="M0,160L60,170.7C120,181,240,203,360,192C480,181,600,139,720,133.3C840,128,960,160,1080,176C1200,192,1320,192,1380,192L1440,192L1440,320L0,320Z"
      />
      <path
        className={styles.wave2}
        d="M0,224L80,213.3C160,203,320,181,480,186.7C640,192,800,224,960,234.7C1120,245,1280,235,1360,229.3L1440,224L1440,320L0,320Z"
      />
      <path
        className={styles.wave3}
        d="M0,272L90,261.3C180,251,360,229,540,234.7C720,240,900,272,1080,277.3C1260,283,1350,261,1395,250.7L1440,240L1440,320L0,320Z"
      />
    </svg>
  )
}

/** Layout das páginas públicas de autenticação: foto + ondas ao fundo e cartão do formulário */
export default function AuthLayout({ title, subtitle, children }) {
  return (
    <div className={styles.page}>
      <div className={styles.hero} aria-hidden>
        <span className={styles.ring1} />
        <span className={styles.ring2} />
        <span className={styles.dots} />
        <Waves />
      </div>

      <div className={styles.content}>
        <section className={styles.pitch}>
          <div className={styles.brand}>
            <span className={styles.logo}>
              <Dumbbell size={22} />
            </span>
            <strong>Academia SaaS</strong>
          </div>
          <h2>Gestão completa para academias</h2>
          <p>Alunos, treinos, aulas e financeiro em um só lugar — com acesso seguro por CPF.</p>
          <ul>
            <li>
              <span>
                <Users size={18} />
              </span>
              Cadastro e acompanhamento de alunos
            </li>
            <li>
              <span>
                <CalendarCheck size={18} />
              </span>
              Agenda de aulas com reservas online
            </li>
            <li>
              <span>
                <ShieldCheck size={18} />
              </span>
              Permissões por perfil e auditoria completa
            </li>
          </ul>
        </section>

        <main className={styles.card}>
          <div className={styles.themeCorner}>
            <ThemeToggle />
          </div>
          <h1 className={styles.title}>{title}</h1>
          {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
          {children}
        </main>
      </div>

      <small className={styles.copy}>© {new Date().getFullYear()} Academia SaaS</small>
    </div>
  )
}
