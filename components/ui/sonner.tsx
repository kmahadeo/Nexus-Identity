import { Toaster as SonnerToaster } from 'sonner';

type ToasterProps = React.ComponentProps<typeof SonnerToaster>;

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <SonnerToaster
      theme="dark"
      className="toaster group"
      toastOptions={{
        classNames: {
          toast: 'group toast group-[.toaster]:bg-[#0a0a12] group-[.toaster]:text-white group-[.toaster]:border-white/10 group-[.toaster]:shadow-lg group-[.toaster]:rounded-2xl group-[.toaster]:backdrop-blur-xl font-[Space_Grotesk,sans-serif]',
          description: 'group-[.toast]:text-white/50',
          actionButton: 'group-[.toast]:bg-primary group-[.toast]:text-white',
          cancelButton: 'group-[.toast]:bg-white/10 group-[.toast]:text-white/70',
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
