export default function TicketReceipt({ ticket, schoolName = 'Al-Noor School', onClose }) {
  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full">
        <div className="print-area text-center">
          <h1 className="text-3xl font-bold text-navy mb-2">{schoolName.toUpperCase()}</h1>
          <p className="text-gray-600 mb-6">Queue Ticket</p>

          <div className="border-t-2 border-b-2 border-navy py-6 my-6">
            <p className="text-6xl font-bold text-teal mb-4">{ticket.ticket_number}</p>
          </div>

          <div className="text-left space-y-2 mb-6">
            <p className="text-lg"><span className="font-semibold">Parent:</span> {ticket.parent_name}</p>
            <p className="text-lg"><span className="font-semibold">Student:</span> {ticket.student_name}</p>
            <p className="text-lg"><span className="font-semibold">Time:</span> {new Date(ticket.created_at).toLocaleTimeString()}</p>
            {ticket.estimated_wait && (
              <p className="text-lg"><span className="font-semibold">Est. Wait:</span> {ticket.estimated_wait} minutes</p>
            )}
          </div>

          <p className="text-gray-600 text-sm border-t pt-4">
            Please wait in the reception area.<br />
            Your number will appear on the screen.
          </p>
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
            CREATE ANOTHER TICKET
          </button>
        </div>
      </div>
    </div>
  );
}
