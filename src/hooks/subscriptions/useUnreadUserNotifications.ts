import { useState, useEffect } from "react";
import { subscribeToUnreadUserNotifications } from "../../api/firestore";
import type { AppNotification } from "../../types";

export function useUnreadUserNotifications(uid: string | undefined): AppNotification[] {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  useEffect(() => {
    if (!uid) return;
    return subscribeToUnreadUserNotifications(uid, setNotifications);
  }, [uid]);
  return notifications;
}
