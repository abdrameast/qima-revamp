'use client'

import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { activeSection } from './navigation'

/**
 * Transition fluide entre les vues.
 *
 * Au changement de section, deux nappes colorées se dilatent depuis le bas de
 * l'écran puis se dissipent. Le rôle est autant fonctionnel qu'esthétique :
 * sans elle, le remplacement du contenu est instantané et l'œil perd le fil
 * de ce qui a changé.
 *
 * ## Coût
 *
 * Deux `<div>` floutés, animés uniquement en `transform` et `opacity` — donc
 * pris en charge par le compositeur, sans repasser par le fil principal. Ils
 * sont retirés du DOM dès la fin de l'animation.
 *
 * `aria-hidden` et `pointer-events: none` : purement décoratif, jamais
 * interceptif.
 */

/** Durée de la plus longue nappe, alignée sur `blob-bloom-alt`. */
const BLOB_DURATION_MS = 1100

export function ViewTransition() {
  const pathname = usePathname()
  const section = activeSection(pathname)?.href ?? pathname

  const [tracked, setTracked] = useState(section)
  const [burst, setBurst] = useState(0)

  // Ajustement d'état **pendant le rendu** plutôt que dans un effet.
  //
  // C'est le motif recommandé par React pour réagir à un changement de props :
  // React relance le rendu immédiatement, sans valider la première passe ni
  // repeindre. Passer par un `useEffect` provoquerait un rendu en cascade —
  // ce que le compilateur React signale à juste titre.
  if (tracked !== section) {
    setTracked(section)

    // Aucune nappe si le système demande un mouvement réduit.
    // `window` est défini ici : cette branche ne s'exécute qu'après une
    // navigation, donc jamais au rendu serveur.
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setBurst((n) => n + 1)
    }
  }

  // Retrait après l'animation. Le `setState` a lieu dans le rappel du
  // minuteur, donc de façon asynchrone : pas de cascade.
  useEffect(() => {
    if (burst === 0) return
    const timer = setTimeout(() => setBurst(0), BLOB_DURATION_MS)
    return () => clearTimeout(timer)
  }, [burst])

  if (burst === 0) return null

  return (
    <div
      // `key` remonté à chaque transition : les nœuds sont recréés, ce qui
      // relance les animations CSS depuis leur début même en navigation rapide.
      key={burst}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-[5] overflow-hidden"
    >
      <div
        className="animate-blob absolute left-[8%] top-[45%] size-[46rem] rounded-full blur-[90px]"
        style={{
          background:
            'radial-gradient(circle, rgb(197 167 106 / 0.30), rgb(197 167 106 / 0) 68%)',
        }}
      />
      <div
        className="animate-blob-alt absolute right-[4%] top-[58%] size-[38rem] rounded-full blur-[80px]"
        style={{
          background:
            'radial-gradient(circle, rgb(156 125 140 / 0.34), rgb(156 125 140 / 0) 66%)',
        }}
      />
    </div>
  )
}
