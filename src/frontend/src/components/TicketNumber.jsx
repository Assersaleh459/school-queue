// Ticket numbers are long (e.g. ADM-20261025-001U). One line, sized to fit the box it is in,
// never bigger than maxSize. Pure CSS (container query units), so it also holds when printing.
// shortcut: 0.64em per character is an average for bold digits/capitals; widen it if a font changes.
export default function TicketNumber({ value, maxSize = '3.75rem', spacing = 0, className = '' }) {
  const text = String(value ?? '');
  const perChar = 0.64 + spacing;
  return (
    <div className="w-full" style={{ containerType: 'inline-size' }}>
      <p
        className={className}
        style={{
          whiteSpace: 'nowrap',
          lineHeight: 1.15,
          letterSpacing: spacing ? `${spacing}em` : undefined,
          fontSize: `min(${maxSize}, calc(100cqw / ${Math.max(text.length, 1) * perChar}))`,
        }}
      >
        {text}
      </p>
    </div>
  );
}
