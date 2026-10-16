export const ROLE = {
  ADMIN:                "admin",
  INTERVIEWER:          "interviewer",
  INTERVIEWER_CONTENT:  "interviewer_content",
  CONTENT_TEAM:         "content_team",
  // Standalone role for someone with no other access in the app at all —
  // e.g. a vendor-side point of contact who isn't also an admin/interviewer.
  // An EXISTING admin/interviewer instead gets vendor access additively via
  // User.vendorContactFor (see types.ts) without their role ever changing —
  // this role value only exists for the brand-new-person case.
  VENDOR:                "vendor",
};

export const ROLE_LABELS = {
  admin:                "Admin",
  interviewer:          "Interviewer",
  interviewer_content:  "Interviewer + Content",
  content_team:         "Content Team",
  vendor:                "Vendor",
};

// Roles that have access to the /admin section
export const ADMIN_ROLES = [ROLE.ADMIN, ROLE.CONTENT_TEAM, ROLE.INTERVIEWER_CONTENT];

// Roles that see content management (templates, questions)
export const CONTENT_ROLES = [ROLE.ADMIN, ROLE.CONTENT_TEAM, ROLE.INTERVIEWER_CONTENT];

// Bootstrap admin — this account is always provisioned as admin on first sign-in
export const BOOTSTRAP_EMAIL = "kiran.p@nxtwave.tech";
