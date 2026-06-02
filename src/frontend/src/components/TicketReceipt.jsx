export default function TicketReceipt({ ticket, schoolName = 'Al-Noor School', ticketSettings = {}, closeLabel = 'CREATE ANOTHER TICKET', onClose }) {
  const handlePrint = () => window.print();

  const show = (key) => ticketSettings[key] !== 'false';
  const isThermal = ticketSettings.ticket_paper === 'thermal';
  const footer = ticketSettings.ticket_footer ||
    'Please wait in the reception area.\nYour number will appear on the screen.';
  const numberSizeClass = {
    xs:    'text-3xl',
    sm:    'text-4xl',
    large: 'text-8xl',
    xl:    'text-9xl',
  }[ticketSettings.ticket_number_size] || 'text-6xl';

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      {isThermal && (
        <style>{`@media print { @page { size: 80mm auto; margin: 4mm; } }`}</style>
      )}

      <div className={`bg-white rounded-lg shadow-lg p-8 ${isThermal ? 'max-w-xs' : 'max-w-md'} w-full`}>
        <div className="print-area text-center">
          <h1 className="text-3xl font-bold text-navy mb-2">{schoolName.toUpperCase()}</h1>
          <p className="text-gray-600 mb-6">Queue Ticket</p>

          <div className="border-t-2 border-b-2 border-navy py-6 my-6">
            <p className={`${numberSizeClass} font-bold text-teal mb-4`}>{ticket.ticket_number}</p>
          </div>

          <div className="text-left space-y-2 mb-6">
            {show('ticket_show_parent') && ticket.parent_name && (
              <p className="text-lg"><span className="font-semibold">Parent:</span> {ticket.parent_name}</p>
            )}
            {show('ticket_show_student') && ticket.student_name && (
              <p className="text-lg"><span className="font-semibold">Student:</span> {ticket.student_name}</p>
            )}
            {show('ticket_show_time') && (
              <p className="text-lg"><span className="font-semibold">Time:</span> {new Date(ticket.created_at).toLocaleTimeString()}</p>
            )}
            {show('ticket_show_wait') && ticket.estimated_wait && (
              <p className="text-lg"><span className="font-semibold">Est. Wait:</span> {ticket.estimated_wait} minutes</p>
            )}
          </div>

          {footer && (
            <p className="text-gray-600 text-sm border-t pt-4" style={{ whiteSpace: 'pre-line' }}>
              {footer}
            </p>
          )}
        </div>

        <div className="flex gap-4 mt-8 no-print">
          <button
            onClick={handlePrint}
            className="flex-1 bg-navy text-white py-3 rounded-lg hover:bg-opacity-90 font-semibold"
          >
            PRINT
          </button>
          <button
            onClick={onClose}
            className="flex-1 bg-teal text-white py-3 rounded-lg hover:bg-opacity-90 font-semibold"
          >
            {closeLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
