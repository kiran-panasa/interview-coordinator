import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Users, CalendarClock, LayoutGrid, BarChart3 } from "lucide-react";
import { useAuth } from "../../AuthContext";
import { getSlotsForInterviewers, subscribeToSlotsForInterviewers, subscribeToBlockedDates } from "../../api/firestore";
import { useUserNotifications, useScheduleInvites, useInterviews } from "../../hooks/subscriptions";
import { useSkills, useTemplates, useUsers, useCandidates, usePrograms } from "../../hooks/queries";
import Toast from "../../components/Toast";
import InterviewerNudgeTab from "../../features/nudge/InterviewerNudgeTab";
import CandidateSchedulingTab from "../../features/nudge/CandidateSchedulingTab";
import SlotOverviewTab from "../../features/nudge/SlotOverviewTab";
import NudgeAnalyticsTab from "../../features/nudge/NudgeAnalyticsTab";

const TABS = [
  { id: "interviewers", label: "Interviewers",  icon: Users },
  { id: "candidates",   label: "Candidates",    icon: CalendarClock },
  { id: "slots",        label: "Slot Overview", icon: LayoutGrid },
  { id: "analytics",    label: "Analytics",     icon: BarChart3 },
];

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
  const interviews = useInterviews();

  const activeInterviewers = usersAll.filter(
    u => (u.role === "interviewer" || u.role === "interviewer_content") && u.status === "active"
  );

  const [ivrSlots,     setIvrSlots]     = useState({});
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [blockedDates, setBlockedDates] = useState([]);

  useEffect(() => subscribeToBlockedDates(setBlockedDates), []);

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

  const badgeFor = (id) => id === "interviewers" ? unreadResponses : id === "candidates" ? pendingBookings : 0;

  return (
    <div className="p-8 max-w-5xl">
      <motion.div
        initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}
        className="mb-6"
      >
        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Nudge</h1>
        <p className="text-sm text-gray-500 mt-1">Collect interviewer slots, then invite candidates to schedule</p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.05 }}
        className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit mb-8"
      >
        {TABS.map(({ id, label, icon: Icon }) => {
          const isActive = activeTab === id;
          const badge = badgeFor(id);
          return (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`relative px-5 py-2.5 text-sm font-semibold rounded-lg transition-colors flex items-center gap-2 ${
                isActive
                  ? "text-brand-700"
                  : badge > 0
                    ? "text-red-600 hover:text-red-700"
                    : "text-gray-500 hover:text-gray-800"
              }`}
            >
              {isActive && (
                <motion.span
                  layoutId="nudgeTabIndicator"
                  className="absolute inset-0 bg-white rounded-lg shadow-sm border border-gray-200"
                  transition={{ type: "spring", stiffness: 500, damping: 35 }}
                />
              )}
              <span className="relative flex items-center gap-2">
                <Icon className="w-3.5 h-3.5" />
                {label}
                {badge > 0 && (
                  <span className="text-[10px] font-bold bg-red-500 text-white px-1.5 py-0.5 rounded-full">{badge}</span>
                )}
              </span>
            </button>
          );
        })}
      </motion.div>

      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
        >
          {activeTab === "interviewers" && (
            <InterviewerNudgeTab
              currentUser={currentUser} userProfile={userProfile}
              programs={programs} templates={templates} skills={skills} users={usersAll} activeInterviewers={activeInterviewers}
              responses={responses}
              ivrSlots={ivrSlots} slotsLoading={slotsLoading} fetchSlots={fetchSlots}
              setToast={setToast}
              blockedDates={blockedDates}
            />
          )}

          {activeTab === "slots" && (
            <SlotOverviewTab
              programs={programs} templates={templates} activeInterviewers={activeInterviewers}
              ivrSlots={ivrSlots} slotsLoading={slotsLoading} fetchSlots={fetchSlots}
              blockedDates={blockedDates}
            />
          )}

          {activeTab === "candidates" && (
            <CandidateSchedulingTab
              currentUser={currentUser}
              templates={templates} programs={programs} candidates={candidates}
              users={usersAll} activeInterviewers={activeInterviewers}
              invites={invites} ivrSlots={ivrSlots}
              setToast={setToast}
              blockedDates={blockedDates}
            />
          )}

          {activeTab === "analytics" && (
            <NudgeAnalyticsTab
              invites={invites} interviews={interviews}
              templates={templates} programs={programs} users={usersAll}
              blockedDates={blockedDates}
              setToast={setToast}
            />
          )}
        </motion.div>
      </AnimatePresence>

      {toast && <Toast message={toast.message} type={toast.type} onDone={() => setToast(null)} />}
    </div>
  );
}
