import { useState, useEffect } from "react";
import { useAuth } from "../../AuthContext";
import { getSlotsForInterviewers, subscribeToSlotsForInterviewers } from "../../api/firestore";
import { useUserNotifications, useScheduleInvites } from "../../hooks/subscriptions";
import { useSkills, useTemplates, useUsers, useCandidates, usePrograms } from "../../hooks/queries";
import Toast from "../../components/Toast";
import InterviewerNudgeTab from "../../features/nudge/InterviewerNudgeTab";
import CandidateSchedulingTab from "../../features/nudge/CandidateSchedulingTab";
import SlotOverviewTab from "../../features/nudge/SlotOverviewTab";

export default function NudgePage() {
  const { currentUser, userProfile } = useAuth();
  const [activeTab, setActiveTab] = useState("interviewers");
  const [toast,     setToast]     = useState(null);

  const { data: templates  = [] } = useTemplates();
  const { data: usersAll   = [] } = useUsers();
  const { data: skills     = [] } = useSkills();
  const { data: programs   = [] } = usePrograms();
  const { data: candidates = [] } = useCandidates();
  const responses = useUserNotifications(currentUser.uid);
  const invites   = useScheduleInvites();

  const activeInterviewers = usersAll.filter(
    u => (u.role === "interviewer" || u.role === "interviewer_content") && u.status === "active"
  );

  const [ivrSlots,     setIvrSlots]     = useState({});
  const [slotsLoading, setSlotsLoading] = useState(false);

  // Manual refresh still available for the button in each tab
  const fetchSlots = async (ids) => {
    if (!ids.length) return;
    setSlotsLoading(true);
    try { setIvrSlots(await getSlotsForInterviewers(ids)); }
    finally { setSlotsLoading(false); }
  };

  // Real-time subscription — auto-updates when any interviewer adds/removes a slot
  const ivrIdsKey = activeInterviewers.map(u => u.id).join(",");
  useEffect(() => {
    if (!activeInterviewers.length) return;
    setSlotsLoading(true);
    return subscribeToSlotsForInterviewers(
      activeInterviewers.map(u => u.id),
      (slots) => { setIvrSlots(slots); setSlotsLoading(false); }
    );
  }, [ivrIdsKey]); // eslint-disable-line

  const unreadResponses  = responses.filter(n => n.type === "response" && n.status === "unread").length;
  const pendingBookings  = invites.filter(i => i.status === "pending_confirmation").length;

  const Tab = ({ id, label, badge }) => (
    <button onClick={() => setActiveTab(id)}
      className={`px-5 py-2.5 text-sm font-semibold rounded-lg transition-colors flex items-center gap-2 ${
        activeTab === id
          ? "bg-white text-indigo-700 shadow-sm border border-gray-200"
          : badge > 0
            ? "bg-red-50 text-red-700 hover:bg-red-100"
            : "text-gray-500 hover:text-gray-800"
      }`}>
      {label}
      {badge > 0 && <span className="text-[10px] font-bold bg-red-500 text-white px-1.5 py-0.5 rounded-full">{badge}</span>}
    </button>
  );

  return (
    <div className="p-8 max-w-5xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Nudge</h1>
        <p className="text-sm text-gray-500 mt-0.5">Collect interviewer slots, then invite candidates to schedule</p>
      </div>

      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit mb-8">
        <Tab id="interviewers" label="Interviewers" badge={unreadResponses} />
        <Tab id="candidates"   label="Candidates"   badge={pendingBookings} />
        <Tab id="slots"        label="Slot Overview" />
      </div>

      {activeTab === "interviewers" && (
        <InterviewerNudgeTab
          currentUser={currentUser} userProfile={userProfile}
          templates={templates} skills={skills} users={usersAll} activeInterviewers={activeInterviewers}
          programs={programs}
          responses={responses}
          ivrSlots={ivrSlots} slotsLoading={slotsLoading} fetchSlots={fetchSlots}
          setToast={setToast}
        />
      )}

      {activeTab === "slots" && (
        <SlotOverviewTab
          templates={templates} activeInterviewers={activeInterviewers}
          ivrSlots={ivrSlots} slotsLoading={slotsLoading} fetchSlots={fetchSlots}
        />
      )}

      {activeTab === "candidates" && (
        <CandidateSchedulingTab
          currentUser={currentUser}
          templates={templates} programs={programs} candidates={candidates}
          users={usersAll} activeInterviewers={activeInterviewers}
          invites={invites} ivrSlots={ivrSlots}
          setToast={setToast}
        />
      )}

      {toast && <Toast message={toast.message} type={toast.type} onDone={() => setToast(null)} />}
    </div>
  );
}
