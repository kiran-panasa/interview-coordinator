export const ROLE = {
  ADMIN:                "admin",
  INTERVIEWER:          "interviewer",
  INTERVIEWER_CONTENT:  "interviewer_content",
  CONTENT_TEAM:         "content_team",
};

export const ROLE_LABELS = {
  admin:                "Admin",
  interviewer:          "Interviewer",
  interviewer_content:  "Interviewer + Content",
  content_team:         "Content Team",
};

// Roles that have access to the /admin section
export const ADMIN_ROLES = [ROLE.ADMIN, ROLE.CONTENT_TEAM, ROLE.INTERVIEWER_CONTENT];

// Roles that see content management (templates, questions)
export const CONTENT_ROLES = [ROLE.ADMIN, ROLE.CONTENT_TEAM, ROLE.INTERVIEWER_CONTENT];
