import { Eye, EyeOff } from 'lucide-react'
import { useState } from 'react'
import Button from '../ui/Button'
import Input from '../ui/Input'

/** Input de senha com botão mostrar/ocultar */
export default function PasswordInput(props) {
  const [visible, setVisible] = useState(false)
  return (
    <Input
      {...props}
      type={visible ? 'text' : 'password'}
      suffix={
        <Button
          variant="ghost"
          size="sm"
          icon={visible ? EyeOff : Eye}
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? 'Ocultar senha' : 'Mostrar senha'}
          tabIndex={-1}
        />
      }
    />
  )
}
