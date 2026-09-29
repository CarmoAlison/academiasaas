import { CalendarCheck, Dumbbell, ShieldCheck, Users } from 'lucide-react'
import ThemeToggle from '../../components/shell/ThemeToggle'
import styles from './AuthLayout.module.css'

/** Layout das páginas públicas de autenticação */
export default function AuthLayout({ title, subtitle, children }) {
  return (
    <div className={styles.page}>
      <aside className={styles.brandPanel}>
        <div className={styles.brand}>
          <span className={styles.logo}>
            <Dumbbell size={22} />
          </span>
          <strong>Academia SaaS</strong>
        </div>
        <div className={styles.pitch}>
          <h2>Gestão completa para academias</h2>
          <p>Alunos, treinos, aulas e financeiro em um só lugar — com acesso seguro por CPF.</p>
          <ul>
            <li>
              <Users size={18} /> Cadastro e acompanhamento de alunos
            </li>
            <li>
              <CalendarCheck size={18} /> Agenda de aulas com reservas online
            </li>
            <li>
              <ShieldCheck size={18} /> Permissões por perfil e auditoria completa
            </li>
          </ul>
        </div>
        <small className={styles.copy}>© {new Date().getFullYear()} Academia SaaS</small>
      </aside>

      <main className={styles.formPanel}>
        <div className={styles.themeCorner}>
          <ThemeToggle />
        </div>
        <div className={styles.formBox}>
          <div className={styles.mobileBrand}>
            <span className={styles.logo}>
              <Dumbbell size={20} />
            </span>
            <strong>Academia SaaS</strong>
          </div>
          <h1 className={styles.title}>{title}</h1>
          {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
          {children}
        </div>
      </main>
    </div>
  )
}
