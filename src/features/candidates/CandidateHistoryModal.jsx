import { useState, useEffect } from "react";
import Modal from "../../components/Modal";
import CandidateTimeline from "../../components/CandidateTimeline";
import { getInterviewsForCandidate } from "../../api/interviews";

// Full cross-template timeline for one candidate — every interview they've
// ever had, booked/completed/cancelled/no-shown/rescheduled, in one place.
// Same CandidateTimeline component the Student Dashboard's own "History"
// tab uses for the candidate's self-service view — this is the admin-side
// equivalent, for support/dispute cases without needing the student to
// screenshot their own dashboard.
export default function CandidateHistoryModal({ candidate, onClose }) {
  const [interviews, setInterviews] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!candidate) return;
    setLoading(true);
    getInterviewsForCandidate(candidate.id)
      .then(setInterviews)
      .catch(() => setInterviews([]))
      .finally(() => setLoading(false));
  }, [candidate?.id]);

  return (
    <Modal open={!!candidate} onClose={onClose} title={`History — ${candidate?.name || ""}`} wide>
      {loading ? (
        <p className="text-sm text-gray-400 text-center py-8">Loading…</p>
      ) : (
        <CandidateTimeline interviews={interviews} emptyMessage="This candidate has no interview history yet." />
      )}
    </Modal>
  );
}
