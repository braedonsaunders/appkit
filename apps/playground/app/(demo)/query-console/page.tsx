import { QueryConsoleWorkbench } from './workbench'

export const metadata = {
  title: 'Query Console — appkit',
  description: 'A governed raw-SQL workbench with schema discovery, snippets, history, and CSV export.',
}

export default function QueryConsoleDemoPage() {
  return (
    <main className="h-[calc(100dvh-3.5rem)] min-h-0 p-4 lg:p-6">
      <QueryConsoleWorkbench />
    </main>
  )
}
