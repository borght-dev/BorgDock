import type { Meta, StoryObj } from '@storybook/react-vite';
import { SplashScreen } from '@/components/SplashScreen';
import { BorgDockLogo } from './BorgDockLogo';

const meta = {
  title: 'Brand/BorgDock',
  component: BorgDockLogo,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof BorgDockLogo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Sizes: Story = {
  render: () => (
    <div className="flex min-h-screen items-center justify-center gap-8 bg-background text-text-primary">
      {[16, 18, 20, 22, 28, 48, 64].map((size) => (
        <div key={size} className="flex flex-col items-center gap-4">
          <BorgDockLogo size={size} />
          <span>{size} px</span>
        </div>
      ))}
    </div>
  ),
};

export const Loading: Story = { render: () => <SplashScreen /> };
