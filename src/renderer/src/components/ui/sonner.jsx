import { Toaster as Sonner } from 'sonner';

const Toaster = ({ ...props }) => {
  return (
    <Sonner
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            'group toast group-[.toaster]:bg-white group-[.toaster]:text-zinc-950 group-[.toaster]:border-zinc-200 group-[.toaster]:shadow-lg group-[.toaster]:rounded-xl group-[.toaster]:p-4 group-[.toaster]:gap-3',
          description: 'group-[.toast]:text-zinc-500',
          actionButton:
            'group-[.toast]:bg-zinc-900 group-[.toast]:text-zinc-50 font-medium',
          cancelButton:
            'group-[.toast]:bg-zinc-100 group-[.toast]:text-zinc-500 font-medium',
        },
      }}
      position="top-right"
      {...props}
    />
  );
};

export { Toaster };
