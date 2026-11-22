import { ReactNode, useEffect } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  open: boolean;
  title: string;
  subtitle?: string;
  onClose?: () => void;
  closeDisabled?: boolean;
  children: ReactNode;
}

export function Modal({
  open,
  title,
  subtitle,
  onClose,
  closeDisabled = false,
  children,
}: ModalProps) {
  useEffect(() => {
    if (!open || !onClose || closeDisabled) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose?.();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose, closeDisabled]);

  if (!open) return null;

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && onClose && !closeDisabled) {
          onClose();
        }
      }}
    >
      <div
        className="modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
      >
        <div className="modal-header">
          <div>
            <h2 id="modal-title" className="modal-title">
              {title}
            </h2>
            {subtitle && <p className="modal-subtitle">{subtitle}</p>}
          </div>
          {onClose && !closeDisabled && (
            <button
              type="button"
              className="modal-close"
              onClick={onClose}
              aria-label="Fechar janela"
            >
              <X size={16} />
            </button>
          )}
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}
