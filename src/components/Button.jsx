import { motion } from "framer-motion";

const VARIANTS = {
  primary:   "bg-brand-600 text-white shadow-soft hover:bg-brand-700 disabled:bg-brand-300",
  secondary: "bg-white text-gray-700 border border-gray-200 hover:bg-gray-50 hover:border-gray-300 disabled:text-gray-300",
  ghost:     "bg-transparent text-gray-600 hover:bg-gray-100 disabled:text-gray-300",
  danger:    "bg-red-600 text-white shadow-soft hover:bg-red-700 disabled:bg-red-300",
};

const SIZES = {
  sm: "px-3 py-1.5 text-xs gap-1.5",
  md: "px-4 py-2 text-sm gap-2",
  lg: "px-5 py-2.5 text-sm gap-2",
};

export default function Button({
  variant = "primary",
  size = "md",
  icon: Icon,
  disabled,
  className = "",
  children,
  ...props
}) {
  return (
    <motion.button
      whileHover={disabled ? undefined : { scale: 1.015 }}
      whileTap={disabled ? undefined : { scale: 0.98 }}
      transition={{ duration: 0.12 }}
      disabled={disabled}
      className={`inline-flex items-center justify-center font-semibold rounded-xl transition-colors duration-150 disabled:cursor-not-allowed ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
      {...props}
    >
      {Icon && <Icon className={size === "sm" ? "w-3.5 h-3.5" : "w-4 h-4"} />}
      {children}
    </motion.button>
  );
}
