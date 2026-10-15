import { useQuery } from '@tanstack/react-query'
import { useTenant } from '../../../hooks/useAuth'
import { listCatracasAcademia } from '../../../services/catracaService'
import DigitalCard from './DigitalCard'
import FaceCard from './FaceCard'

const le = (c, metodo) => (c.metodos ?? ['facial']).includes(metodo)

/** Cards de rosto e/ou digital na ficha do aluno, conforme o que as catracas da academia leem */
export default function CatracaBiometria({ student }) {
  const { academyId } = useTenant()
  const catracas = useQuery({ queryKey: ['catracas-academia', academyId], queryFn: () => listCatracasAcademia(academyId) })
  const lista = catracas.data ?? []
  const digitais = lista.filter((c) => le(c, 'digital'))
  // sem catraca cadastrada ainda (ou lista indisponível): mostra o rosto, como padrão
  const facial = !lista.length || lista.some((c) => le(c, 'facial'))

  if (catracas.isPending) return null
  return (
    <>
      {facial && <FaceCard student={student} />}
      {digitais.length > 0 && <DigitalCard student={student} catracas={digitais} />}
    </>
  )
}
