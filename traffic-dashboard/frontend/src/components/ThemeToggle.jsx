import { useTheme } from '../theme.jsx'
import Icon from './Icon.jsx'

export default function ThemeToggle() {
  const { theme, toggle } = useTheme()
  const dark = theme === 'dark'
  return (
    <button type="button" className="icon-btn" onClick={toggle} aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={dark ? 'Light mode' : 'Dark mode'}>
      <Icon name={dark ? 'sun' : 'moon'} size={18} />
    </button>
  )
}
