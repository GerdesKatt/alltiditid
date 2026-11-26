'use client';

import React from 'react';
import { useLang } from '../lib/i18n';

/** Text på två språk i sidor som renderas på servern: <Tr sv="Om" en="About" />. */
export default function Tr({ sv, en }: { sv: React.ReactNode; en: React.ReactNode }) {
  const { lang } = useLang();
  return <>{lang === 'en' ? en : sv}</>;
}
