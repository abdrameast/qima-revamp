'use client'

import { useCallback, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { buildCsv, csvFileName, type CsvColumn, type CsvMetadata } from '@/lib/csv'

/**
 * Déclenche le téléchargement d'un export CSV.
 *
 * Le fichier est construit et téléchargé **entièrement dans le navigateur** :
 * aucune donnée financière ne transite par le serveur pour cet export, et
 * aucune trace n'est laissée côté serveur.
 */
export function ExportButton<T>({
  rows,
  columns,
  metadata,
  label = 'Exporter en CSV',
  disabled,
}: {
  rows: readonly T[]
  columns: readonly CsvColumn<T>[]
  metadata: CsvMetadata
  label?: string
  disabled?: boolean
}) {
  const [busy, setBusy] = useState(false)

  const handleExport = useCallback(() => {
    setBusy(true)
    try {
      const csv = buildCsv(rows, columns, metadata)

      // Le BOM ﻿ force Excel sous Windows à lire le fichier en UTF-8.
      const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)

      const link = document.createElement('a')
      link.href = url
      link.download = csvFileName(metadata.title)
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)

      // Libère l'objet blob : sans cela il resterait en mémoire jusqu'au
      // déchargement de la page.
      URL.revokeObjectURL(url)
    } finally {
      setBusy(false)
    }
  }, [rows, columns, metadata])

  return (
    <Button
      variant="quiet"
      size="sm"
      onClick={handleExport}
      loading={busy}
      disabled={disabled || rows.length === 0}
      iconLeft={
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="size-3.5"
        >
          <path d="M12 3v12m0 0 4-4m-4 4-4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
        </svg>
      }
    >
      {label}
    </Button>
  )
}

/** Ouvre la boîte d'impression du navigateur pour la synthèse exécutive. */
export function PrintButton({ label = 'Imprimer / PDF' }: { label?: string }) {
  return (
    <Button
      variant="quiet"
      size="sm"
      onClick={() => window.print()}
      iconLeft={
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="size-3.5"
        >
          <path d="M6 9V3h12v6M6 18H4v-6h16v6h-2M8 14h8v7H8v-7Z" />
        </svg>
      }
    >
      {label}
    </Button>
  )
}
