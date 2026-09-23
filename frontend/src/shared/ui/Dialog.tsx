import { createPortal } from 'react-dom'
import type { ComponentProps } from 'react'
import { Dialog as BaseDialog } from './index'

// Compatibility entry point with the same localized, accessible dialog.
export function Dialog(props: ComponentProps<typeof BaseDialog>) {
  return createPortal(<BaseDialog {...props} />, document.body)
}
