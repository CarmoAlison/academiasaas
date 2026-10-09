import { firstName } from '../../../utils/formatters'
import styles from './AniversarioBanner.module.css'

/** Banner especial no dia do aniversário do aluno */
export default function AniversarioBanner({ nome, nascimento, academia }) {
  if (!nascimento) return null
  const hoje = new Date()
  const [ano, mes, dia] = nascimento.split('-').map(Number)
  if (mes !== hoje.getMonth() + 1 || dia !== hoje.getDate()) return null
  const idade = hoje.getFullYear() - ano

  return (
    <section className={styles.banner} role="status">
      <span className={styles.emoji} aria-hidden>
        🎉
      </span>
      <div>
        <strong>Feliz aniversário, {firstName(nome)}!</strong>
        <p>
          {idade > 0 && idade < 120 ? `${idade} anos! ` : ''}Toda a equipe {academia ? `da ${academia} ` : ''}deseja muita saúde e ótimos treinos. 💪
        </p>
      </div>
      <span className={styles.confetti} aria-hidden>
        🎂
      </span>
    </section>
  )
}
