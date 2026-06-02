import useToastStore from '../store/useToastStore';

const STYLES = {
  error:   'bg-red-600 text-white',
  success: 'bg-green-600 text-white',
  info:    'bg-blue-600 text-white',
};

const ICONS = {
  error:   '✕',
  success: '✓',
  info:    'ℹ',
};

export default function Toast() {
  const { toasts, removeToast } = useToastStore();

  if (!toasts.length) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2 max-w-sm">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`flex items-start gap-3 px-4 py-3 rounded-lg shadow-lg text-sm font-medium ${STYLES[t.type]} animate-fade-in`}
        >
          <span className="shrink-0 font-bold">{ICONS[t.type]}</span>
          <span className="flex-1">{t.message}</span>
          <button
            onClick={() => removeToast(t.id)}
            className="shrink-0 opacity-70 hover:opacity-100 leading-none"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
