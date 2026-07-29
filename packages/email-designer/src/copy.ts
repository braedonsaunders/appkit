// Every user-visible string in the designer, in one overridable map. The package
// ships English and takes no i18n dependency; hosts with a translation layer
// pass their own strings through the `copy` prop.

export type EmailDesignerCopy = {
  /** Palette category shown for blocks registered without one. */
  generalCategory: string
  /** Category the palette uses for merge-field tokens. */
  fieldsCategory: string
  /** Category the palette uses for collection tables. */
  tablesCategory: string
  /** Empty state when a preset registers no blocks. */
  noBlocks: string
  /** Table toolbar. */
  tableLabel: string
  addColumn: string
  addColumnTitle: string
  removeColumn: string
  removeColumnTitle: string
  addRow: string
  addRowTitle: string
  removeRow: string
  removeRowTitle: string
  columnWidth: string
  columnWidthUnit: string
  columnWidthPlaceholder: string
}

export const DEFAULT_EMAIL_DESIGNER_COPY: EmailDesignerCopy = {
  generalCategory: 'General',
  fieldsCategory: 'Fields',
  tablesCategory: 'Tables',
  noBlocks: 'No blocks available.',
  tableLabel: 'Table',
  addColumn: '+ Col',
  addColumnTitle: 'Add column',
  removeColumn: '− Col',
  removeColumnTitle: 'Remove column',
  addRow: '+ Row',
  addRowTitle: 'Add row',
  removeRow: '− Row',
  removeRowTitle: 'Remove row',
  columnWidth: 'Width',
  columnWidthUnit: 'px',
  columnWidthPlaceholder: 'auto',
}

export function resolveEmailDesignerCopy(copy?: Partial<EmailDesignerCopy>): EmailDesignerCopy {
  return copy ? { ...DEFAULT_EMAIL_DESIGNER_COPY, ...copy } : DEFAULT_EMAIL_DESIGNER_COPY
}
