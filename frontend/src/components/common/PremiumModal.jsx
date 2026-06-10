import { Crown, X, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

const FEATURE_DESCRIPTIONS = {
  "Exam Management":      "Create exams, set schedules, and track student performance in real time.",
  "Vehicle Tracking":     "Monitor school bus routes and track vehicles live on a map.",
  "Alumni Database":      "Access lifetime alumni records across all graduation years.",
};

const PremiumModal = ({ open, feature, onClose }) => {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      {/* Card */}
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-5">
        {/* Close */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors"
        >
          <X size={18} />
        </button>

        {/* Icon */}
        <div className="flex justify-center">
          <div className="h-16 w-16 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center">
            <Crown size={30} className="text-amber-500" />
          </div>
        </div>

        {/* Text */}
        <div className="text-center space-y-2">
          <p className="text-xs font-semibold text-amber-600 uppercase tracking-widest">
            Premium Feature
          </p>
          <h2 className="text-xl font-bold text-gray-900">{feature}</h2>
          <p className="text-sm text-gray-500 leading-relaxed">
            {FEATURE_DESCRIPTIONS[feature] ||
              "This feature is available on Premium plans."}
          </p>
        </div>

        {/* Plan comparison */}
        <div className="bg-gray-50 rounded-xl p-4 space-y-2">
          <div className="flex items-center gap-2 text-sm">
            <span className="h-5 w-5 rounded-full bg-gray-200 flex items-center justify-center text-xs text-gray-500">✕</span>
            <span className="text-gray-500">Free Plan — limited access</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="h-5 w-5 rounded-full bg-amber-100 flex items-center justify-center text-amber-600">
              <Sparkles size={11} />
            </span>
            <span className="font-medium text-gray-800">Premium Plan — full access to all features</span>
          </div>
        </div>

        {/* CTA */}
        <div className="space-y-2">
          <p className="text-xs text-center text-gray-400">
            Contact your super admin to upgrade your school's plan.
          </p>
          <Button className="w-full bg-amber-500 hover:bg-amber-600 text-white" onClick={onClose}>
            Got it
          </Button>
        </div>
      </div>
    </div>
  );
};

export default PremiumModal;
