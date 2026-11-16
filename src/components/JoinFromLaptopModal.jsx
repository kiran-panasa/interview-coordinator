import { Laptop } from "lucide-react";
import Modal from "./Modal";

// Shown instead of opening the Meet link when the interviewer's browser
// looks like a phone/tablet (see utils/device.js) — interviews should be
// conducted from a laptop, not a mobile device.
export default function JoinFromLaptopModal({ open, onClose }) {
  return (
    <Modal open={open} onClose={onClose} title="Please join from your laptop">
      <div className="flex flex-col items-center text-center gap-3 py-2">
        <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center flex-shrink-0">
          <Laptop className="w-6 h-6" />
        </div>
        <p className="text-sm text-gray-600">
          Interviews need to be conducted from a laptop, not a mobile device — please open this page on your laptop to join the meeting.
        </p>
        <button onClick={onClose} type="button"
          className="mt-1 px-5 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-full hover:bg-emerald-700 transition-colors">
          Got it
        </button>
      </div>
    </Modal>
  );
}
