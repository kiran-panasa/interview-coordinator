import { motion } from "framer-motion";
import { Inbox, CheckCircle2, XCircle } from "lucide-react";
import { formatDateShort } from "../../utils/dates";

export default function AdhocReviewTab({ adhocQs, pendingAdhoc, interviewerNameById = {}, templateNameById, openApprove, handleReject }) {
  return (
    <div className="space-y-4">
      {adhocQs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-2 bg-white rounded-2xl border border-gray-100 shadow-soft">
          <Inbox className="w-10 h-10 text-gray-200" strokeWidth={1.5} />
          <p className="text-sm text-gray-400">No questions in the review queue.</p>
        </div>
      ) : (
        <>
          <motion.div
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}
            className="flex gap-4 text-xs text-gray-500"
          >
            <span><span className="inline-block w-2 h-2 rounded-full bg-amber-400 mr-1"></span>{pendingAdhoc.length} pending</span>
            <span><span className="inline-block w-2 h-2 rounded-full bg-emerald-400 mr-1"></span>{adhocQs.filter(q => q.status === "approved").length} approved</span>
            <span><span className="inline-block w-2 h-2 rounded-full bg-gray-300 mr-1"></span>{adhocQs.filter(q => q.status === "rejected").length} rejected</span>
          </motion.div>
          {adhocQs.map((q, idx) => {
            const statusStyle = { pending: "border-amber-200 bg-amber-50/40", approved: "border-emerald-200 bg-emerald-50/30", rejected: "border-gray-200 bg-gray-50 opacity-60" }[q.status] || "border-gray-100 bg-white";
            const statusBadge = { pending: "bg-amber-100 text-amber-700", approved: "bg-emerald-100 text-emerald-700", rejected: "bg-gray-100 text-gray-500" }[q.status] || "bg-gray-100 text-gray-500";
            const panelistName = q.interviewerName || interviewerNameById[q.interviewerId] || null;
            const sectionName  = q.templateName || (q.templateId && templateNameById.get(q.templateId)) || q.round || null;
            return (
              <motion.div
                key={q.id}
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, delay: Math.min(idx * 0.03, 0.3) }}
                className={`rounded-2xl border shadow-soft p-4 hover:bg-gray-50/70 transition-colors ${statusStyle}`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 leading-snug whitespace-pre-wrap">{q.text}</p>
                    <div className="flex flex-wrap gap-2 mt-2 text-xs text-gray-400">
                      {panelistName && <span>Panelist: <span className="font-semibold text-gray-600">{panelistName}</span></span>}
                      {sectionName  && <span>Section: <span className="font-semibold text-gray-600">{sectionName}</span></span>}
                      {q.interviewId && <span>Interview: <span className="font-mono text-gray-500">#{q.interviewId.slice(0, 8)}</span></span>}
                      {q.createdAt   && <span>{formatDateShort(q.createdAt)}</span>}
                      {q.status === "approved" && q.promotedQuestionId && (
                        <span className="text-emerald-600">Promoted → #{q.promotedQuestionId.slice(0, 8)}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full capitalize ${statusBadge}`}>{q.status}</span>
                    {q.status === "pending" && (
                      <>
                        <button onClick={() => openApprove(q)}
                          className="flex items-center gap-1 text-xs font-semibold text-white bg-emerald-600 px-3 py-1.5 rounded-lg hover:bg-emerald-700 transition-colors">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Approve
                        </button>
                        <button onClick={() => handleReject(q)}
                          className="flex items-center gap-1 text-xs font-semibold text-red-600 bg-red-50 border border-red-200 px-3 py-1.5 rounded-lg hover:bg-red-100 transition-colors">
                          <XCircle className="w-3.5 h-3.5" /> Reject
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </>
      )}
    </div>
  );
}
