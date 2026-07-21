import { motion } from "framer-motion";
import { Hourglass, LogOut } from "lucide-react";
import { signOut } from "firebase/auth";
import { auth } from "../../firebase";
import { useAuth } from "../../AuthContext";
import Button from "../../components/Button";

export default function PendingPage() {
  const { userProfile } = useAuth();
  return (
    <div className="min-h-screen bg-gradient-to-b from-brand-50/40 to-gray-50 flex items-center justify-center px-4">
      <motion.div
        initial={{ opacity: 0, y: 12, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
        className="max-w-md w-full text-center"
      >
        <div className="bg-white rounded-2xl shadow-card border border-gray-100 p-10">
          <div className="w-14 h-14 rounded-2xl bg-amber-50 flex items-center justify-center mx-auto mb-5">
            <Hourglass className="w-7 h-7 text-amber-500" strokeWidth={2} />
          </div>
          <h2 className="text-xl font-bold text-gray-900 tracking-tight mb-2">Awaiting Approval</h2>
          <p className="text-sm text-gray-500 mb-2">
            Your account <strong className="text-gray-700">{userProfile?.email}</strong> is pending admin approval.
          </p>
          <p className="text-sm text-gray-400 mb-8">
            You'll be able to log in once an admin assigns you a role. This usually takes a few minutes.
          </p>
          <Button variant="ghost" size="sm" icon={LogOut} onClick={() => signOut(auth)} className="mx-auto">
            Sign out
          </Button>
        </div>
      </motion.div>
    </div>
  );
}
