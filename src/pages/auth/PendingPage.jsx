import { signOut } from "firebase/auth";
import { auth } from "../../firebase";
import { useAuth } from "../../AuthContext";

export default function PendingPage() {
  const { userProfile } = useAuth();
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-10">
          <div className="text-5xl mb-4">⏳</div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Awaiting Approval</h2>
          <p className="text-sm text-gray-500 mb-2">
            Your account <strong>{userProfile?.email}</strong> is pending admin approval.
          </p>
          <p className="text-sm text-gray-400 mb-8">
            You'll be able to log in once an admin assigns you a role. This usually takes a few minutes.
          </p>
          <button onClick={() => signOut(auth)}
            className="text-sm text-indigo-600 font-medium hover:underline">
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
