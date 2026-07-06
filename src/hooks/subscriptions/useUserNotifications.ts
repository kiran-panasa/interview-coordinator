import { useState, useEffect } from "react";
import { subscribeToUserNotifications } from "../../api/firestore";
import type { AppNotification } from "../../types";

export function useUserNotifications(uid: string | undefined): AppNotification[] {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  useEffect(() => {
    if (!uid) return;
    return subscribeToUserNotifications(uid, setNotifications);
  }, [uid]);
  return notifications;
}
