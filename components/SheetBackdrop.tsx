import React from 'react';

/**
 * Mörkare bakgrund bakom ett blad nerifrån. Ett tryck utanför bladet stänger det,
 * som i telefonens egna appar.
 */
export default function SheetBackdrop({ onClose }: { onClose: () => void }) {
  return (
    <div
      aria-hidden="true"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 39,
        backgroundColor: 'rgba(18, 16, 25, 0.45)',
      }}
    />
  );
}
