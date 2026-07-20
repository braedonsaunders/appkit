import { CustomizationWorkbench } from './workbench'

export const metadata = { title: 'Customization — appkit' }

export default function CustomizationPage() {
  return (
    <div className="h-full min-h-0 overflow-hidden">
      <CustomizationWorkbench />
    </div>
  )
}
