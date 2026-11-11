const paths = {
  social:
    'M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z',
  aniversarios:
    'M4 12h16v9H4v-9Zm-1 0h18M7 12V9h10v3M9 9V6m6 3V6M9 3v1m6-1v1M4 16c2 2 4-2 6 0s4-2 6 0 3 0 4-1',
  promocoes: 'M20 13 11 22 2 13V3h10l8 8a1.4 1.4 0 0 1 0 2ZM7 7h.01',
  clientes:
    'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m7-10a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm8 2 2 2 4-4',
  agenda:
    'M8 2v4m8-4v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14H3V6a2 2 0 0 1 2-2Zm3 10h2m4 0h2m-8 4h2',
  financeiro: 'M3 6h18v14H3V6Zm0 4h18M7 6V3h10v3m-2 9h3',
  funcionarios:
    'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m20 0v-2a4 4 0 0 0-3-3.87M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm8-7.87a4 4 0 0 1 0 7.75',
  servicos:
    'm8 8 12 12M8 16 20 4M7 7a3 3 0 1 0-6 0 3 3 0 0 0 6 0Zm0 10a3 3 0 1 0-6 0 3 3 0 0 0 6 0Z',
  usuarios: 'm12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Zm-3 9 2 2 4-4',
  sair: 'M9 4H4v16h5m5-12 4 4-4 4m-6-4h13',
  tv: 'M3 4h18v13H3V4Zm5 17h8m-4-4v4',
} as const

export type SalonIconName = keyof typeof paths

export function SalonIcon({ name }: { name: SalonIconName }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  )
}
