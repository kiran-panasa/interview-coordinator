import { db } from "../firebase";
import { collection, doc, getDocs, updateDoc, query, where } from "firebase/firestore";
import { createNotification } from "../api/firestore";
import { parseInterviewStart } from "../utils/dates";
import type { Interview } from "../types";

export async function checkAndSendFeedbackNudges(
  interviewerId: string,
  interviewerEmail: string
): Promise<void> {
  const now  = new Date();
  const hour = now.getHours();
  if (hour < 9 || hour >= 21) return;

  const snap = await getDocs(
    query(collection(db, "interviews"), where("interviewerEmail", "==", interviewerEmail))
  );
  const rows = snap.docs.map(d => ({ id: d.id, ...d.data() } as Interview));

  for (const iv of rows) {
    if (iv.status !== "scheduled") continue;
    if (iv.candidateJoined === false) continue;
    if (iv.feedback?.submittedAt)     continue;

    const start = parseInterviewStart(iv.scheduledDate, iv.scheduledTime);
    if (!start || start > now) continue;

    const cutoff = new Date(start.getTime() + 48 * 60 * 60 * 1000);
    if (now > cutoff) continue;

    if (iv.nextNudgeAt && new Date(iv.nextNudgeAt) > now) continue;

    await createNotification({
      type:           "feedback_reminder",
      recipientId:    interviewerId,
      recipientEmail: interviewerEmail,
      interviewId:    iv.id,
      candidateName:  iv.candidateName || "",
      message:        `Please submit your feedback for the interview with ${iv.candidateName || "the candidate"}.`,
      status:         "unread",
    });

    await updateDoc(doc(db, "interviews", iv.id), {
      nextNudgeAt: new Date(now.getTime() + 60 * 60 * 1000).toISOString(),
      nudgeCount:  (iv.nudgeCount || 0) + 1,
      updatedAt:   now.toISOString(),
    });
  }
}
