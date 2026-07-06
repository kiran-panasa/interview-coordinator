import { formatDateShort } from "../../utils/dates";

export default function AdhocReviewTab({ adhocQs, pendingAdhoc, openApprove, handleReject }) {
  return (
    <div className="space-y-4">
      {adhocQs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-2 bg-white rounded-xl border border-gray-200">
          <svg className="w-10 h-10 text-gray-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
          <p className="text-sm text-gray-400">No questions in the review queue.</p>
        </div>
      ) : (
        <>
          <div className="flex gap-4 text-xs text-gray-500">
            <span><span className="inline-block w-2 h-2 rounded-full bg-amber-400 mr-1"></span>{pendingAdhoc.length} pending</span>
            <span><span className="inline-block w-2 h-2 rounded-full bg-emerald-400 mr-1"></span>{adhocQs.filter(q => q.status === "approved").length} approved</span>
            <span><span className="inline-block w-2 h-2 rounded-full bg-gray-300 mr-1"></span>{adhocQs.filter(q => q.status === "rejected").length} rejected</span>
          </div>
          {adhocQs.map(q => {
            const statusStyle = { pending: "border-amber-200 bg-amber-50/40", approved: "border-emerald-200 bg-emerald-50/30", rejected: "border-gray-200 bg-gray-50 opacity-60" }[q.status] || "border-gray-200 bg-white";
            const statusBadge = { pending: "bg-amber-100 text-amber-700", approved: "bg-emerald-100 text-emerald-700", rejected: "bg-gray-100 text-gray-500" }[q.status] || "bg-gray-100 text-gray-500";
            return (
              <div key={q.id} className={`rounded-xl border p-4 ${statusStyle}`}>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 leading-snug">{q.text}</p>
                    <div className="flex flex-wrap gap-2 mt-2 text-xs text-gray-400">
                      {q.interviewId && <span>Interview: <span className="font-mono text-gray-500">#{q.interviewId.slice(0, 8)}</span></span>}
                      {q.templateId  && <span>Template: <span className="font-mono text-gray-500">#{q.templateId.slice(0, 8)}</span></span>}
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
                          className="text-xs font-semibold text-white bg-emerald-600 px-3 py-1.5 rounded-lg hover:bg-emerald-700 transition-colors">
                          Approve
                        </button>
                        <button onClick={() => handleReject(q)}
                          className="text-xs font-semibold text-red-600 bg-red-50 border border-red-200 px-3 py-1.5 rounded-lg hover:bg-red-100 transition-colors">
                          Reject
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}
