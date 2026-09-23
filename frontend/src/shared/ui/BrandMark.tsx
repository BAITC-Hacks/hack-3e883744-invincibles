import { usePreferences } from '../lib/preferences'

export function BrandMark({ label = '' }: { label?: string }) {
  const { theme } = usePreferences()

  return (
    <img
      className="sh-brand-mark"
      src={`${import.meta.env.BASE_URL}brand/logo-${theme}.png`}
      alt={label}
      width={40}
      height={40}
      draggable={false}
    />
  )
}
